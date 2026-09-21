import * as THREE from "three";
import {
  ENTITY_TICK_MS,
  ENTITY_TICK_TIMEOUT_MS,
  type CompactGameState,
  type EntityDecision,
  type EntityIntent,
} from "@liminal/shared";
import { requestEntity } from "../api.ts";
import { clamp, lerp } from "./math.ts";
import type { BuiltRoom } from "./rooms.ts";
import { doorWorldPos, resolveCutoffDoor } from "./rooms.ts";
import type { World } from "./world.ts";
import type { Player } from "./player.ts";

export class Entity {
  x = 8;
  z = 8;
  y = 1.05;
  roomId = "start";
  known = false;
  active = false;
  lastIntent: EntityIntent = "hold";
  lastAggression = 0.4;
  lastTick = 0;
  cutoffDoor: EntityDecision["cutoffDoor"] = "none";
  soundBait = false;
  private ticking = false;
  private targetX = 8;
  private targetZ = 8;
  private catchTimer = 0;
  private stingerReady = true;
  private walkPhase = 0;
  private twitch = 0;
  private baitPulse = 0;
  grace = 0;
  readonly group: THREE.Group;
  private torso: THREE.Mesh;
  private head: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;

  constructor() {
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0a08,
      roughness: 0.94,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88,
    });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.2), mat);
    this.torso.position.set(0, 1.28, 0);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 0.2), mat.clone());
    this.head.position.set(0, 1.98, 0.04);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.1), mat.clone());
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.82, 0.1), mat.clone());
    this.legL.position.set(-0.1, 0.42, 0);
    this.legR.position.set(0.1, 0.42, 0);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), mat.clone());
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), mat.clone());
    this.armL.position.set(-0.26, 1.2, 0.02);
    this.armR.position.set(0.26, 1.2, 0.02);
    this.group.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
    this.group.visible = false;
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  onNewRoom(room: BuiltRoom, player: Player): void {
    const d = room.decision;
    if (!d.entityPresent || d.entityBehavior === "absent") return;
    this.known = true;
    this.active = true;
    this.roomId = room.id;
    this.lastAggression = d.entityAggression;
    this.cutoffDoor = d.cutoffDoor;
    this.soundBait = d.soundBait;
    const awayX = -Math.sign(player.x - room.cx || 1);
    const awayZ = -Math.sign(player.z - room.cz || 1);
    if (d.entityBehavior === "mimic_door") {
      const door = resolveCutoffDoor(room, d.cutoffDoor === "none" ? "far" : d.cutoffDoor) ?? room.doors.find((item) => !item.fake);
      if (door) {
        const p = doorWorldPos(room, door);
        this.x = p.x;
        this.z = p.z;
      } else {
        this.x = room.cx + awayX * 3;
        this.z = room.cz + awayZ * 3;
      }
      this.lastIntent = "hold";
    } else if (d.entityBehavior === "ambush") {
      this.x = room.cx + awayX * Math.max(3.2, room.width * 0.32);
      this.z = room.cz + awayZ * Math.max(3.2, room.depth * 0.32);
      this.lastIntent = "hold";
    } else if (d.entityBehavior === "stalk") {
      this.x = player.x - awayX * 8;
      this.z = player.z - awayZ * 8;
      this.lastIntent = "hold";
    } else {
      this.x = room.cx + awayX * 3.5;
      this.z = room.cz + awayZ * 3.5;
      this.lastIntent = "chase";
    }
    this.targetX = this.x;
    this.targetZ = this.z;
    this.grace = 1.6;
  }

  distanceTo(player: Player): number {
    return Math.hypot(this.x - player.x, this.z - player.z);
  }

  los(world: World): boolean {
    return this.roomId === world.currentId;
  }

  hops(world: World): number {
    return world.hopsBetween(this.roomId, world.currentId);
  }

  lookingAt(player: Player): boolean {
    const fwd = player.forward();
    const dx = this.x - player.x;
    const dz = this.z - player.z;
    const mag = Math.hypot(dx, dz) || 1;
    return fwd.x * (dx / mag) + fwd.z * (dz / mag) > 0.55;
  }

  update(
    dt: number,
    player: Player,
    world: World,
    compact: CompactGameState,
    hooks: { onStinger: () => void; onBait: () => void; onStep: (muffled: boolean) => void },
  ): "ok" | "caught" {
    if (!this.active) {
      this.group.visible = false;
      if (world.roomsVisited >= 3 && !this.known) {
        this.known = true;
        this.active = true;
        this.roomId = world.currentId;
        this.x = player.x + 10;
        this.z = player.z - 8;
      }
      return "ok";
    }

    this.lastTick += dt * 1000;
    if (!this.ticking && this.lastTick >= ENTITY_TICK_MS) {
      this.lastTick = 0;
      this.ticking = true;
      void this.tick(compact, world, hooks).finally(() => {
        this.ticking = false;
      });
    }

    const alcove = world.current.alcove;
    const playerSafe = Boolean(alcove && player.x >= alcove.minX && player.x <= alcove.maxX && player.z >= alcove.minZ && player.z <= alcove.maxZ);
    this.applyIntent(player, world, playerSafe);

    const lit = player.flashlightOn && this.lookingAt(player);
    const speed =
      (0.55 + Math.min(this.lastAggression, 2.4) * 0.55) *
      (this.lastIntent === "chase" || this.lastIntent === "cut_off" ? 1 : 0.62) *
      (this.lastIntent === "bait" ? 0.15 : 1) *
      (lit ? 0.5 : 1) *
      (this.grace > 0 ? 0.35 : 1);
    const dx = this.targetX - this.x;
    const dz = this.targetZ - this.z;
    const mag = Math.hypot(dx, dz);
    if (mag > 0.05 && !playerSafe) {
      this.x += (dx / mag) * speed * dt;
      this.z += (dz / mag) * speed * dt;
      this.walkPhase += dt * (2.2 + speed);
      if (Math.sin(this.walkPhase * 2) > 0.92) hooks.onStep(!this.los(world));
    }

    const here = world.roomAt(this.x, this.z);
    if (here) this.roomId = here.id;

    this.twitch = Math.max(0, this.twitch - dt);
    if (this.twitch <= 0 && Math.random() < dt * 0.7) this.twitch = 0.08 + Math.random() * 0.12;
    const jerk = this.twitch > 0 ? (Math.random() - 0.5) * 0.08 : 0;
    this.group.position.set(this.x + jerk, 0, this.z + jerk * 0.4);
    const face = Math.atan2(player.x - this.x, player.z - this.z);
    this.group.rotation.y = face;
    this.legL.rotation.x = Math.sin(this.walkPhase) * 0.45;
    this.legR.rotation.x = Math.cos(this.walkPhase) * 0.45;
    this.armL.rotation.x = Math.cos(this.walkPhase) * 0.35;
    this.armR.rotation.x = Math.sin(this.walkPhase) * 0.35;
    this.head.rotation.z = Math.sin(this.walkPhase * 0.35) * 0.08 + jerk;
    const mimicking = world.current.decision.entityBehavior === "mimic_door" && this.distanceTo(player) > 4.2;
    this.group.scale.set(mimicking ? 0.55 : 1, mimicking ? 1.15 : 1, mimicking ? 0.22 : 1);

    const dist = this.distanceTo(player);
    const opacity = clamp(0.22 + (this.los(world) ? 0.38 : 0) + (lit ? 0.28 : 0) - dist * 0.018, 0.1, 0.96);
    for (const mesh of [this.torso, this.head, this.legL, this.legR, this.armL, this.armR]) {
      (mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
    }
    this.group.visible = dist < 22;

    if (dist < 5.5 && this.stingerReady && this.los(world)) {
      this.stingerReady = false;
      hooks.onStinger();
    }
    if (dist > 8) this.stingerReady = true;

    this.grace = Math.max(0, this.grace - dt);
    const catchR = 1.02 + player.fear * 0.004 + (player.flashlightOn ? 0 : 0.2);
    if (this.grace <= 0 && this.los(world) && dist < catchR && !playerSafe) {
      this.catchTimer += dt;
      if (this.catchTimer > 0.32) return "caught";
    } else {
      this.catchTimer = Math.max(0, this.catchTimer - dt);
    }
    return "ok";
  }

  private async tick(compact: CompactGameState, world: World, hooks: { onBait: () => void }): Promise<void> {
    const result = await requestEntity(compact, ENTITY_TICK_TIMEOUT_MS);
    world.callCount += 1;
    world.lastLatency = result.latencyMs;
    world.lastSource = result.source;
    if (result.warning) world.lastWarning = result.warning;
    if (result.source === "jev") world.jevCalls += 1;
    else world.fallbackCalls += 1;
    this.applyDecision(result.decision);
    if (this.soundBait) {
      this.baitPulse += 1;
      if (this.baitPulse % 3 === 1) hooks.onBait();
    }
  }

  applyDecision(decision: EntityDecision): void {
    this.lastIntent = decision.intent;
    this.lastAggression = decision.aggression;
    this.cutoffDoor = decision.cutoffDoor;
    this.soundBait = decision.soundBait;
  }

  private applyIntent(player: Player, world: World, playerSafe: boolean): void {
    if (playerSafe) {
      const room = world.current;
      this.targetX = room.cx;
      this.targetZ = room.cz;
      return;
    }
    const myRoom = world.rooms.get(this.roomId) ?? world.current;
    if (this.lastIntent === "hold" || this.lastIntent === "bait") {
      this.targetX = this.x;
      this.targetZ = this.z;
      return;
    }
    if (this.lastIntent === "cut_off") {
      const door = resolveCutoffDoor(world.current, this.cutoffDoor);
      if (door) {
        const p = doorWorldPos(world.current, door);
        this.targetX = p.x;
        this.targetZ = p.z;
        return;
      }
    }
    if (this.lastIntent === "hide") {
      const corner = myRoom.doors[0];
      if (corner) {
        const p = doorWorldPos(myRoom, corner);
        this.targetX = p.x;
        this.targetZ = p.z;
      } else {
        this.targetX = myRoom.cx;
        this.targetZ = myRoom.cz;
      }
      return;
    }
    if (this.lastIntent === "flank") {
      const door = resolveCutoffDoor(world.current, this.cutoffDoor) ?? world.current.doors[1] ?? world.current.doors[0];
      if (door) {
        const p = doorWorldPos(world.current, door);
        this.targetX = lerp(p.x, player.x, 0.25);
        this.targetZ = lerp(p.z, player.z, 0.25);
        return;
      }
    }
    if (this.roomId === world.currentId) {
      this.targetX = player.x;
      this.targetZ = player.z;
      return;
    }
    const step = world.doorToward(myRoom, world.currentId);
    if (step) {
      this.targetX = step.x;
      this.targetZ = step.z;
      if (Math.hypot(this.x - step.x, this.z - step.z) < 0.8) {
        const next = myRoom.doors.find((d) => d.connectedRoomId);
        if (next?.connectedRoomId) this.roomId = next.connectedRoomId;
      }
    } else {
      this.targetX = player.x;
      this.targetZ = player.z;
    }
  }
}
