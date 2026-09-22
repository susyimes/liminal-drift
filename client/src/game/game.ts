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
import { OPENING_HINT, depthHudText, roomVibeHud, tunnelVibeHud } from "./copy.ts";
import { enterExposureDip, enterFadeOpacity, enterVignetteAdd, tunnelFogHex, tunnelOverlayOpacity } from "./lighting.ts";
import { tunnelProgress, tunnelWalkYaw } from "./transit.ts";

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

  async stepUnexploredDoor(): Promise<{
    kind: string;
    depth: number;
    roomId: string;
    archetype: string;
    source: GenerationSource;
    warning: string | null;
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
    this.placeAtDoor(room, door, 0.12);
    const portal = this.world.tryEnter(this.player.x, this.player.z, this.compactState());
    if (portal.kind === "tunnel" || this.world.transit) {
      const dest = this.world.forceCompleteTransit(this.compactState());
      if (dest) {
        this.player.x = dest.cx;
        this.player.z = dest.cz;
        this.markEntered(dest);
        return {
          kind: "entered",
          depth: this.world.roomsVisited,
          roomId: this.world.currentId,
          archetype: dest.archetype,
          source: this.world.lastSource,
          warning: this.world.lastWarning,
        };
      }
    }
    if (portal.kind === "entered") {
      this.nudgeThroughDoor();
      const dest = this.world.current;
      this.player.x = dest.cx;
      this.player.z = dest.cz;
      this.markEntered(dest);
    }
    return {
      kind: portal.kind,
      depth: this.world.roomsVisited,
      roomId: this.world.currentId,
      archetype: this.world.current.archetype,
      source: this.world.lastSource,
      warning: this.world.lastWarning,
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
    this.enterFade = 0.55;
    this.lastEnteredRoomId = this.world.currentId;
    this.toast = null;
    this.hint = OPENING_HINT;
    this.hintAge = 5.4;
    this.hintChimed = false;
    this.lastTransitId = null;
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
      archetype: this.world.transit ? this.world.transit.tunnel.mood : this.world.current.archetype,
      vibe: this.world.transit ? tunnelVibeHud(this.world.transit.tunnel.mood) : roomVibeHud(this.world.current.archetype),
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
    this.player.update(dt, this.input, this.world);

    const contained = this.world.roomAt(this.player.x, this.player.z);
    if (contained && !this.world.transit) this.world.currentId = contained.id;

    const compact = this.compactState();
    void this.world.considerPrefetch(this.player.x, this.player.z, compact);
    let portal = this.world.transit
      ? this.world.advanceTransit(this.player.x, this.player.z, compact)
      : this.world.tryEnter(this.player.x, this.player.z, compact);
    if (!this.world.transit && !contained && portal.kind === "none") {
      const rescued = this.world.rescueOutside(this.player.x, this.player.z, compact);
      if (rescued.kind !== "none") portal = rescued;
    }
    this.waitingDoor = portal.kind === "waiting" || Boolean(portal.waiting);
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
    } else if (contained && this.lastEnteredRoomId !== contained.id) {
      this.markEntered(contained);
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
      this.world.current.archetype === "poolcore" ||
      this.world.current.decision.lightingMood === "humid_teal" ||
      this.world.transit?.tunnel.mood === "pool_pipe";
    this.audio.setAmbience(inPool ? "drip" : this.world.current.decision.ambience);
    this.audio.setHumidity(inPool);
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
    const pool =
      this.world.current.archetype === "poolcore" ||
      mood === "humid_teal" ||
      this.world.transit?.tunnel.mood === "pool_pipe";
    const fog = this.scene.fog;
    const fogColor = this.world.transit
      ? tunnelFogHex(this.world.transit.tunnel.mood)
      : pool
        ? 0x1a4044
        : lighting === "dead"
          ? 0x141820
          : lighting === "dim"
            ? 0x3a3420
            : 0x8a7430;
    this.scene.background = new THREE.Color(
      pool || this.world.transit?.tunnel.mood === "pool_pipe" ? 0x0a1c1e : lighting === "dead" ? 0x0a0c10 : 0x2a220e,
    );
    if (fog instanceof THREE.Fog) {
      fog.near = this.world.transit ? 1.6 : lighting === "dead" ? 1.8 : pool ? 2.4 : 3.2;
      fog.far =
        (this.world.transit ? 11 : lighting === "dead" ? 14 : lighting === "dim" || pool ? 17 : 23) -
        this.player.fear * 0.04;
      fog.color.setHex(fogColor);
    }
    const nearMat = this.hazeNear.material as THREE.MeshBasicMaterial;
    const farMat = this.hazeFar.material as THREE.MeshBasicMaterial;
    nearMat.opacity = lighting === "dead" ? 0.02 : 0.045 + this.enterFade * 0.03 + (pool ? 0.03 : 0);
    nearMat.color.setHex(pool ? 0x8ee0d8 : 0xc4a24a);
    farMat.color.setHex(pool ? 0x1a3a40 : lighting === "dead" ? 0x1a222c : 0x3d4a58);
    farMat.opacity = 0.06 + this.player.fear * 0.0004 + (pool ? 0.03 : 0);
    this.ambient.intensity = pool ? 0.14 : lighting === "harsh" ? 0.2 : lighting === "dead" ? 0.06 : 0.15;
    this.hemi.intensity = pool ? 0.18 : lighting === "harsh" ? 0.26 : 0.2;
    this.hemi.color.setHex(pool ? 0xa8fff4 : 0xf0e08a);
    this.renderer.toneMappingExposure =
      0.8 - this.player.fear * 0.002 - this.hurtFlash * 0.12 - enterExposureDip(this.enterFade);

    const tunnelCover = this.world.transit
      ? tunnelOverlayOpacity(tunnelProgress(this.world.transit.tunnel, this.player.x, this.player.z), this.waitingDoor)
      : enterFadeOpacity(this.enterFade);
    document.getElementById("vignette")?.style.setProperty(
      "opacity",
      String(0.5 + this.player.fear / 180 + prox * 0.25 + enterVignetteAdd(this.enterFade)),
    );
    document.getElementById("door-pass")?.style.setProperty("opacity", String(tunnelCover));
    document.getElementById("static-overlay")?.style.setProperty("opacity", this.waitingDoor ? "0.06" : "0");
    document.getElementById("hurt")?.style.setProperty("opacity", this.hurtFlash > 0 ? String(this.hurtFlash * 0.55) : prox > 0.65 ? String((prox - 0.65) * 1.4) : "0");
    document.getElementById("grade")?.style.setProperty("opacity", String(0.18 + this.player.fear / 280 + this.hurtFlash * 0.35));
    document.getElementById("grade")?.classList.toggle("hurt-grade", this.hurtFlash > 0.2);
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
    const contained = this.world.roomAt(this.player.x, this.player.z);
    if (contained?.id === room.id) return;
    const entry = room.doors.find((door) => door.wall === room.entryWall) ?? room.doors[0];
    if (!entry) {
      this.player.x = room.cx;
      this.player.z = room.cz;
      return;
    }
    const pos = doorWorldPos(room, entry);
    const out = doorOutward(room, entry);
    this.player.x = pos.x - out.x * 0.95;
    this.player.z = pos.z - out.z * 0.95;
    if (!this.world.roomAt(this.player.x, this.player.z)) {
      this.player.x = room.cx;
      this.player.z = room.cz;
    }
  }

  private ensureInsideTunnel(tunnel: { id?: string; entry: { x: number; z: number }; dir: { x: number; z: number } }): void {
    const id = this.world.transit?.tunnel.id ?? tunnel.id ?? "tunnel";
    if (this.lastTransitId === id) return;
    this.lastTransitId = id;
    this.player.x = tunnel.entry.x + tunnel.dir.x * 0.85;
    this.player.z = tunnel.entry.z + tunnel.dir.z * 0.85;
    this.player.yaw = tunnelWalkYaw(tunnel.dir);
    this.enterFade = Math.max(this.enterFade, 0.62);
  }

  private markEntered(room: BuiltRoom): void {
    if (this.lastEnteredRoomId === room.id) return;
    this.lastEnteredRoomId = room.id;
    this.lastTransitId = null;
    this.entity.grace = 1.8;
    this.onEnter(room);
  }

  private onEnter(room: BuiltRoom): void {
    this.fearFromJev = room.decision.fearIntensity;
    this.entity.onNewRoom(room, this.player);
    this.enterFade = 1;
    this.player.punch = Math.max(this.player.punch, 0.048);
    this.audio.portalResolve();
    this.audio.enterLand(room.surface);
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

  compactState(): CompactGameState {
    const room = this.world.current;
    const memory: CompactRoomMemory = {
      id: room.id,
      archetype: room.archetype,
      lighting: room.decision.lighting,
      lightingMood: room.decision.lightingMood,
      ambience: room.decision.ambience,
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
