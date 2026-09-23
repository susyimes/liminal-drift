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
import { connectedDoorShouldEnter, doorAwaitingDecision, doorNeedsForcedFallback, doorShouldBlock } from "./doors.ts";
import {
  DOOR_SHIMMER_NEAR,
  doorFrameHex,
  doorGlitchOpacity,
  doorShimmerOpacity,
  doorVeilHex,
  doorVeilOpacity,
  lightHexForMood,
  startGuideMul,
  tubeFlickerMul,
} from "./lighting.ts";
import {
  aabbsOverlap,
  dist2,
  pickContainedRoom,
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
import { inferTunnelMood, tunnelProgress, tunnelReachedExit } from "./transit.ts";
import { buildTunnel, tintTunnelSpeck, updateTunnelLights, type BuiltTunnel } from "./tunnel.ts";
import { tunnelLengthFor } from "./directorFeel.ts";

export type PortalKind = "none" | "entered" | "waiting" | "exit" | "locked" | "fake" | "tunnel";

export type PortalResult = {
  kind: PortalKind;
  room?: BuiltRoom;
  tunnel?: BuiltTunnel;
  waiting?: boolean;
};

export type Transit = {
  tunnel: BuiltTunnel;
  parent: BuiltRoom;
  door: Door;
  startedAt: number;
  dest: BuiltRoom | null;
};

export class World {
  readonly rooms = new Map<string, BuiltRoom>();
  readonly tunnels: BuiltTunnel[] = [];
  transit: Transit | null = null;
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
  /** Playtest hook: skip in-flight Jev so step wall-clock is wait+walk only. */
  prefetchEnabled = true;
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
    return pickContainedRoom(this.rooms.values(), this.currentId, x, z);
  }

  collidersNear(x: number, z: number): Aabb[] {
    const out: Aabb[] = [];
    for (const room of this.rooms.values()) {
      if (dist2(x, z, room.cx, room.cz) < 40 * 40) out.push(...room.colliders);
    }
    for (const tunnel of this.tunnels) {
      if (dist2(x, z, tunnel.cx, tunnel.cz) < 40 * 40) out.push(...tunnel.colliders);
    }
    return out;
  }

  blockedDoors(): Aabb[] {
    const extra: Aabb[] = [];
    for (const room of this.rooms.values()) {
      for (const door of room.doors) {
        const inThisTransit = this.transit?.door.id === door.id;
        if (!doorShouldBlock(door, inThisTransit)) continue;
        const pos = doorWorldPos(room, door);
        const out = doorOutward(room, door);
        extra.push({
          minX: pos.x + out.x * 0.95 - 0.45,
          maxX: pos.x + out.x * 0.95 + 0.45,
          minY: 0,
          maxY: 2.4,
          minZ: pos.z + out.z * 0.95 - 0.45,
          maxZ: pos.z + out.z * 0.95 + 0.45,
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

  updateLights(time: number, fear: number, dt = 0.016, px = 0, pz = 0): void {
    for (const room of this.rooms.values()) {
      if (room.powerFlicker > 0) room.powerFlicker = Math.max(0, room.powerFlicker - dt);
      const near = room.id === this.currentId || this.hopsBetween(this.currentId, room.id) <= 1;
      const here = room.id === this.currentId;
      const buzzing = room.decision.lighting === "flickering" || room.decision.hazard === "buzzing_overload";
      for (const entry of room.lights) {
        if (entry.light.visible !== near) entry.light.visible = near;
        if (!near) continue;
        const flicker = tubeFlickerMul({
          buzzing,
          powerFlicker: room.powerFlicker,
          time,
          phase: entry.phase,
          fear,
          here,
        });
        entry.light.intensity = entry.base * flicker;
        const mood =
          room.archetype === "poolcore" ? "humid_teal" : room.decision.lightingMood ?? "sick_yellow";
        entry.light.color.setHex(lightHexForMood(mood, here));
        const tube = entry.tube.material;
        if (tube instanceof THREE.MeshStandardMaterial && tube.emissiveIntensity !== undefined) {
          tube.emissiveIntensity = 0.55 + flicker * 0.7;
        }
      }
      for (const door of room.doors) {
        const connected = Boolean(door.connectedRoomId);
        const pending = !connected && door.generation === "pending";
        const pos = doorWorldPos(room, door);
        const close = Math.hypot(pos.x - px, pos.z - pz) < DOOR_SHIMMER_NEAR;
        const showPending = pending && close;
        if (door.shimmer.visible !== showPending) door.shimmer.visible = showPending;
        if (door.glitch.visible !== showPending) door.glitch.visible = showPending;
        if (showPending) {
          (door.shimmer.material as THREE.MeshBasicMaterial).opacity = doorShimmerOpacity("pending", time);
          (door.glitch.material as THREE.MeshBasicMaterial).opacity = doorGlitchOpacity(time);
          door.glitch.position.y = 1.07 + Math.sin(time * 1.9) * 0.012;
        }
        const markable = !door.fake && !door.isFalseExit && !door.isExit && !door.locked;
        const veilOpacity = markable ? doorVeilOpacity(connected) : 0;
        if (door.veil.visible !== veilOpacity > 0) door.veil.visible = veilOpacity > 0;
        const veilMat = door.veil.material as THREE.MeshBasicMaterial;
        veilMat.opacity = veilOpacity;
        if (markable) {
          const veilHex = doorVeilHex(connected);
          if (veilMat.color.getHex() !== veilHex) veilMat.color.setHex(veilHex);
          const hex = doorFrameHex(connected);
          for (const frame of door.frames) {
            const mat = frame.material as THREE.MeshStandardMaterial;
            if (mat.color.getHex() !== hex) mat.color.setHex(hex);
          }
        }
      }
      if (room.guideLight) {
        const stillOpen = room.doors.some((door) => !door.connectedRoomId && !door.fake && !door.isFalseExit);
        room.guideLight.visible = here && stillOpen;
        room.guideLight.intensity = stillOpen ? room.guideBase * startGuideMul(time) : 0;
      }
    }
    for (const tunnel of this.tunnels) updateTunnelLights(tunnel, time, performance.now());
    for (const room of this.rooms.values()) {
      for (const puddle of room.puddles) {
        const mat = puddle.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.opacity = 0.34 + Math.sin(time * 0.55 + puddle.position.x) * 0.04;
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
      if (doorNeedsForcedFallback(door, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
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

  tryEnter(px: number, pz: number, compact: CompactGameState): PortalResult {
    const global = this.nearestDoor(px, pz);
    const local = this.nearestDoorIn(this.current, px, pz);
    const hit =
      local && local.dist <= 1.35 && (!global || local.dist <= global.dist + 0.35)
        ? { room: this.current, door: local.door, dist: local.dist }
        : global;
    if (!hit || hit.dist > 1.35) return { kind: "none" };
    const { room, door } = hit;
    const out = doorOutward(room, door);
    const pos = doorWorldPos(room, door);
    const side = (px - pos.x) * out.x + (pz - pos.z) * out.z;
    // Near a doorway is enough. Requiring the player to step through the
    // shimmer/seal made ready fallback doors look painted shut (DEPTH stuck at 1).
    if (side < -1.25) return { kind: "none" };

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
      if (!connectedDoorShouldEnter(this.currentId, room.id, door.connectedRoomId, side)) {
        return { kind: "none" };
      }
      this.currentId = door.connectedRoomId;
      return { kind: "entered", room: this.rooms.get(door.connectedRoomId) };
    }

    if (doorNeedsForcedFallback(door, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
      this.finishWithFallback(room, door, compact, "Generation timed out — using fallback.");
    }

    if (this.transit && this.transit.door.id === door.id) {
      return { kind: "tunnel", tunnel: this.transit.tunnel };
    }

    if (door.decision || doorAwaitingDecision(door) || door.generation === "idle" || door.generation === "pending") {
      return this.beginTransit(room, door, compact);
    }
    return { kind: "waiting", waiting: true };
  }

  /** If the player walked through a ready jamb into the void, still spawn. */
  rescueOutside(px: number, pz: number, compact: CompactGameState): PortalResult {
    const hit = this.nearestDoor(px, pz);
    if (!hit || hit.dist > 2.4) return { kind: "none" };
    const { room, door } = hit;
    if (door.fake || door.isFalseExit || door.isExit || door.locked) return { kind: "none" };
    if (door.connectedRoomId) {
      const out = doorOutward(room, door);
      const pos = doorWorldPos(room, door);
      const side = (px - pos.x) * out.x + (pz - pos.z) * out.z;
      if (!connectedDoorShouldEnter(this.currentId, room.id, door.connectedRoomId, side)) {
        return { kind: "none" };
      }
      this.currentId = door.connectedRoomId;
      return { kind: "entered", room: this.rooms.get(door.connectedRoomId) };
    }
    if (doorNeedsForcedFallback(door, performance.now(), ROOM_PREFETCH_TIMEOUT_MS) || !door.decision) {
      this.finishWithFallback(room, door, compact, "Generation timed out — using fallback.");
    }
    if (this.transit && this.transit.door.id === door.id) {
      return { kind: "tunnel", tunnel: this.transit.tunnel };
    }
    return this.beginTransit(room, door, compact);
  }

  beginTransit(parent: BuiltRoom, door: Door, compact: CompactGameState): PortalResult {
    if (door.connectedRoomId) {
      this.currentId = door.connectedRoomId;
      return { kind: "entered", room: this.rooms.get(door.connectedRoomId) };
    }
    if (this.transit && this.transit.door.id === door.id) {
      return { kind: "tunnel", tunnel: this.transit.tunnel };
    }

    if (doorAwaitingDecision(door) || door.generation === "idle") {
      door.generation = "pending";
      door.pendingSince = performance.now();
      this.prefetch(parent, door, compact);
    } else if (door.generation === "pending" && !door.decision) {
      if (doorNeedsForcedFallback(door, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
        this.finishWithFallback(parent, door, compact, "Generation timed out — using fallback.");
      }
    }

    const existing = this.tunnels.find((item) => item.parentDoorId === door.id);
    const length = tunnelLengthFor(door.decision?.roomArchetype, door.decision?.tunnelLength);
    const mood =
      door.decision?.tunnelMood ??
      inferTunnelMood(parent.archetype, door.decision?.roomArchetype ?? null);
    const tunnel =
      existing ??
      buildTunnel({
        id: `t-${door.id}`,
        parent,
        door,
        length,
        mood,
        destArchetype: door.decision?.roomArchetype ?? null,
      });
    if (!existing) {
      this.tunnels.push(tunnel);
      this.scene.add(tunnel.group);
    }
    tunnel.litAt = performance.now();
    tintTunnelSpeck(tunnel, door.decision?.roomArchetype, door.decision?.lightingMood ?? mood);
    this.transit = {
      tunnel,
      parent,
      door,
      startedAt: performance.now(),
      dest: null,
    };
    return { kind: "tunnel", tunnel };
  }

  advanceTransit(px: number, pz: number, compact: CompactGameState): PortalResult {
    const active = this.transit;
    if (!active) return { kind: "none" };

    if (!active.door.decision) {
      this.nudgeTransitDecision(compact);
    }

    const atExit = tunnelReachedExit(active.tunnel, px, pz);
    const backInParent = pickContainedRoom([active.parent], active.parent.id, px, pz, -0.2);
    if (backInParent && tunnelProgress(active.tunnel, px, pz) < 0.1) {
      this.transit = null;
      return { kind: "none" };
    }
    if (active.door.decision) {
      tintTunnelSpeck(
        active.tunnel,
        active.door.decision.roomArchetype,
        active.door.decision.lightingMood ?? active.tunnel.mood,
      );
    }
    if (!atExit) {
      if (active.door.generation === "pending" && !active.door.decision) {
        return { kind: "tunnel", tunnel: active.tunnel, waiting: true };
      }
      return { kind: "tunnel", tunnel: active.tunnel };
    }

    const dest = this.ensureTransitDestination(compact);
    if (!dest) return { kind: "waiting", waiting: true, tunnel: active.tunnel };
    this.transit = null;
    active.tunnel.farVeil.visible = false;
    this.currentId = dest.id;
    return { kind: "entered", room: dest };
  }

  /** Prefetch or timeout-fallback. Does not start the throat walk. */
  nudgeTransitDecision(compact: CompactGameState): void {
    const active = this.transit;
    if (!active || active.door.decision) return;
    if (doorNeedsForcedFallback(active.door, performance.now(), ROOM_PREFETCH_TIMEOUT_MS)) {
      this.finishWithFallback(active.parent, active.door, compact, "Generation timed out — using fallback.");
      return;
    }
    if (active.door.generation !== "pending") {
      active.door.generation = "pending";
      active.door.pendingSince = active.startedAt;
      this.prefetch(active.parent, active.door, compact);
    }
  }

  /**
   * Decision is ready (Jev or fallback) and the throat matches it.
   * Does not spawn the dest room — that happens at land so DEPTH ticks then.
   */
  readyTransitDestination(compact: CompactGameState): boolean {
    const active = this.transit;
    if (!active) return false;
    if (active.dest) return true;
    if (!active.door.decision) this.nudgeTransitDecision(compact);
    if (!active.door.decision) return false;
    this.syncTransitToDecision();
    return true;
  }

  /**
   * Instrumented / force-complete path: dest is ready now via sync fallback.
   * Does not wait for Jev. Leaves an existing decision alone so late prefetch
   * cannot rebuild the throat mid-walk.
   */
  forceReadyTransitDestination(compact: CompactGameState): boolean {
    const active = this.transit;
    if (!active) return false;
    if (active.dest) return true;
    if (!active.door.decision) {
      this.finishWithFallback(active.parent, active.door, compact, "Instrumented step — sync fallback.");
    }
    if (!active.door.decision) return false;
    this.syncTransitToDecision();
    return true;
  }

  private syncTransitToDecision(): void {
    const active = this.transit;
    const decision = active?.door.decision;
    if (!active || !decision) return;
    const length = tunnelLengthFor(decision.roomArchetype, decision.tunnelLength);
    const mood =
      decision.tunnelMood ?? inferTunnelMood(active.parent.archetype, decision.roomArchetype);
    tintTunnelSpeck(active.tunnel, decision.roomArchetype, decision.lightingMood ?? mood);
    if (active.tunnel.lengthKind === length && active.tunnel.mood === mood) return;

    const existingIdx = this.tunnels.indexOf(active.tunnel);
    this.scene.remove(active.tunnel.group);
    if (existingIdx >= 0) this.tunnels.splice(existingIdx, 1);
    const tunnel = buildTunnel({
      id: active.tunnel.id,
      parent: active.parent,
      door: active.door,
      length,
      mood,
      destArchetype: decision.roomArchetype,
    });
    tunnel.litAt = active.tunnel.litAt || performance.now();
    this.tunnels.push(tunnel);
    this.scene.add(tunnel.group);
    active.tunnel = tunnel;
  }

  forceCompleteTransit(compact: CompactGameState): BuiltRoom | null {
    if (!this.transit) return null;
    const dest = this.ensureTransitDestination(compact);
    if (dest) {
      this.transit.tunnel.farVeil.visible = false;
      this.transit = null;
      this.currentId = dest.id;
    }
    return dest;
  }

  detachFromScene(): void {
    for (const room of this.rooms.values()) this.scene.remove(room.group);
    for (const tunnel of this.tunnels) this.scene.remove(tunnel.group);
  }

  private ensureTransitDestination(compact: CompactGameState): BuiltRoom | null {
    const active = this.transit;
    if (!active) return null;
    if (active.dest) return active.dest;
    if (active.door.connectedRoomId) {
      const already = this.rooms.get(active.door.connectedRoomId);
      if (already) {
        active.dest = already;
        return already;
      }
    }
    if (!active.door.decision) {
      this.finishWithFallback(active.parent, active.door, compact, "Generation timed out — using fallback.");
    }
    const decision = active.door.decision;
    if (!decision) return null;
    try {
      const spawned = this.spawnFrom(
        active.parent,
        active.door,
        decision,
        this.lastSource,
        this.lastLatency,
        active.tunnel.length,
      );
      active.dest = spawned;
      return spawned;
    } catch {
      const fallback = fallbackRoomDecision(
        {
          ...compact,
          purpose: "room",
          portal: { id: active.door.id, fromArchetype: active.parent.archetype, direction: active.door.worldWall },
        },
        active.door.id,
      );
      const spawned = this.spawnFrom(active.parent, active.door, fallback, "fallback", this.lastLatency, active.tunnel.length);
      active.dest = spawned;
      return spawned;
    }
  }

  private async prefetch(room: BuiltRoom, door: Door, compact: CompactGameState): Promise<void> {
    if (!this.prefetchEnabled) {
      if (!door.decision && !door.connectedRoomId) {
        this.finishWithFallback(room, door, compact, "Instrumented step — sync fallback.");
      }
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
    try {
      const result = await requestRoom(state, ROOM_PREFETCH_TIMEOUT_MS);
      if (door.connectedRoomId) return;
      // Late Jev must not overwrite a dest already locked for the throat walk.
      if (door.decision) {
        door.generation = "ready";
        return;
      }
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
      // Always settle in finally — a hung/aborted decide must not leave pending.
    } finally {
      if (door.connectedRoomId) {
        door.generation = "ready";
      } else if (door.generation !== "ready" || !door.decision) {
        this.finishWithFallback(room, door, compact, "Jev proxy unreachable — using fallback generation.");
      }
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
    extraGap = 0,
  ): BuiltRoom | null {
    const probe = doorWorldPos(parent, parentDoor);
    const out = doorOutward(parent, parentDoor);
    const lookDist = extraGap > 0.5 ? extraGap + 1.1 : 2.2;
    const look = { x: probe.x + out.x * lookDist, z: probe.z + out.z * lookDist };
    const existing = this.roomAt(look.x, look.z);
    if (existing && existing.id !== parent.id) {
      parentDoor.connectedRoomId = existing.id;
      const back = existing.doors.find((d) => !d.connectedRoomId);
      if (back) back.connectedRoomId = parent.id;
      this.currentId = existing.id;
      return existing;
    }

    let place = placeAgainstDoor(parent, parentDoor, decision, extraGap);
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
