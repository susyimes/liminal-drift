import * as THREE from "three";
import {
  WIN_DEPTH,
  defaultProgress,
  type CompactGameState,
  type CompactRoomMemory,
  type GenerationSource,
} from "@liminal/shared";
import { AudioEngine } from "../audio.ts";
import { Input } from "../input.ts";
import { Entity } from "./entity.ts";
import { pointInAabb } from "./math.ts";
import { DriftParticles } from "./particles.ts";
import { Player } from "./player.ts";
import type { BuiltRoom, Door } from "./rooms.ts";
import { doorOutward, doorWorldPos } from "./rooms.ts";
import { World } from "./world.ts";
import { OPENING_HINT, depthHudText, hudVibeArchetype, roomVibeHud, tunnelVibeHud } from "./copy.ts";
import {
  ENTER_HOLD_S,
  PLACE_INSIDE_M,
  SETTLE_S,
  controlEase,
  eyeHeight,
  exitFlashAdd,
  glanceSignFromExits,
  glanceYaw,
  holdActive,
  isPoolVibe,
  isYellowOffice,
  exitRecover,
  liftAmount,
  tunnelBreath,
  tunnelFov,
  tunnelPitch,
  tunnelSmearOpacity,
  tunnelSpeedMul,
  tunnelStrafeMul,
  tunnelVignette,
} from "./directorFeel.ts";
import { enterExposureDip, enterFadeOpacity, enterVignetteAdd, tunnelFogHex, tunnelOverlayOpacity } from "./lighting.ts";
import { TUNNEL_EXIT_T, TUNNEL_START_INSET, pointAlongTunnel, tunnelProgress, tunnelWalkYaw } from "./transit.ts";
import {
  type TunnelClockReport,
  beginArmedWait,
  tunnelClockPhase,
  tunnelWaitMs,
  tunnelWalkDurationMs,
  tunnelWalkKind,
  tunnelWalkProgress,
  tunnelWalkU,
} from "./tunnelClock.ts";

export type { TunnelClockReport };

export type GameMode = "title" | "playing" | "over";
export type OverKind = "dead" | "exit" | "depth";

export type HudSnapshot = {
  fear: number;
  sanity: number;
  battery: number;
  depth: number;
  hasKeycard: boolean;
  source: GenerationSource;
  latencyMs: number;
  callCount: number;
  jevCalls: number;
  fallbackCalls: number;
  warning: string | null;
  status: string;
  flashlightOn: boolean;
  toast: string | null;
  encounter: string;
  ambience: string;
  exitChance: number;
  archetype: string;
  vibe: string;
  depthLabel: string;
  hint: string | null;
};

export class Game {
  mode: GameMode = "title";
  overKind: OverKind = "dead";
  overStatus = "";
  toast: string | null = null;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly input = new Input();
  readonly audio = new AudioEngine();
  world: World;
  player: Player;
  entity: Entity;
  status = "The hum does not come from the ceiling.";
  waitingDoor = false;
  private clock = new THREE.Clock();
  private running = false;
  private fearFromJev = 0.4;
  private lastPickupCheck = 0;
  private enterFade = 0;
  private lastEnteredRoomId: string | null = null;
  private toastAge = 0;
  private hint: string | null = null;
  private hintAge = 0;
  private hintChimed = false;
  private lastTransitId: string | null = null;
  private holdRemain = 0;
  private skipEnterHold = false;
  private pendingGenerationHoldMs = 0;
  private generationHoldUntil = 0;
  private tunnelHoldStartedAt = 0;
  private tunnelWaitStartedAt = 0;
  private tunnelWalkStartedAt = 0;
  private didEnterHold = false;
  private lastWalkMs: number | null = null;
  private lastTunnel: TunnelClockReport | null = null;
  private holdUntil = 0;
  private tunnelWalkTargetMs = 0;
  private walkLandTimer: ReturnType<typeof setTimeout> | null = null;
  private throatReadyTimer: ReturnType<typeof setTimeout> | null = null;
  private landingThroat = false;
  private settleAge = SETTLE_S;
  private glanceSign = 0;
  private stayRoomId: string | null = null;
  private stayRemain = 0;
  private hurtFlash = 0;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private particles: DriftParticles;
  private hazeNear: THREE.Mesh;
  private hazeFar: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a220e);
    this.scene.fog = new THREE.Fog(0x8a7430, 3.4, 24);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
    this.scene.add(this.camera);
    this.ambient = new THREE.AmbientLight(0x4a3c18, 0.16);
    this.hemi = new THREE.HemisphereLight(0xf0e08a, 0x2a1c0c, 0.22);
    this.scene.add(this.ambient);
    this.scene.add(this.hemi);

    this.world = new World(this.scene);
    this.player = new Player(this.camera);
    this.entity = new Entity();
    this.entity.attach(this.scene);
    this.particles = new DriftParticles(this.scene);
    this.hazeNear = this.makeHaze(0xc4a24a, 0.045, -9, 28, 10);
    this.hazeFar = this.makeHaze(0x3d4a58, 0.07, -18, 40, 14);
    this.camera.add(this.hazeNear, this.hazeFar);
    this.input.attach();
    window.addEventListener("resize", this.onResize);
    this.running = true;
    this.loop();
  }

  lastTunnelMs(): number | null {
    return this.lastWalkMs;
  }

  lastTunnelReport(): TunnelClockReport | null {
    return this.lastTunnel;
  }

  /** Playtest: next throat spends `ms` in Wait (dest not ready). Clock starts at Wait, not at this call. */
  armGenerationHold(ms: number): void {
    const hold = Math.max(0, ms);
    if (this.world.transit) {
      const armed = beginArmedWait(performance.now(), hold);
      this.generationHoldUntil = armed.holdUntil;
      if (this.tunnelWaitStartedAt === 0) this.tunnelWaitStartedAt = armed.waitStartedAt;
      this.pendingGenerationHoldMs = 0;
      return;
    }
    this.pendingGenerationHoldMs = hold;
    this.generationHoldUntil = 0;
  }

  async stepUnexploredDoor(): Promise<{
    kind: string;
    depth: number;
    roomId: string;
    archetype: string;
    source: GenerationSource;
    warning: string | null;
    walkMs: number | null;
  }> {
    const found = this.world.findUnexploredDoor();
    if (!found) {
      return {
        kind: "none",
        depth: this.world.roomsVisited,
        roomId: this.world.currentId,
        archetype: this.world.current.archetype,
        source: this.world.lastSource,
        warning: "no_open_door",
        walkMs: this.lastWalkMs,
      };
    }
    const { room, door } = found;
    this.world.currentId = room.id;
    this.placeAtDoor(room, door, -0.32);
    const compact = this.compactState();
    await this.world.considerPrefetch(this.player.x, this.player.z, compact);
    const deadline = performance.now() + 1600;
    while (!door.decision && !door.connectedRoomId && performance.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    this.skipEnterHold = true;
    this.placeAtDoor(room, door, 0.12);
    const portal = this.world.tryEnter(this.player.x, this.player.z, this.compactState());
    if (portal.kind === "tunnel" || this.world.transit) {
      if (this.world.transit?.tunnel) this.ensureInsideTunnel(this.world.transit.tunnel);
      this.holdRemain = 0;
      const dest = await this.awaitTunnelLanding(4500);
      if (dest) {
        this.settleAge = SETTLE_S;
        return {
          kind: "entered",
          depth: this.world.roomsVisited,
          roomId: this.world.currentId,
          archetype: dest.archetype,
          source: this.world.lastSource,
          warning: this.world.lastWarning,
          walkMs: this.lastWalkMs,
        };
      }
    }
    if (portal.kind === "entered") {
      this.nudgeThroughDoor();
      const dest = this.world.current;
      this.player.x = dest.cx;
      this.player.z = dest.cz;
      this.markEntered(dest);
      this.holdRemain = 0;
      this.settleAge = SETTLE_S;
    }
    return {
      kind: portal.kind,
      depth: this.world.roomsVisited,
      roomId: this.world.currentId,
      archetype: this.world.current.archetype,
      source: this.world.lastSource,
      warning: this.world.lastWarning,
      walkMs: this.lastWalkMs,
    };
  }

  private placeAtDoor(room: BuiltRoom, door: Door, outward: number): void {
    const pos = doorWorldPos(room, door);
    const out = doorOutward(room, door);
    this.player.x = pos.x + out.x * outward;
    this.player.z = pos.z + out.z * outward;
  }

  startRun(): void {
    this.clearWorld();
    this.world = new World(this.scene);
    this.player = new Player(this.camera);
    this.entity = new Entity();
    this.entity.attach(this.scene);
    this.hazeNear = this.makeHaze(0xc4a24a, 0.045, -9, 28, 10);
    this.hazeFar = this.makeHaze(0x3d4a58, 0.07, -18, 40, 14);
    this.camera.add(this.hazeNear, this.hazeFar);
    this.player.yaw = 0;
    this.player.placeFree(this.world, 0, 1.2);
    this.mode = "playing";
    this.status = "Yellow forever. The tubes remember a building.";
    this.waitingDoor = false;
    this.audio.setTunnel(false);
    this.audio.setHumidity(false);
    this.fearFromJev = 0.45;
    this.enterFade = 0.28;
    this.lastEnteredRoomId = this.world.currentId;
    this.toast = null;
    this.hint = OPENING_HINT;
    this.hintAge = 5.4;
    this.hintChimed = false;
    this.lastTransitId = null;
    this.holdRemain = 0;
    this.skipEnterHold = false;
    this.pendingGenerationHoldMs = 0;
    this.generationHoldUntil = 0;
    this.resetTunnelClockRuntime();
    this.lastWalkMs = null;
    this.lastTunnel = null;
    this.settleAge = SETTLE_S;
    this.glanceSign = 0;
    this.stayRoomId = this.world.currentId;
    this.stayRemain = 0;
    this.clock = new THREE.Clock();
  }

  hud(): HudSnapshot {
    return {
      fear: this.player.fear,
      sanity: Math.max(0, 100 - this.player.fear),
      battery: this.player.battery,
      depth: this.world.roomsVisited,
      hasKeycard: this.player.hasKeycard,
      source: this.world.lastSource,
      latencyMs: this.world.lastLatency,
      callCount: this.world.callCount,
      jevCalls: this.world.jevCalls,
      fallbackCalls: this.world.fallbackCalls,
      warning: this.world.lastWarning,
      status: this.status,
      flashlightOn: this.player.flashlightOn,
      toast: this.toast,
      encounter: this.world.current.decision.encounterCard,
      ambience: this.world.current.decision.ambience,
      exitChance: this.world.exitChance,
      archetype: this.world.transit ? this.world.transit.tunnel.mood : this.shownRoom().archetype,
      vibe: this.world.transit
        ? tunnelVibeHud(this.world.transit.tunnel.mood)
        : roomVibeHud(
            hudVibeArchetype(
              this.world.rooms.get(this.lastEnteredRoomId ?? "")?.archetype,
              this.world.roomAt(this.player.x, this.player.z)?.archetype,
              this.world.current.archetype,
            ),
          ),
      depthLabel: depthHudText(this.world.roomsVisited),
      hint: this.hint,
    };
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.mode === "playing") this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number): void {
    if (this.input.consumeMute()) this.audio.toggleMute();
    this.holdRemain = this.holdUntil > 0 ? Math.max(0, (this.holdUntil - performance.now()) / 1000) : 0;
    if (!this.world.transit) this.settleAge += dt;
    const transit = this.world.transit;
    const destReady = transit ? this.destReadyForWalk() : false;
    const phase = transit ? tunnelClockPhase(this.holdRemain, destReady) : null;
    if (phase === "wait" && this.tunnelWaitStartedAt === 0) this.tunnelWaitStartedAt = performance.now();
    let progress = transit ? tunnelProgress(transit.tunnel, this.player.x, this.player.z) : 0;
    if (transit && phase === "walk") {
      this.beginGuidedWalk();
      progress = this.driveTunnelWalk(transit.tunnel);
      if (this.tunnelWalkStartedAt > 0 && this.tunnelWalkTargetMs > 0) {
        const elapsed = performance.now() - this.tunnelWalkStartedAt;
        if (elapsed >= this.tunnelWalkTargetMs) this.completeGuidedWalk();
      }
    } else if (transit && (phase === "hold" || phase === "wait")) {
      const entrance = this.tunnelEntrance(transit.tunnel);
      this.player.x = entrance.x;
      this.player.z = entrance.z;
      progress = tunnelProgress(transit.tunnel, entrance.x, entrance.z);
    }
    const destArch = transit?.door.decision?.roomArchetype ?? this.world.current.archetype;
    const destMood = transit?.door.decision?.lightingMood ?? this.world.current.decision.lightingMood;
    const poolNow = isPoolVibe(this.world.current.archetype, this.world.current.decision.lightingMood) ||
      transit?.tunnel.mood === "pool_pipe";
    const yellowNow = isYellowOffice(this.world.current.archetype);
    const eyeKind = transit ? "tunnel" : poolNow ? "pool" : yellowNow ? "yellow" : "other";
    const destEye = eyeHeight(isPoolVibe(destArch, destMood) ? "pool" : isYellowOffice(destArch) ? "yellow" : eyeKind);
    const lift = transit ? 0 : liftAmount(this.settleAge);
    const eyeY = transit ? eyeHeight("tunnel") : eyeHeight("tunnel") + (destEye - eyeHeight("tunnel")) * lift;
    const breath = transit ? tunnelBreath(performance.now() / 1000) : { pitch: 0, fov: 0 };
    const throatLocked = Boolean(transit);
    this.player.update(dt, this.input, this.world, {
      locked: throatLocked || holdActive(this.holdRemain),
      speedEase: transit ? tunnelSpeedMul(progress) : controlEase(this.settleAge),
      strafeMul: transit ? tunnelStrafeMul() : 1,
      eyeY,
      pitchAdd: transit ? tunnelPitch(progress) + breath.pitch : 0,
      yawAdd: transit ? 0 : glanceYaw(this.settleAge, this.glanceSign),
      fov: transit ? tunnelFov(progress) + breath.fov : null,
      bobMul: transit ? 0.12 : controlEase(this.settleAge),
      shakeMul: transit ? 0 : 1,
      smear: transit ? tunnelSmearOpacity(phase === "walk" || holdActive(this.holdRemain)) : 0,
      beamMul: transit ? 0.22 : 1,
    });
    if (transit && phase === "walk") {
      const along = this.tunnelAlong(transit.tunnel);
      this.player.x = along.x;
      this.player.z = along.z;
      this.player.moving = true;
    } else if (transit && (phase === "hold" || phase === "wait")) {
      const entrance = this.tunnelEntrance(transit.tunnel);
      this.player.x = entrance.x;
      this.player.z = entrance.z;
    }

    const containedBefore = this.world.roomAt(this.player.x, this.player.z);

    const compact = this.compactState();
    void this.world.considerPrefetch(this.player.x, this.player.z, compact);
    let portal = this.world.transit
      ? this.world.advanceTransit(this.player.x, this.player.z, compact)
      : this.world.tryEnter(this.player.x, this.player.z, compact);
    if (!this.world.transit && !containedBefore && portal.kind === "none") {
      const rescued = this.world.rescueOutside(this.player.x, this.player.z, compact);
      if (rescued.kind !== "none") portal = rescued;
    }
    this.waitingDoor = portal.kind === "waiting" || Boolean(portal.waiting) || phase === "wait";
    this.audio.setPortal(this.waitingDoor);
    this.audio.setTunnel(Boolean(this.world.transit), this.world.transit?.tunnel.mood ?? "yellow_throat");
    if (portal.kind === "tunnel" && portal.tunnel && this.world.transit) {
      this.ensureInsideTunnel(portal.tunnel);
      this.hint = null;
      this.status = this.waitingDoor
        ? "The throat is still inventing the next room."
        : "A connecting hall. Keep walking.";
    } else if (portal.kind === "waiting") {
      this.status = "The doorway is still deciding what it is.";
    } else if (portal.kind === "entered" && portal.room) {
      this.placeJustInside(portal.room);
      this.world.currentId = portal.room.id;
      this.markEntered(portal.room);
    } else if (portal.kind === "exit") {
      this.tryExit();
    } else if (portal.kind === "locked") {
      this.status = this.player.hasKeycard ? "The lock hesitates." : "The lock wants a card.";
    } else if (portal.kind === "fake") {
      this.status = "The hallway is wallpaper. Someone wanted you to believe in a door.";
    } else if (
      containedBefore &&
      this.lastEnteredRoomId !== containedBefore.id &&
      !this.world.transit
    ) {
      this.world.currentId = containedBefore.id;
      this.markEntered(containedBefore);
    }

    this.stayRemain = Math.max(0, this.stayRemain - dt);
    const here = this.world.roomAt(this.player.x, this.player.z);
    if (this.stayRemain > 0 && this.stayRoomId && !this.world.transit) {
      this.world.currentId = this.stayRoomId;
    } else if (here && !this.world.transit) {
      this.world.currentId = here.id;
    }

    this.collect(dt);
    this.tickFear(dt);
    this.world.updateLights(performance.now() / 1000, this.player.fear, dt, this.player.x, this.player.z);

    const caught = this.entity.update(dt, this.player, this.world, this.compactState(), {
      onStinger: () => {
        this.audio.stinger();
        this.player.punch = Math.max(this.player.punch, 0.085);
        this.hurtFlash = 1;
        this.status = "It is in the room with you.";
      },
      onBait: () => this.audio.bait(),
      onStep: (muffled) => this.audio.entityStep(muffled),
    });
    if (caught === "caught") {
      this.end("dead", "It closed the last few steps without a sound.");
      return;
    }

    if (this.world.roomsVisited >= WIN_DEPTH) {
      this.end("depth", "You walked far enough that the building lost interest.");
      return;
    }

    const prox = this.entity.active ? Math.max(0, 1 - this.entity.distanceTo(this.player) / 10) : 0;
    if (prox > 0.68 && this.entity.los(this.world)) {
      this.player.punch = Math.max(this.player.punch, (prox - 0.68) * 0.12);
      this.hurtFlash = Math.max(this.hurtFlash, (prox - 0.68) * 1.6);
    }
    const inPool =
      isPoolVibe(this.world.current.archetype, this.world.current.decision.lightingMood) ||
      this.world.transit?.tunnel.mood === "pool_pipe";
    this.audio.setAmbience(inPool ? "drip" : this.world.current.decision.ambience);
    const humidity = this.world.current.decision.humidity ?? (inPool ? "damp" : "dry");
    this.audio.setHumidity(inPool || humidity !== "dry", humidity);
    this.audio.setProximity(prox);
    const surface = this.world.transit?.tunnel.surface ?? this.world.current.surface;
    this.audio.update(dt, this.player.moving, this.player.sneak, this.player.fear, surface);

    this.enterFade = Math.max(0, this.enterFade - dt * 2.15);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    if (this.hint) {
      if (!this.hintChimed && this.hintAge < 4.55) {
        this.hintChimed = true;
        this.audio.hintAhead();
      }
      this.hintAge -= dt;
      if (this.hintAge <= 0) this.hint = null;
    }
    if (this.toast) {
      this.toastAge -= dt;
      if (this.toastAge <= 0) this.toast = null;
    }

    this.particles.update(dt, this.player, this.world, this.waitingDoor);
    this.applyAtmosphere(prox);
  }

  private makeHaze(color: number, opacity: number, z: number, w: number, h: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
      }),
    );
    mesh.position.set(0, 0.1, z);
    mesh.renderOrder = -2;
    return mesh;
  }

  private applyAtmosphere(prox: number): void {
    const lighting = this.world.current.decision.lighting;
    const mood = this.world.current.decision.lightingMood ?? "sick_yellow";
    const yellow = isYellowOffice(this.world.current.archetype);
    const pool =
      isPoolVibe(this.world.current.archetype, mood) || this.world.transit?.tunnel.mood === "pool_pipe";
    const progress = this.world.transit
      ? tunnelProgress(this.world.transit.tunnel, this.player.x, this.player.z)
      : 0;
    const fog = this.scene.fog;
    const fogColor = this.world.transit
      ? tunnelFogHex(this.world.transit.tunnel.mood)
      : pool
        ? 0x16383c
        : lighting === "dead"
          ? 0x141820
          : lighting === "dim"
            ? 0x3a3420
            : 0x9a7e2c;
    this.scene.background = new THREE.Color(
      pool || this.world.transit?.tunnel.mood === "pool_pipe" ? 0x081618 : lighting === "dead" ? 0x0a0c10 : 0x2c220c,
    );
    const humidity = this.world.current.decision.humidity ?? (pool ? "damp" : "dry");
    if (fog instanceof THREE.Fog) {
      fog.near = this.world.transit ? 1.15 : lighting === "dead" ? 1.8 : humidity === "heavy" ? 1.6 : pool ? 2.0 : 3.6;
      fog.far =
        (this.world.transit
          ? 6.2
          : lighting === "dead"
            ? 14
            : humidity === "heavy"
              ? 12
              : humidity === "damp" || pool
                ? 15
                : lighting === "dim"
                  ? 17
                  : 24) - this.player.fear * 0.04;
      fog.color.setHex(fogColor);
    }
    const nearMat = this.hazeNear.material as THREE.MeshBasicMaterial;
    const farMat = this.hazeFar.material as THREE.MeshBasicMaterial;
    this.hazeNear.position.y = pool && !this.world.transit ? -1.08 : 0.1;
    this.hazeNear.position.z = pool && !this.world.transit ? -4.2 : -9;
    nearMat.opacity = lighting === "dead" ? 0.02 : 0.045 + this.enterFade * 0.03 + (pool ? 0.05 : yellow ? 0.01 : 0);
    nearMat.color.setHex(pool ? 0xc8e8e4 : 0xc4a24a);
    farMat.color.setHex(pool ? 0x143238 : lighting === "dead" ? 0x1a222c : 0x3d4a58);
    farMat.opacity = 0.06 + this.player.fear * 0.0004 + (pool ? 0.018 : 0);
    this.ambient.intensity = pool ? 0.12 : yellow || lighting === "harsh" ? 0.22 : lighting === "dead" ? 0.06 : 0.15;
    this.hemi.intensity = pool ? 0.16 : yellow || lighting === "harsh" ? 0.28 : 0.2;
    this.hemi.color.setHex(pool ? 0xc8eef4 : 0xf0e08a);
    this.renderer.toneMappingExposure =
      0.8 -
      this.player.fear * 0.002 -
      this.hurtFlash * 0.12 -
      enterExposureDip(this.enterFade) +
      (this.world.transit ? exitFlashAdd(progress) : exitRecover(this.settleAge));

    const tunnelCover = this.world.transit
      ? tunnelOverlayOpacity(tunnelProgress(this.world.transit.tunnel, this.player.x, this.player.z), this.waitingDoor)
      : enterFadeOpacity(this.enterFade);
    document.getElementById("vignette")?.style.setProperty(
      "opacity",
      String(
        this.world.transit
          ? tunnelVignette()
          : 0.42 +
            this.player.fear / 200 +
            prox * 0.2 +
            enterVignetteAdd(this.enterFade) +
            (1 - liftAmount(this.settleAge)) * 0.18,
      ),
    );
    const doorPass = document.getElementById("door-pass");
    doorPass?.classList.toggle("throat", Boolean(this.world.transit));
    doorPass?.style.setProperty("opacity", String(tunnelCover));
    document.getElementById("static-overlay")?.style.setProperty(
      "opacity",
      this.world.transit ? "0.045" : this.waitingDoor ? "0.06" : "0",
    );
    document.getElementById("hurt")?.style.setProperty("opacity", this.hurtFlash > 0 ? String(this.hurtFlash * 0.55) : prox > 0.65 ? String((prox - 0.65) * 1.4) : "0");
    document.getElementById("grade")?.style.setProperty("opacity", String(this.world.transit ? 0.08 : 0.18 + this.player.fear / 280 + this.hurtFlash * 0.35));
    document.getElementById("grade")?.classList.toggle("hurt-grade", this.hurtFlash > 0.2);
    document.body.classList.toggle("in-throat", Boolean(this.world.transit));
  }

  private nudgeThroughDoor(): void {
    const hit = this.world.nearestDoor(this.player.x, this.player.z);
    if (!hit) return;
    const out = doorOutward(hit.room, hit.door);
    const inward = hit.room.id === this.world.currentId;
    const sx = inward ? -out.x : out.x;
    const sz = inward ? -out.z : out.z;
    this.player.x += sx * 0.85;
    this.player.z += sz * 0.85;
  }

  private placeJustInside(room: BuiltRoom): void {
    const entry = room.doors.find((door) => door.wall === room.entryWall) ?? room.doors[0];
    if (entry) {
      const out = doorOutward(room, entry);
      this.player.yaw = tunnelWalkYaw({ x: -out.x, z: -out.z });
      this.player.pitch = 0;
    }
    const contained = this.world.roomAt(this.player.x, this.player.z);
    if (contained?.id === room.id) return;
    if (!entry) {
      this.player.x = room.cx;
      this.player.z = room.cz;
      return;
    }
    const pos = doorWorldPos(room, entry);
    const out = doorOutward(room, entry);
    this.player.x = pos.x - out.x * PLACE_INSIDE_M;
    this.player.z = pos.z - out.z * PLACE_INSIDE_M;
    if (!this.world.roomAt(this.player.x, this.player.z)) {
      this.player.x = room.cx;
      this.player.z = room.cz;
    }
  }

  private ensureInsideTunnel(tunnel: { id?: string; entry: { x: number; z: number }; dir: { x: number; z: number } }): void {
    const id = this.world.transit?.tunnel.id ?? tunnel.id ?? "tunnel";
    if (this.lastTransitId === id) return;
    this.lastTransitId = id;
    this.landingThroat = false;
    this.holdUntil = this.skipEnterHold ? 0 : performance.now() + ENTER_HOLD_S * 1000;
    this.holdRemain = this.skipEnterHold ? 0 : ENTER_HOLD_S;
    this.didEnterHold = this.holdRemain > 0;
    this.skipEnterHold = false;
    this.tunnelHoldStartedAt = performance.now();
    this.tunnelWaitStartedAt = 0;
    this.tunnelWalkStartedAt = 0;
    this.tunnelWalkTargetMs = 0;
    this.applyPendingGenerationHold();
    const entrance = this.tunnelEntrance(tunnel);
    this.player.x = entrance.x;
    this.player.z = entrance.z;
    this.player.yaw = tunnelWalkYaw(tunnel.dir);
    this.player.pitch = 0;
    this.scheduleThroatWalk();
  }

  /** Start the armed Wait clock at throat enter so prefetch time cannot erase waitMs. */
  private applyPendingGenerationHold(): void {
    if (this.pendingGenerationHoldMs <= 0) return;
    const armed = beginArmedWait(performance.now(), this.pendingGenerationHoldMs);
    this.generationHoldUntil = armed.holdUntil;
    this.tunnelWaitStartedAt = armed.waitStartedAt;
    this.pendingGenerationHoldMs = 0;
  }

  private destReadyForWalk(): boolean {
    if (!this.world.transit) return false;
    if (this.generationHoldUntil > performance.now()) {
      if (this.tunnelWaitStartedAt === 0) this.tunnelWaitStartedAt = performance.now();
      this.world.nudgeTransitDecision(this.compactState());
      return false;
    }
    const ready = this.world.readyTransitDestination(this.compactState());
    if (!ready && this.tunnelWaitStartedAt === 0) this.tunnelWaitStartedAt = performance.now();
    return ready;
  }

  private scheduleThroatWalk(): void {
    const go = (): void => {
      if (!this.world.transit || this.landingThroat) return;
      const now = performance.now();
      if (this.holdUntil > now) {
        this.throatReadyTimer = setTimeout(go, this.holdUntil - now);
        return;
      }
      this.holdRemain = 0;
      if (!this.destReadyForWalk()) {
        this.throatReadyTimer = setTimeout(go, 25);
        return;
      }
      this.beginGuidedWalk();
    };
    if (this.throatReadyTimer) clearTimeout(this.throatReadyTimer);
    this.throatReadyTimer = setTimeout(go, 0);
  }

  private beginGuidedWalk(): void {
    if (!this.world.transit || this.landingThroat) return;
    const dest = this.world.transit.door.decision?.roomArchetype ?? null;
    const requested = this.world.transit.door.decision?.tunnelLength;
    if (this.tunnelWalkTargetMs === 0) this.tunnelWalkTargetMs = tunnelWalkDurationMs(dest, requested);
    if (this.tunnelWalkStartedAt === 0) this.tunnelWalkStartedAt = performance.now();
    if (!this.walkLandTimer) {
      const remain = Math.max(0, this.tunnelWalkTargetMs - (performance.now() - this.tunnelWalkStartedAt));
      this.walkLandTimer = setTimeout(() => this.completeGuidedWalk(), remain);
    }
  }

  private completeGuidedWalk(): void {
    if (this.landingThroat || !this.world.transit) return;
    this.landingThroat = true;
    if (this.walkLandTimer) {
      clearTimeout(this.walkLandTimer);
      this.walkLandTimer = null;
    }
    const dest = this.world.forceCompleteTransit(this.compactState());
    if (dest) {
      this.placeJustInside(dest);
      this.world.currentId = dest.id;
      this.markEntered(dest);
    }
    this.holdRemain = 0;
    this.holdUntil = 0;
  }

  private tunnelEntrance(tunnel: { entry: { x: number; z: number }; dir: { x: number; z: number } }): { x: number; z: number } {
    return {
      x: tunnel.entry.x + tunnel.dir.x * TUNNEL_START_INSET,
      z: tunnel.entry.z + tunnel.dir.z * TUNNEL_START_INSET,
    };
  }

  private tunnelAlong(tunnel: { entry: { x: number; z: number }; exit: { x: number; z: number }; dir: { x: number; z: number } }): {
    x: number;
    z: number;
    progress: number;
  } {
    const dest = this.world.transit?.door.decision?.roomArchetype ?? null;
    const requested = this.world.transit?.door.decision?.tunnelLength;
    const durationMs = this.tunnelWalkTargetMs || tunnelWalkDurationMs(dest, requested);
    if (this.tunnelWalkStartedAt === 0) return { ...this.tunnelEntrance(tunnel), progress: 0 };
    const elapsed = performance.now() - this.tunnelWalkStartedAt;
    const u = tunnelWalkU(elapsed, durationMs);
    const entrance = this.tunnelEntrance(tunnel);
    const startP = tunnelProgress(tunnel, entrance.x, entrance.z);
    const progress = tunnelWalkProgress(startP, u, TUNNEL_EXIT_T);
    const point = pointAlongTunnel(tunnel, progress);
    return { ...point, progress };
  }

  private driveTunnelWalk(tunnel: { entry: { x: number; z: number }; exit: { x: number; z: number }; dir: { x: number; z: number } }): number {
    const along = this.tunnelAlong(tunnel);
    this.player.x = along.x;
    this.player.z = along.z;
    return along.progress;
  }

  private recordTunnelWalk(elapsedMs: number): void {
    const dest =
      this.world.transit?.door.decision?.roomArchetype ?? this.world.current.archetype ?? null;
    const requested =
      this.world.transit?.door.decision?.tunnelLength ?? this.world.current.decision.tunnelLength;
    const length = tunnelWalkKind(dest, requested);
    const holdEnd = this.tunnelWaitStartedAt || this.tunnelWalkStartedAt || performance.now();
    const holdMs =
      this.didEnterHold && this.tunnelHoldStartedAt > 0 ? Math.round(Math.max(0, holdEnd - this.tunnelHoldStartedAt)) : 0;
    const waitMs = tunnelWaitMs(this.tunnelWaitStartedAt, this.tunnelWalkStartedAt);
    const elapsed = Math.round(elapsedMs);
    const walkMs =
      this.tunnelWalkTargetMs > 0 ? Math.min(elapsed, this.tunnelWalkTargetMs + 32) : elapsed;
    this.lastWalkMs = walkMs;
    this.lastTunnel = {
      walkMs,
      holdMs,
      waitMs,
      length,
      dest,
      source: this.world.lastSource,
    };
    console.info("[liminal-tunnel] walk", walkMs, "ms (walk-only; hold/wait/settle excluded)", this.lastTunnel);
    this.resetTunnelClockRuntime();
  }

  private resetTunnelClockRuntime(): void {
    if (this.walkLandTimer) clearTimeout(this.walkLandTimer);
    if (this.throatReadyTimer) clearTimeout(this.throatReadyTimer);
    this.walkLandTimer = null;
    this.throatReadyTimer = null;
    this.tunnelHoldStartedAt = 0;
    this.tunnelWaitStartedAt = 0;
    this.tunnelWalkStartedAt = 0;
    this.tunnelWalkTargetMs = 0;
    this.holdUntil = 0;
    this.didEnterHold = false;
    this.landingThroat = false;
  }

  private awaitTunnelLanding(timeoutMs: number): Promise<BuiltRoom | null> {
    const started = performance.now();
    return new Promise((resolve) => {
      const tick = (): void => {
        if (!this.world.transit) {
          resolve(this.world.current);
          return;
        }
        if (performance.now() - started > timeoutMs) {
          this.completeGuidedWalk();
          if (this.world.transit) {
            const dest = this.world.forceCompleteTransit(this.compactState());
            if (dest) {
              this.placeJustInside(dest);
              this.markEntered(dest);
            }
          }
          this.holdRemain = 0;
          resolve(this.world.current);
          return;
        }
        setTimeout(tick, 16);
      };
      setTimeout(tick, 16);
    });
  }

  private markEntered(room: BuiltRoom): void {
    if (this.lastEnteredRoomId === room.id) {
      this.resetTunnelClockRuntime();
      return;
    }
    if (this.tunnelWalkStartedAt > 0) {
      this.recordTunnelWalk(performance.now() - this.tunnelWalkStartedAt);
    } else {
      this.resetTunnelClockRuntime();
    }
    this.lastEnteredRoomId = room.id;
    this.stayRoomId = room.id;
    this.stayRemain = 2.8;
    this.lastTransitId = null;
    this.generationHoldUntil = 0;
    this.pendingGenerationHoldMs = 0;
    this.entity.grace = 1.8;
    this.onEnter(room);
  }

  private onEnter(room: BuiltRoom): void {
    this.fearFromJev = room.decision.fearIntensity;
    this.entity.onNewRoom(room, this.player);
    this.enterFade = 0.22;
    this.settleAge = 0;
    this.holdRemain = 0;
    const openings = room.doors
      .filter((door) => !door.fake && !door.isFalseExit && door.wall !== room.entryWall)
      .map((door) => doorWorldPos(room, door));
    this.glanceSign = glanceSignFromExits(this.player.x, this.player.z, this.player.yaw, openings);
    this.audio.enterLand(room.surface);
    this.audio.settleEmpty(room.surface);
    if (room.id !== "start") this.hint = null;
    if (room.decision.soundBait) this.audio.bait();
    const bits = [room.archetype.replaceAll("_", " "), room.decision.lighting, room.decision.ambience];
    if (room.decision.entityPresent) bits.push(room.decision.entityBehavior.replaceAll("_", " "));
    this.status = `The room settles: ${bits.join(" · ")}.`;
    if (room.decision.hazard !== "none") this.status += ` Hazard: ${room.decision.hazard.replaceAll("_", " ")}.`;
    if (room.decision.deadEndBait) this.status += " Some throats are only paint.";
    if (room.decision.advancesExit) {
      this.status += " The air is slightly less yellow.";
    }
    if (room.decision.encounterCard === "power_flicker_event") this.status += " The tubes fail, then argue.";
    if (room.decision.encounterCard === "flooded_slow_zone") this.status += " The carpet is a shallow sea.";
    if (room.decision.encounterCard === "safe_alcove") this.status += " A recess that does not want it.";
    if (room.decision.encounterCard === "locked_gate_needs_key") this.status += " A gate waits for red plastic.";
    if (room.decision.clueBeat === "radio_static") this.status += " A radio found a station that is not a station.";
    if (room.decision.clueBeat === "graffiti") this.status += " Someone wrote on the rule.";
    if (room.archetype === "poolcore") this.status += " 池核. The tile is sweating.";
  }

  private tryExit(): void {
    if (this.player.hasKeycard || this.world.roomsVisited >= WIN_DEPTH - 2) {
      this.end("exit", this.player.hasKeycard ? "The card still worked. The air on the other side was wrong in a kinder way." : "The lock had given up before you arrived.");
      return;
    }
    this.status = "A painted EXIT. The lock is real. Find a card, or go deeper.";
  }

  private collect(dt: number): void {
    this.lastPickupCheck += dt;
    const want = this.input.consumeInteract() || this.lastPickupCheck > 0.25;
    if (!want) return;
    this.lastPickupCheck = 0;
    const found = this.world.pickupNear(this.player.x, this.player.z);
    if (!found) return;
    found.pickup.taken = true;
    found.pickup.mesh.visible = false;
    this.audio.pickup();
    this.player.punch = Math.max(this.player.punch, 0.03);
    if (found.pickup.kind === "battery") {
      this.player.battery = Math.min(100, this.player.battery + 46);
      this.flashToast("Cells. The lamp has a little more night.");
      this.status = "Spare cells. The lamp has a little more night in it.";
    } else if (found.pickup.kind === "keycard") {
      this.player.hasKeycard = true;
      this.flashToast("A faded red card.");
      this.status = "A faded red card. Something here still believes in doors.";
    } else if (found.pickup.note) {
      this.player.lastNote = found.pickup.note;
      this.player.notesFound += 1;
      this.flashToast(found.pickup.note);
      this.status = found.pickup.note;
    }
  }

  private flashToast(text: string): void {
    this.toast = text;
    this.toastAge = 3.4;
  }

  private tickFear(dt: number): void {
    const room = this.world.current;
    let add = 0.32 + this.fearFromJev * 0.22;
    if (room.decision.lighting === "dead" || room.decision.lighting === "dim") add += 1.05;
    if (room.darkPatch && pointInAabb(this.player.x, this.player.z, room.darkPatch)) add += 2.4;
    if (this.entity.active && this.entity.los(this.world)) add += 2.8;
    else if (this.entity.active && this.entity.hops(this.world) <= 1) add += 1.1;
    if (this.player.flashlightOn) add -= 0.55;
    if (!this.player.flashlightOn && room.decision.lighting === "dead") add += 0.8;
    if (room.powerFlicker > 0) add += 1.6;
    add += (room.decision.entityPressure ?? 0) * 0.12;
    if (this.player.inAlcove(this.world)) add = -3.2;
    this.player.fear = Math.min(100, Math.max(4, this.player.fear + add * dt));
  }

  private shownRoom(): BuiltRoom {
    const entered = this.lastEnteredRoomId ? this.world.rooms.get(this.lastEnteredRoomId) : null;
    return entered ?? this.world.current;
  }

  compactState(): CompactGameState {
    const room = this.world.current;
    const memory: CompactRoomMemory = {
      id: room.id,
      archetype: room.archetype,
      lighting: room.decision.lighting,
      lightingMood: room.decision.lightingMood,
      lightingStyle: room.decision.lightingStyle,
      ambience: room.decision.ambience,
      poolcoreVariant: room.decision.poolcoreVariant,
      humidity: room.decision.humidity,
      exitLayout: room.decision.exitLayout,
      hazard: room.decision.hazard,
      encounter: room.decision.encounterCard,
      motif: room.decision.layoutMotif,
    };
    return {
      purpose: "room",
      depth: this.world.roomsVisited,
      roomsVisited: this.world.roomsVisited,
      recentArchetypes: this.world.log.slice(-4).map((e) => e.decision.roomArchetype),
      currentRoom: memory,
      player: {
        sanity: this.player.fear,
        battery: Math.round(this.player.battery),
        hasKeycard: this.player.hasKeycard,
        noise: this.player.noise,
        moving: this.player.moving,
      },
      entity: {
        known: this.entity.known,
        sameRoom: this.entity.roomId === this.world.currentId,
        hops: this.entity.hops(this.world),
        los: this.entity.los(this.world),
        lastBehavior: room.decision.entityBehavior,
        lastIntent: this.entity.lastIntent,
      },
      portal: null,
      progress: {
        ...defaultProgress(),
        exitChance: this.world.exitChance,
        lastEncounter: this.world.lastEncounter,
        lastClue: room.decision.clueBeat,
        notesFound: this.player.notesFound,
        roomsSinceEntity: this.world.roomsSinceEntity,
      },
    };
  }

  private end(kind: OverKind, text: string): void {
    this.mode = "over";
    this.overKind = kind;
    this.overStatus = text;
    this.status = text;
    this.enterFade = 0;
    this.hint = null;
    document.getElementById("door-pass")?.style.setProperty("opacity", "0");
    document.body.classList.remove("in-throat");
    document.exitPointerLock();
  }

  private clearWorld(): void {
    this.world.detachFromScene();
    this.scene.remove(this.entity.group);
    while (this.camera.children.length > 0) this.camera.remove(this.camera.children[0]!);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
