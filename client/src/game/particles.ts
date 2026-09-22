import * as THREE from "three";
import { FOOTPRINT_LIFE_S, footprintOpacity, isPoolVibe, splashOpacity, splashScale } from "./directorFeel.ts";
import type { Player } from "./player.ts";
import { doorWorldPos } from "./rooms.ts";
import type { World } from "./world.ts";

function makePoints(count: number, color: number, size: number, opacity: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

type FadeDecal = { mesh: THREE.Mesh; age: number };

export class DriftParticles {
  readonly dust: THREE.Points;
  readonly portal: THREE.Points;
  private dustVel: Float32Array;
  private portalAge = 0;
  private prints: FadeDecal[] = [];
  private splashes: FadeDecal[] = [];
  private stepClock = 0;
  private lastX = 0;
  private lastZ = 0;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dust = makePoints(96, 0xe8d48a, 0.028, 0.22);
    this.portal = makePoints(36, 0xcfe6ff, 0.045, 0);
    this.dustVel = new Float32Array(96);
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 96; i += 1) {
      pos.setXYZ(i, (Math.random() - 0.5) * 10, Math.random() * 2.6, (Math.random() - 0.5) * 10);
      this.dustVel[i] = 0.04 + Math.random() * 0.08;
    }
    pos.needsUpdate = true;
    scene.add(this.dust, this.portal);
  }

  attach(scene: THREE.Scene): void {
    this.scene = scene;
    scene.add(this.dust, this.portal);
  }

  detach(scene: THREE.Scene): void {
    scene.remove(this.dust, this.portal);
    for (const item of this.prints) scene.remove(item.mesh);
    for (const item of this.splashes) scene.remove(item.mesh);
    this.prints = [];
    this.splashes = [];
  }

  update(dt: number, player: Player, world: World, waiting: boolean): void {
    const inTunnel = Boolean(world.transit);
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const pool = isPoolVibe(world.current.archetype, world.current.decision.lightingMood) ||
      world.transit?.tunnel.mood === "pool_pipe";
    for (let i = 0; i < 96; i += 1) {
      let x = pos.getX(i);
      let y = pos.getY(i) + (this.dustVel[i] ?? 0.05) * dt * (pool ? 0.35 : 1);
      let z = pos.getZ(i);
      const ceiling = pool ? 0.55 : 2.7;
      if (y > ceiling) y = pool ? 0.04 : 0.08;
      if (Math.hypot(x - player.x, z - player.z) > 7.5) {
        x = player.x + (Math.random() - 0.5) * 8;
        z = player.z + (Math.random() - 0.5) * 8;
        y = pool ? Math.random() * 0.42 : Math.random() * 2.4;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    const dustMat = this.dust.material as THREE.PointsMaterial;
    dustMat.color.setHex(pool ? 0xc8e8e4 : 0xe8d48a);
    dustMat.opacity = inTunnel ? 0.04 : player.flashlightOn ? (pool ? 0.16 : 0.26) : 0.14;
    dustMat.size = pool ? 0.042 : 0.028;
    this.dust.visible = !inTunnel;

    const hit = world.nearestDoor(player.x, player.z);
    const pending = Boolean(!inTunnel && waiting && hit && hit.door.generation === "pending");
    const portalMat = this.portal.material as THREE.PointsMaterial;
    portalMat.opacity = pending ? 0.38 : 0;
    this.portal.visible = pending;
    if (pending && hit) {
      this.portalAge += dt;
      const origin = doorWorldPos(hit.room, hit.door);
      const ppos = this.portal.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 36; i += 1) {
        const a = i * 0.7 + this.portalAge * 4;
        ppos.setXYZ(
          i,
          origin.x + Math.sin(a) * 0.35,
          0.4 + ((i * 0.19 + this.portalAge) % 2.1),
          origin.z + Math.cos(a * 1.3) * 0.35,
        );
      }
      ppos.needsUpdate = true;
    }

    this.tickDecals(dt, player, pool || world.current.water);
  }

  private tickDecals(dt: number, player: Player, wet: boolean): void {
    const moved = Math.hypot(player.x - this.lastX, player.z - this.lastZ);
    this.stepClock += player.moving ? dt : 0;
    if (wet && player.moving && this.stepClock > 0.38 && moved > 0.12) {
      this.stepClock = 0;
      this.lastX = player.x;
      this.lastZ = player.z;
      this.spawnPrint(player.x, player.z, player.yaw);
      this.spawnSplash(player.x, player.z);
    }
    this.prints = this.prints.filter((item) => {
      item.age += dt;
      const op = footprintOpacity(item.age);
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = op;
      if (op <= 0) {
        this.scene.remove(item.mesh);
        return false;
      }
      return true;
    });
    this.splashes = this.splashes.filter((item) => {
      item.age += dt;
      const op = splashOpacity(item.age);
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = op;
      const s = splashScale(item.age);
      item.mesh.scale.set(s, s, 1);
      if (op <= 0) {
        this.scene.remove(item.mesh);
        return false;
      }
      return true;
    });
  }

  private spawnPrint(x: number, z: number, yaw: number): void {
    if (this.prints.length > 10) {
      const old = this.prints.shift();
      if (old) this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.26),
      new THREE.MeshBasicMaterial({
        color: 0x4a5552,
        transparent: true,
        opacity: footprintOpacity(0),
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = yaw;
    mesh.position.set(x, 0.022, z);
    this.scene.add(mesh);
    this.prints.push({ mesh, age: 0 });
  }

  private spawnSplash(x: number, z: number): void {
    if (this.splashes.length > 6) {
      const old = this.splashes.shift();
      if (old) this.scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.12, 16),
      new THREE.MeshBasicMaterial({
        color: 0x8ec8b8,
        transparent: true,
        opacity: splashOpacity(0),
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    this.scene.add(mesh);
    this.splashes.push({ mesh, age: 0 });
  }
}
