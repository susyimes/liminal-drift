import * as THREE from "three";
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

export class DriftParticles {
  readonly dust: THREE.Points;
  readonly portal: THREE.Points;
  private dustVel: Float32Array;
  private portalAge = 0;

  constructor(scene: THREE.Scene) {
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
    scene.add(this.dust, this.portal);
  }

  detach(scene: THREE.Scene): void {
    scene.remove(this.dust, this.portal);
  }

  update(dt: number, player: Player, world: World, waiting: boolean): void {
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 96; i += 1) {
      let x = pos.getX(i);
      let y = pos.getY(i) + (this.dustVel[i] ?? 0.05) * dt;
      let z = pos.getZ(i);
      if (y > 2.7) y = 0.08;
      if (Math.hypot(x - player.x, z - player.z) > 7.5) {
        x = player.x + (Math.random() - 0.5) * 8;
        z = player.z + (Math.random() - 0.5) * 8;
        y = Math.random() * 2.4;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    const dustMat = this.dust.material as THREE.PointsMaterial;
    dustMat.opacity = player.flashlightOn ? 0.26 : 0.14;

    const hit = world.nearestDoor(player.x, player.z);
    const pending = Boolean(waiting && hit && hit.door.generation === "pending");
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
  }
}
