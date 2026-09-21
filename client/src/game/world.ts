import * as THREE from "three";
import {
  ROOM_PREFETCH_TIMEOUT_MS,
  fallbackRoomDecision,
  type CompactGameState,
  type EncounterCard,
  type GenerationSource,
  type RoomDecision,
  type RoomLogEntry,
} from "@liminal/shared";
import { requestRoom } from "../api.ts";
import { doorAwaitingDecision, doorGenerationTimedOut } from "./doors.ts";
import {
  aabbsOverlap,
  dist2,
  pointInAabb,
  type Aabb,
} from "./math.ts";
import {
  buildRoom,
  doorOutward,
  doorWorldPos,
  placeAgainstDoor,
  roomWorldBounds,
  sizeOf,
  startRoomDecision,
  type BuiltRoom,
  type Door,
  type Pickup,
} from "./rooms.ts";

export class World {
  readonly rooms = new Map<string, BuiltRoom>();
  readonly log: RoomLogEntry[] = [];
  currentId = "start";
  roomsVisited = 1;
  lastSource: GenerationSource = "fallback";
  lastLatency = 0;
  lastWarning: string | null = null;
  callCount = 0;
  jevCalls = 0;
  fallbackCalls = 0;
  exitChance = 0;
  roomsSinceEntity = 0;
  lastEncounter: EncounterCard = "none";
  private seq = 1;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const start = buildRoom({
      id: "start",
      decision: startRoomDecision(),
      cx: 0,
      cz: 0,
      yawTurns: 0,
      entryWorldWall: "s",
    });
    this.addRoom(start);
    this.log.push({
      depth: 1,
      roomId: "start",
      source: "fallback",
      decision: start.decision,
      latencyMs: 0,
    });
  }

  get current(): BuiltRoom {
    return this.rooms.get(this.currentId) ?? [...this.rooms.values()][0]!;
  }

  roomAt(x: number, z: number): BuiltRoom | null {
    for (const room of this.rooms.values()) {
      if (pointInAabb(x, z, room.bounds, -0.15)) return room;
    }
    return null;
  }

  collidersNear(x: number, z: number): Aabb[] {
    const out: Aabb[] = [];
    for (const room of this.rooms.values()) {
      if (dist2(x, z, room.cx, room.cz) < 40 * 40) out.push(...room.colliders);
    }
    return out;
  }

  blockedDoors(): Aabb[] {
    const extra: Aabb[] = [];
    for (const room of this.rooms.values()) {
      for (const door of room.doors) {
        const sealExit = door.isExit;
        const sealFake = door.fake || door.isFalseExit;
        const sealLocked = door.locked;
        const sealPending = !door.connectedRoomId && door.generation !== "ready" && !door.isExit && !door.fake;
        if (!sealExit && !sealPending && !sealFake && !sealLocked) continue;
        const pos = doorWorldPos(room, door);
        const out = doorOutward(room, door);
        extra.push({
          minX: pos.x + out.x * 0.42 - 0.6,
          maxX: pos.x + out.x * 0.42 + 0.6,
          minY: 0,
          maxY: 2.4,
          minZ: pos.z + out.z * 0.42 - 0.6,
          maxZ: pos.z + out.z * 0.42 + 0.6,
        });
      }
    }
    return extra;
  }

  nearestDoor(x: number, z: number): { room: BuiltRoom; door: Door; dist: number } | null {
    let best: { room: BuiltRoom; door: Door; dist: number } | null = null;
    for (const room of this.rooms.values()) {
      for (const door of room.doors) {
        const pos = doorWorldPos(room, door);
        const dist = Math.hypot(pos.x - x, pos.z - z);
        if (!best || dist < best.dist) best = { room, door, dist };
      }
    }
    return best;
  }

  nearestDoorIn(room: BuiltRoom, x: number, z: number): { door: Door; dist: number } | null {
    let best: { door: Door; dist: number } | null = null;
    for (const door of room.doors) {
      const pos = doorWorldPos(room, door);
      const dist = Math.hypot(pos.x - x, pos.z - z);
      if (!best || dist < best.dist) best = { door, dist };
    }
    return best;
  }

  findUnexploredDoor(fromId = this.currentId): { room: BuiltRoom; door: Door } | null {
    const start = this.rooms.get(fromId) ?? this.current;
    const queue: BuiltRoom[] = [start];
    const seen = new Set<string>([start.id]);
    while (queue.length) {
      const room = queue.shift()!;
      const open = room.doors.find(
        (door) => !door.connectedRoomId && !door.fake && !door.isFalseExit && !door.isExit && !door.locked,
      );
      if (open) return { room, door: open };
      for (const door of room.doors) {
        const nextId = door.connectedRoomId;
        if (!nextId || seen.has(nextId)) continue;
        const next = this.rooms.get(nextId);
        if (!next) continue;
        seen.add(nextId);
        queue.push(next);
      }
    }
    return null;
  }

  pickupNear(x: number, z: number): { room: BuiltRoom; pickup: Pickup } | null {
    for (const room of this.rooms.values()) {
      for (const pickup of room.pickups) {
        if (pickup.taken) continue;
        const wp = new THREE.Vector3();
        pickup.mesh.getWorldPosition(wp);
        if (Math.hypot(wp.x - x, wp.z - z) < 1.35) return { room, pickup };
      }
    }
    return null;
  }

  hopsBetween(fromId: string, toId: string): number {
    if (fromId === toId) return 0;
    const q: string[] = [fromId];
    const seen = new Set<string>([fromId]);
    let hops = 0;
    while (q.length) {
      const span = q.length;
      hops += 1;
      for (let i = 0; i < span; i += 1) {
        const id = q.shift()!;
        const room = this.rooms.get(id);
        if (!room) continue;
        for (const door of room.doors) {
          const next = door.connectedRoomId;
          if (!next || seen.has(next)) continue;
          if (next === toId) return hops;
          seen.add(next);
          q.push(next);
        }
      }
    }
    return 8;
  }

  doorToward(from: BuiltRoom, targetId: string): { x: number; z: number } | null {
    const q: string[] = [from.id];
    const prev = new Map<string, string | null>([[from.id, null]]);
    while (q.length) {
      const id = q.shift()!;
      if (id === targetId) break;
      const room = this.rooms.get(id);
      if (!room) continue;
      for (const door of room.doors) {
        const next = door.connectedRoomId;
        if (!next || prev.has(next)) continue;
        prev.set(next, id);
        q.push(next);
      }
    }
    let step = targetId;
    while (prev.get(step) && prev.get(step) !== from.id) step = prev.get(step)!;
    if (!prev.has(targetId)) {
      const any = from.doors[0];
      if (!any) return null;
      return doorWorldPos(from, any);
    }
    for (const door of from.doors) {
      if (door.connectedRoomId === step || door.connectedRoomId === targetId) return doorWorldPos(from, door);
    }
    const any = from.doors[0];
    return any ? doorWorldPos(from, any) : null;
  }

  updateLights(time: number, fear: number, dt = 0.016): void {
    for (const room of this.rooms.values()) {
      if (room.powerFlicker > 0) room.powerFlicker = Math.max(0, room.powerFlicker - dt);
      const near = room.id === this.currentId || this.hopsBetween(this.currentId, room.id) <= 1;
      for (const entry of room.lights) {
        entry.light.visible = near;
        if (!near) continue;
        const buzzing = room.decision.lighting === "flickering" || room.decision.hazard === "buzzing_overload";
        const drop = buzzing && Math.sin(time * 47 + entry.phase) > 0.91 ? 0.15 + Math.abs(Math.sin(time * 80)) * 0.35 : 1;
        const buzz = buzzing ? 0.72 + Math.abs(Math.sin(time * 19 + entry.phase)) * 0.28 : 1;
        const blackout = room.powerFlicker > 0 ? (room.powerFlicker > 1.4 ? 0.04 : 0.15 + Math.abs(Math.sin(time * 36)) * 0.55) : 1;
        const fearDim = 1 - fear * 0.0035;
        const here = room.id === this.currentId;
        const flicker = buzz * drop * blackout * fearDim * (here ? 1 : 0.42);
        entry.light.intensity = entry.base * flicker;
        entry.light.color.setHex(here ? 0xfff1b0 : 0x8fa0b4);
        const tube = entry.tube.material;
        if (tube instanceof THREE.MeshStandardMaterial && tube.emissiveIntensity !== undefined) {
          tube.emissiveIntensity = 0.25 + flicker * 1.35;
        }
      }
      for (const door of room.doors) {
        const pending = door.generation === "pending";
        const readyFresh = door.generation === "ready" && !door.connectedRoomId && !door.fake && !door.isExit;
        door.shimmer.visible = pending || readyFresh;
        door.glitch.visible = pending;
        if (pending) {
          (door.shimmer.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.abs(Math.sin(time * 18)) * 0.42;
          (door.glitch.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.abs(Math.sin(time * 41 + 1.2)) * 0.35;
          door.glitch.position.y = 1.07 + Math.sin(time * 22) * 0.05;
        } else if (readyFresh) {
          (door.shimmer.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.abs(Math.sin(time * 6)) * 0.08;
        }
      }
    }
  }

  async considerPrefetch(px: number, pz: number, compact: CompactGameState): Promise<void> {
    const here = this.current;
    for (const door of here.doors) {
      if (door.connectedRoomId || door.isExit) continue;
      const pos = doorWorldPos(here, door);
      const dist = Math.hypot(pos.x - px, pos.z - pz);
      if (dist > 7.2) continue;
      if (door.fake || door.locked || door.isFalseExit) continue;
      if (door.generation === "pending" && doorGenerationTimedOut(door.pendingSince, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
        this.finishWithFallback(here, door, compact, "Generation timed out — using fallback.");
        continue;
      }
      if (doorAwaitingDecision(door)) {
        door.generation = "pending";
        door.pendingSince = performance.now();
        this.prefetch(here, door, compact);
      }
    }
  }

  tryEnter(px: number, pz: number, compact: CompactGameState): {
    kind: "none" | "entered" | "waiting" | "exit" | "locked" | "fake";
    room?: BuiltRoom;
    waiting?: boolean;
  } {
    const global = this.nearestDoor(px, pz);
    const local = this.nearestDoorIn(this.current, px, pz);
    const hit =
      local && local.dist <= 1.15 && (!global || local.dist <= global.dist + 0.35)
        ? { room: this.current, door: local.door, dist: local.dist }
        : global;
    if (!hit || hit.dist > 1.15) return { kind: "none" };
    const { room, door } = hit;
    const out = doorOutward(room, door);
    const pos = doorWorldPos(room, door);
    const side = (px - pos.x) * out.x + (pz - pos.z) * out.z;
    // Allow crossing from just inside the jamb. The old 0.08 outward-only
    // check required walking through a still-sealed portal to start generation.
    if (side < -0.55) return { kind: "none" };

    if (door.fake || door.isFalseExit) return { kind: "fake" };

    if (door.locked) {
      if (compact.player.hasKeycard) {
        door.locked = false;
      } else {
        return { kind: "locked" };
      }
    }

    if (door.isExit) {
      if (compact.player.hasKeycard || compact.depth >= 12) return { kind: "exit" };
      return { kind: "locked" };
    }

    if (door.connectedRoomId) {
      this.currentId = door.connectedRoomId;
      return { kind: "entered", room: this.rooms.get(door.connectedRoomId) };
    }

    if (door.generation === "pending" && doorGenerationTimedOut(door.pendingSince, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
      this.finishWithFallback(room, door, compact, "Generation timed out — using fallback.");
    }

    if (door.decision) {
      try {
        const spawned = this.spawnFrom(room, door, door.decision, this.lastSource, this.lastLatency);
        return { kind: "entered", room: spawned ?? undefined };
      } catch {
        try {
          const fallback = fallbackRoomDecision(
            { ...compact, purpose: "room", portal: { id: door.id, fromArchetype: room.archetype, direction: door.worldWall } },
            door.id,
          );
          const spawned = this.spawnFrom(room, door, fallback, "fallback", this.lastLatency);
          return { kind: "entered", room: spawned ?? undefined };
        } catch {
          return { kind: "waiting", waiting: true };
        }
      }
    }

    if (doorAwaitingDecision(door) || door.generation === "idle") {
      door.generation = "pending";
      door.pendingSince = performance.now();
      this.prefetch(room, door, compact);
    }
    return { kind: "waiting", waiting: true };
  }

  private async prefetch(room: BuiltRoom, door: Door, compact: CompactGameState): Promise<void> {
    const state: CompactGameState = {
      ...compact,
      purpose: "room",
      portal: {
        id: door.id,
        fromArchetype: room.archetype,
        direction: door.worldWall,
      },
    };
    try {
      const result = await requestRoom(state, ROOM_PREFETCH_TIMEOUT_MS);
      if (door.connectedRoomId) return;
      if (!result?.decision) throw new Error("missing_decision");
      this.callCount += 1;
      this.lastLatency = result.latencyMs;
      this.lastSource = result.source;
      this.lastWarning = result.warning ?? null;
      if (result.source === "jev") this.jevCalls += 1;
      else this.fallbackCalls += 1;
      door.decision = result.decision;
      door.generation = "ready";
    } catch {
      if (door.connectedRoomId) return;
      this.finishWithFallback(room, door, compact, "Jev proxy unreachable — using fallback generation.");
    }
  }

  private finishWithFallback(
    room: BuiltRoom,
    door: Door,
    compact: CompactGameState,
    warning: string,
  ): void {
    if (door.connectedRoomId) {
      door.generation = "ready";
      return;
    }
    if (door.decision) {
      door.generation = "ready";
      return;
    }
    const state: CompactGameState = {
      ...compact,
      purpose: "room",
      portal: {
        id: door.id,
        fromArchetype: room.archetype,
        direction: door.worldWall,
      },
    };
    door.decision = fallbackRoomDecision(state, door.id);
    door.generation = "ready";
    this.lastSource = "fallback";
    this.lastWarning = warning;
    this.lastLatency = ROOM_PREFETCH_TIMEOUT_MS;
    this.fallbackCalls += 1;
    this.callCount += 1;
  }

  private spawnFrom(
    parent: BuiltRoom,
    parentDoor: Door,
    decision: RoomDecision,
    source: GenerationSource,
    latencyMs: number,
  ): BuiltRoom | null {
    const probe = doorWorldPos(parent, parentDoor);
    const out = doorOutward(parent, parentDoor);
    const look = { x: probe.x + out.x * 2.2, z: probe.z + out.z * 2.2 };
    const existing = this.roomAt(look.x, look.z);
    if (existing && existing.id !== parent.id) {
      parentDoor.connectedRoomId = existing.id;
      const back = existing.doors.find((d) => !d.connectedRoomId);
      if (back) back.connectedRoomId = parent.id;
      this.currentId = existing.id;
      return existing;
    }

    let place = placeAgainstDoor(parent, parentDoor, decision);
    const measure = sizeOf(decision.roomArchetype, decision.size);
    let guard = 0;
    while (guard < 5) {
      const bounds = roomWorldBounds(
        place.cx,
        place.cz,
        measure.w,
        measure.d,
        place.yawTurns * (Math.PI / 2),
      );
      const clash = [...this.rooms.values()].some((r) => r.id !== parent.id && aabbsOverlap(bounds, r.bounds));
      if (!clash) break;
      place = {
        ...place,
        cx: place.cx + out.x * 2.5,
        cz: place.cz + out.z * 2.5,
      };
      guard += 1;
    }

    const id = `r${this.seq}`;
    this.seq += 1;
    const spec = { id, cx: place.cx, cz: place.cz, yawTurns: place.yawTurns, entryWorldWall: place.entryWorldWall };
    let built: BuiltRoom;
    try {
      built = buildRoom({ ...spec, decision });
    } catch {
      built = buildRoom({ ...spec, decision: startRoomDecision() });
    }
    const entry = built.doors.find((d) => d.worldWall === place.entryWorldWall) ?? built.doors[0];
    if (entry) {
      entry.connectedRoomId = parent.id;
      entry.generation = "ready";
    }
    parentDoor.connectedRoomId = built.id;
    parentDoor.generation = "ready";
    this.addRoom(built);
    this.roomsVisited += 1;
    this.currentId = built.id;
    this.lastEncounter = decision.encounterCard;
    if (decision.advancesExit) {
      this.exitChance = Math.min(1, this.exitChance + 0.12 + decision.advancesExitNoul * 0.1);
    }
    this.roomsSinceEntity = decision.entityPresent ? 0 : this.roomsSinceEntity + 1;
    this.log.push({
      depth: this.roomsVisited,
      roomId: built.id,
      source,
      decision,
      latencyMs,
    });
    return built;
  }

  private addRoom(room: BuiltRoom): void {
    this.rooms.set(room.id, room);
    this.scene.add(room.group);
  }
}
