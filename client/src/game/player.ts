import * as THREE from "three";
import { clamp, circleHitsAabb } from "./math.ts";
import type { World } from "./world.ts";
import type { Input } from "../input.ts";

export class Player {
  x = 0;
  y = 1.62;
  z = 0;
  yaw = 0;
  pitch = 0;
  radius = 0.3;
  flashlightOn = true;
  battery = 100;
  hasKeycard = false;
  lastNote: string | null = null;
  fear = 10;
  noise = 0.2;
  moving = false;
  sneak = false;
  readonly camera: THREE.PerspectiveCamera;
  readonly flashlight: THREE.SpotLight;
  readonly flashTarget: THREE.Object3D;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.flashlight = new THREE.SpotLight(0xfff1c2, 3.4, 16, 0.42, 0.55, 1.35);
    this.flashTarget = new THREE.Object3D();
    this.flashlight.target = this.flashTarget;
    camera.add(this.flashlight);
    camera.add(this.flashTarget);
    this.flashTarget.position.set(0, 0, -6);
    this.flashlight.position.set(0.12, -0.12, 0.1);
  }

  applyLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.002;
    this.pitch = clamp(this.pitch, -1.25, 1.25);
  }

  update(dt: number, input: Input, world: World): void {
    const look = input.consumeLook();
    this.applyLook(look.x, look.y);
    this.sneak = input.sneaking;

    let ix = input.stickX;
    let iz = -input.stickY;
    if (input.keys.has("w") || input.keys.has("arrowup")) iz += 1;
    if (input.keys.has("s") || input.keys.has("arrowdown")) iz -= 1;
    if (input.keys.has("a") || input.keys.has("arrowleft")) ix -= 1;
    if (input.keys.has("d") || input.keys.has("arrowright")) ix += 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }

    const speed = this.sneak ? 1.35 : 3.05;
    const slip = world.current.water && !this.sneak && Math.random() < dt * 0.7 ? 1.8 : 1;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = (ix * cos - iz * sin) * speed * dt * slip;
    const wishZ = (-ix * sin - iz * cos) * speed * dt * slip;

    let nx = this.x + wishX;
    let nz = this.z;
    if (this.blocked(world, nx, nz)) nx = this.x;
    nz = this.z + wishZ;
    if (this.blocked(world, nx, nz)) nz = this.z;
    this.x = nx;
    this.z = nz;
    this.moving = mag > 0.08;
    this.noise = this.moving ? (this.sneak ? 0.18 : 0.62) : 0.08;
    if (world.current.decision.hazard === "buzzing_overload") this.noise = Math.min(1, this.noise + 0.25);

    if (input.consumeFlashlight() && this.battery > 0) this.flashlightOn = !this.flashlightOn;
    if (this.battery <= 0) this.flashlightOn = false;
    if (this.flashlightOn) this.battery = Math.max(0, this.battery - dt * 3.6);

    this.camera.position.set(this.x, this.y, this.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    const fovTarget = 72 - this.fear * 0.22;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fovTarget, 4, dt);
    this.camera.updateProjectionMatrix();
    this.flashlight.intensity = this.flashlightOn ? 3.6 - this.fear * 0.012 : 0;
    this.flashlight.angle = 0.46 - this.fear * 0.0016;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private blocked(world: World, x: number, z: number): boolean {
    const boxes = [...world.collidersNear(x, z), ...world.blockedDoors()];
    return boxes.some((box) => circleHitsAabb(x, z, this.radius, box));
  }
}
