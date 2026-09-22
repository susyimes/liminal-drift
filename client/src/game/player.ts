import * as THREE from "three";
import { clamp, circleHitsAabb, firstFreePoint, pointInAabb } from "./math.ts";
import { tex } from "./textures.ts";
import { walkIntent, type Input } from "../input.ts";
import type { World } from "./world.ts";
import { EYE_YELLOW } from "./directorFeel.ts";

export type FeelOpts = {
  locked?: boolean;
  speedEase?: number;
  strafeMul?: number;
  eyeY?: number;
  pitchAdd?: number;
  yawAdd?: number;
  fov?: number | null;
  bobMul?: number;
  shakeMul?: number;
  smear?: number;
  beamMul?: number;
};

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
  readonly smear: THREE.Mesh;

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

    const smearCanvas = document.createElement("canvas");
    smearCanvas.width = 64;
    smearCanvas.height = 256;
    const sctx = smearCanvas.getContext("2d");
    if (sctx) {
      const grad = sctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(214, 226, 222, 0)");
      grad.addColorStop(0.5, "rgba(214, 226, 222, 0.4)");
      grad.addColorStop(1, "rgba(214, 226, 222, 0)");
      sctx.fillStyle = grad;
      sctx.fillRect(28, 0, 8, 256);
    }
    const smearTex = new THREE.CanvasTexture(smearCanvas);
    this.smear = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 1.35),
      new THREE.MeshBasicMaterial({
        map: smearTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.smear.position.set(0, -0.08, -0.72);
    this.smear.renderOrder = 8;
    camera.add(this.smear);
  }

  applyLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.002;
    this.pitch = clamp(this.pitch, -1.25, 1.25);
  }

  inAlcove(world: World): boolean {
    return Boolean(world.current.alcove && pointInAabb(this.x, this.z, world.current.alcove));
  }

  placeFree(world: World, x: number, z: number): void {
    const spot = firstFreePoint((px, pz) => this.blocked(world, px, pz), x, z);
    this.x = spot.x;
    this.z = spot.z;
  }

  update(dt: number, input: Input, world: World, feel: FeelOpts = {}): void {
    const locked = Boolean(feel.locked);
    const lookMul = locked ? 0.12 : 1;
    const look = input.consumeLook();
    this.applyLook(look.x * lookMul, look.y * lookMul);
    this.sneak = input.sneaking;
    this.y = feel.eyeY ?? EYE_YELLOW;

    const wish = walkIntent(input.keys, input.stickX, input.stickY);
    let ix = wish.x * (feel.strafeMul ?? 1);
    let iz = wish.z;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }

    this.speedMul = world.current.water && world.current.decision.encounterCard === "flooded_slow_zone" ? 0.62 : 1;
    const slipHazard =
      world.current.decision.hazard === "environmental" || world.current.decision.hazard === "puddle_slip";
    const slip = (world.current.water || slipHazard) && !this.sneak && Math.random() < dt * 0.7 ? 1.8 : 1;
    const ease = locked ? 0 : (feel.speedEase ?? 1);
    const speed = (this.sneak ? 1.35 : 3.05) * this.speedMul * ease;
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
    this.moving = !locked && mag > 0.08;
    this.noise = this.moving ? (this.sneak ? 0.18 : 0.62) : 0.08;
    if (world.current.decision.hazard === "buzzing_overload") this.noise = Math.min(1, this.noise + 0.25);

    if (input.consumeFlashlight() && this.battery > 0) this.flashlightOn = !this.flashlightOn;
    if (this.battery <= 0) this.flashlightOn = false;
    const drain = 3.2 + world.current.decision.fearIntensity * 1.15;
    if (this.flashlightOn) this.battery = Math.max(0, this.battery - dt * drain);

    const bobMul = feel.bobMul ?? 1;
    this.bob += dt * (this.moving ? (this.sneak ? 6.2 : 9.4) * bobMul : 0);
    const bobAmt = this.moving ? (this.sneak ? 0.012 : 0.034) * bobMul : 0;
    const bobY = Math.sin(this.bob) * bobAmt;
    const bobX = Math.cos(this.bob * 0.5) * bobAmt * 0.35;
    this.punch = Math.max(0, this.punch - dt * 3.2);
    const kick = this.punch * Math.sin(performance.now() * 0.04) * (feel.shakeMul ?? 1);

    this.camera.position.set(this.x + bobX, this.y + bobY, this.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw + (feel.yawAdd ?? 0) + kick * 0.35;
    this.camera.rotation.x = this.pitch + (feel.pitchAdd ?? 0) + kick * 0.55;
    const fearFov = feel.fov ?? 71 + this.fear * 0.05 - (this.flashlightOn ? 0 : 1.5);
    const fovLo = feel.fov != null ? 54 : 64;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, clamp(fearFov, fovLo, 80), feel.fov != null ? 5 : 14, dt);
    this.camera.updateProjectionMatrix();
    const beamMul = feel.beamMul ?? 1;
    this.flashlight.intensity = this.flashlightOn ? (26 - this.fear * 0.06) * beamMul : 0;
    this.flashFill.intensity = this.flashlightOn ? 5.2 * beamMul : 0;
    this.flashlight.angle = 0.34 + (1 - this.battery / 100) * 0.08;
    this.beam.visible = this.flashlightOn && beamMul > 0.08;
    this.beam.scale.setScalar(0.55 + beamMul * 0.45);
    this.beam.position.set(0.08 * beamMul, -0.22, -4.6);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = this.flashlightOn ? (0.1 + (this.battery / 100) * 0.04) * beamMul : 0;
    const smearMat = this.smear.material as THREE.MeshBasicMaterial;
    smearMat.opacity = feel.smear ?? 0;
    this.smear.visible = smearMat.opacity > 0.01;
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  private blocked(world: World, x: number, z: number): boolean {
    const boxes = [...world.collidersNear(x, z), ...world.blockedDoors()];
    return boxes.some((box) => circleHitsAabb(x, z, this.radius, box));
  }
}
