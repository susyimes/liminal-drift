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
import { doorWorldPos } from "./rooms.ts";
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
  private ticking = false;
  private targetX = 8;
  private targetZ = 8;
  private catchTimer = 0;
  private stingerReady = true;
  grace = 0;
  readonly group: THREE.Group;
  private body: THREE.Mesh;

  constructor() {
    this.group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: 0x0c0b09,
      transparent: true,
      opacity: 0.82,
    });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.45, 4, 8), mat);
    this.body.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.22), mat);
    head.position.set(0, 1.95, 0.02);
    this.group.add(this.body);
    this.group.add(head);
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
    const awayX = -Math.sign(player.x - room.cx || 1);
    const awayZ = -Math.sign(player.z - room.cz || 1);
    if (d.entityBehavior === "ambush") {
      this.x = room.cx + awayX * Math.max(3.2, room.width * 0.32);
      this.z = room.cz + awayZ * Math.max(3.2, room.depth * 0.32);
      this.targetX = this.x;
      this.targetZ = this.z;
    } else if (d.entityBehavior === "stalk") {
      this.x = player.x - awayX * 8;
      this.z = player.z - awayZ * 8;
    } else {
      this.x = room.cx + awayX * 3.5;
      this.z = room.cz + awayZ * 3.5;
    }
    this.grace = 1.6;
    this.lastIntent = d.entityBehavior === "stalk" ? "hold" : "chase";
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
    onStinger: () => void,
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
      void this.tick(compact, world).finally(() => {
        this.ticking = false;
      });
    }

    this.applyIntent(player, world);
    const lit = player.flashlightOn && this.lookingAt(player);
    const speed =
      (0.55 + Math.min(this.lastAggression, 2.4) * 0.55) *
      (this.lastIntent === "chase" ? 1 : 0.62) *
      (lit ? 0.5 : 1) *
      (this.grace > 0 ? 0.35 : 1);
    const dx = this.targetX - this.x;
    const dz = this.targetZ - this.z;
    const mag = Math.hypot(dx, dz);
    if (mag > 0.05) {
      this.x += (dx / mag) * speed * dt;
      this.z += (dz / mag) * speed * dt;
    }

    const here = world.roomAt(this.x, this.z);
    if (here) this.roomId = here.id;

    this.group.position.set(this.x, 0, this.z);
    const face = Math.atan2(player.x - this.x, player.z - this.z);
    this.group.rotation.y = face;
    const dist = this.distanceTo(player);
    const opacity = clamp(0.18 + (this.los(world) ? 0.35 : 0) + (lit ? 0.4 : 0) - dist * 0.02, 0.08, 0.95);
    (this.body.material as THREE.MeshLambertMaterial).opacity = opacity;
    this.group.visible = dist < 22;

    if (dist < 5.5 && this.stingerReady && this.los(world)) {
      this.stingerReady = false;
      onStinger();
    }
    if (dist > 8) this.stingerReady = true;

    this.grace = Math.max(0, this.grace - dt);
    const catchR = 1.02 + player.fear * 0.004 + (player.flashlightOn ? 0 : 0.2);
    if (this.grace <= 0 && this.los(world) && dist < catchR) {
      this.catchTimer += dt;
      if (this.catchTimer > 0.32) return "caught";
    } else {
      this.catchTimer = Math.max(0, this.catchTimer - dt);
    }
    return "ok";
  }

  private async tick(compact: CompactGameState, world: World): Promise<void> {
    const result = await requestEntity(compact, ENTITY_TICK_TIMEOUT_MS);
    world.callCount += 1;
    world.lastLatency = result.latencyMs;
    world.lastSource = result.source;
    if (result.warning) world.lastWarning = result.warning;
    if (result.source === "jev") world.jevCalls += 1;
    else world.fallbackCalls += 1;
    this.applyDecision(result.decision);
  }

  applyDecision(decision: EntityDecision): void {
    this.lastIntent = decision.intent;
    this.lastAggression = decision.aggression;
  }

  private applyIntent(player: Player, world: World): void {
    const myRoom = world.rooms.get(this.roomId) ?? world.current;
    if (this.lastIntent === "hold") {
      this.targetX = this.x;
      this.targetZ = this.z;
      return;
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
      const doors = world.current.doors;
      const pick = doors[1] ?? doors[0];
      if (pick) {
        const p = doorWorldPos(world.current, pick);
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
