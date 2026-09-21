import * as THREE from "three";
import { clamp, circleHitsAabb, pointInAabb } from "./math.ts";
import { tex } from "./textures.ts";
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
  notesFound = 0;
  fear = 10;
  noise = 0.2;
  moving = false;
  sneak = false;
  speedMul = 1;
  punch = 0;
  bob = 0;
  readonly camera: THREE.PerspectiveCamera;
  readonly flashlight: THREE.SpotLight;
  readonly flashFill: THREE.SpotLight;
  readonly flashTarget: THREE.Object3D;
  readonly beam: THREE.Mesh;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.flashlight = new THREE.SpotLight(0xfff1c2, 28, 18, 0.36, 0.48, 1.55);
    this.flashFill = new THREE.SpotLight(0xffe7a8, 6, 10, 0.72, 0.72, 1.8);
    this.flashTarget = new THREE.Object3D();
    this.flashlight.target = this.flashTarget;
    this.flashFill.target = this.flashTarget;
    camera.add(this.flashlight);
    camera.add(this.flashFill);
    camera.add(this.flashTarget);
    this.flashTarget.position.set(0, 0, -8);
    this.flashlight.position.set(0.14, -0.16, 0.08);
    this.flashFill.position.set(0.1, -0.12, 0.04);

    const beamMat = new THREE.MeshBasicMaterial({
      map: tex.cone,
      color: 0xfff1c2,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1.55, 9.2, 28, 1, true), beamMat);
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.position.set(0.12, -0.14, -4.6);
    camera.add(this.beam);
  }

  applyLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.002;
    this.pitch = clamp(this.pitch, -1.25, 1.25);
  }

  inAlcove(world: World): boolean {
    return Boolean(world.current.alcove && pointInAabb(this.x, this.z, world.current.alcove));
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

    this.speedMul = world.current.water && world.current.decision.encounterCard === "flooded_slow_zone" ? 0.62 : 1;
    const slip = world.current.water && !this.sneak && Math.random() < dt * 0.7 ? 1.8 : 1;
    const speed = (this.sneak ? 1.35 : 3.05) * this.speedMul;
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
    const drain = 3.2 + world.current.decision.fearIntensity * 1.15;
    if (this.flashlightOn) this.battery = Math.max(0, this.battery - dt * drain);

    this.bob += dt * (this.moving ? (this.sneak ? 6.2 : 9.4) : 0);
    const bobAmt = this.moving ? (this.sneak ? 0.012 : 0.034) : 0;
    const bobY = Math.sin(this.bob) * bobAmt;
    const bobX = Math.cos(this.bob * 0.5) * bobAmt * 0.35;
    this.punch = Math.max(0, this.punch - dt * 3.2);
    const kick = this.punch * Math.sin(performance.now() * 0.04);

    this.camera.position.set(this.x + bobX, this.y + bobY, this.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw + kick * 0.35;
    this.camera.rotation.x = this.pitch + kick * 0.55;
    const fearFov = 71 + this.fear * 0.05 - (this.flashlightOn ? 0 : 1.5);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, clamp(fearFov, 66, 80), 4, dt);
    this.camera.updateProjectionMatrix();
    this.flashlight.intensity = this.flashlightOn ? 26 - this.fear * 0.06 : 0;
    this.flashFill.intensity = this.flashlightOn ? 5.2 : 0;
    this.flashlight.angle = 0.34 + (1 - this.battery / 100) * 0.08;
    this.beam.visible = this.flashlightOn;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = this.flashlightOn ? 0.1 + (this.battery / 100) * 0.04 : 0;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private blocked(world: World, x: number, z: number): boolean {
    const boxes = [...world.collidersNear(x, z), ...world.blockedDoors()];
    return boxes.some((box) => circleHitsAabb(x, z, this.radius, box));
  }
}
