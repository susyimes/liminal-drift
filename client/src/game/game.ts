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
import { Player } from "./player.ts";
import type { BuiltRoom } from "./rooms.ts";
import { doorOutward } from "./rooms.ts";
import { World } from "./world.ts";

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
  private enterBeat = 0;
  private toastAge = 0;
  private hurtFlash = 0;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;

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
    this.scene.fog = new THREE.FogExp2(0x8a7430, 0.055);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);
    this.scene.add(this.camera);
    this.ambient = new THREE.AmbientLight(0x3a3214, 0.11);
    this.hemi = new THREE.HemisphereLight(0xf0e08a, 0x1a1408, 0.16);
    this.scene.add(this.ambient);
    this.scene.add(this.hemi);

    this.world = new World(this.scene);
    this.player = new Player(this.camera);
    this.entity = new Entity();
    this.entity.attach(this.scene);
    this.input.attach();
    window.addEventListener("resize", this.onResize);
    this.running = true;
    this.loop();
  }

  startRun(): void {
    this.clearWorld();
    this.world = new World(this.scene);
    this.player = new Player(this.camera);
    this.entity = new Entity();
    this.entity.attach(this.scene);
    this.player.x = 0;
    this.player.z = 1.2;
    this.player.yaw = 0;
    this.mode = "playing";
    this.status = "Yellow forever. The tubes remember a building.";
    this.waitingDoor = false;
    this.fearFromJev = 0.45;
    this.enterBeat = 0.7;
    this.toast = null;
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
    if (contained) this.world.currentId = contained.id;

    const compact = this.compactState();
    void this.world.considerPrefetch(this.player.x, this.player.z, compact);
    const portal = this.world.tryEnter(this.player.x, this.player.z, compact);
    this.waitingDoor = portal.kind === "waiting";
    this.audio.setPortal(this.waitingDoor);
    if (portal.kind === "waiting") {
      this.status = "The doorway is still deciding what it is.";
    } else if (portal.kind === "entered" && portal.room) {
      this.nudgeThroughDoor();
      this.entity.grace = 1.8;
      this.onEnter(portal.room);
    } else if (portal.kind === "exit") {
      this.tryExit();
    } else if (portal.kind === "locked") {
      this.status = this.player.hasKeycard ? "The lock hesitates." : "The lock wants a card.";
    } else if (portal.kind === "fake") {
      this.status = "The hallway is wallpaper. Someone wanted you to believe in a door.";
    }

    this.collect(dt);
    this.tickFear(dt);
    this.world.updateLights(performance.now() / 1000, this.player.fear, dt);

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
    this.audio.setAmbience(this.world.current.decision.ambience);
    this.audio.setProximity(prox);
    this.audio.update(dt, this.player.moving, this.player.sneak, this.player.fear, this.world.current.surface);

    this.enterBeat = Math.max(0, this.enterBeat - dt * 1.15);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    if (this.toast) {
      this.toastAge -= dt;
      if (this.toastAge <= 0) this.toast = null;
    }

    this.applyAtmosphere(prox);
  }

  private applyAtmosphere(prox: number): void {
    const lighting = this.world.current.decision.lighting;
    const fog = this.scene.fog;
    const density =
      (lighting === "dead" ? 0.1 : lighting === "dim" ? 0.078 : lighting === "flickering" ? 0.06 : 0.048) +
      this.player.fear * 0.00028 +
      this.enterBeat * 0.03;
    const fogColor = lighting === "dead" ? 0x1a160c : lighting === "dim" ? 0x4a3c18 : 0x8f7a32;
    this.scene.background = new THREE.Color(lighting === "dead" ? 0x0c0a06 : 0x2a220e);
    if (fog instanceof THREE.FogExp2) {
      fog.density = density;
      fog.color.setHex(fogColor);
    }
    this.ambient.intensity = lighting === "harsh" ? 0.14 : lighting === "dead" ? 0.04 : 0.1;
    this.hemi.intensity = lighting === "harsh" ? 0.2 : 0.14;
    this.renderer.toneMappingExposure = 0.8 - this.player.fear * 0.002 - this.hurtFlash * 0.12 + this.enterBeat * 0.12;

    document.getElementById("vignette")?.style.setProperty("opacity", String(0.5 + this.player.fear / 180 + prox * 0.25));
    document.getElementById("static-overlay")?.style.setProperty("opacity", this.waitingDoor ? "0.42" : this.enterBeat > 0 ? String(this.enterBeat * 0.35) : "0");
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

  private onEnter(room: BuiltRoom): void {
    this.fearFromJev = room.decision.fearIntensity;
    this.entity.onNewRoom(room, this.player);
    this.enterBeat = 1;
    this.audio.portalResolve();
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
    if (this.player.inAlcove(this.world)) add = -3.2;
    this.player.fear = Math.min(100, Math.max(4, this.player.fear + add * dt));
  }

  compactState(): CompactGameState {
    const room = this.world.current;
    const memory: CompactRoomMemory = {
      id: room.id,
      archetype: room.archetype,
      lighting: room.decision.lighting,
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
    document.exitPointerLock();
  }

  private clearWorld(): void {
    for (const room of this.world.rooms.values()) this.scene.remove(room.group);
    this.scene.remove(this.entity.group);
    while (this.camera.children.length > 0) this.camera.remove(this.camera.children[0]!);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
