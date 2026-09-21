import type { HealthResponse, RoomLogEntry } from "@liminal/shared";
import type { Game, HudSnapshot, OverKind } from "./game/game.ts";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

export class Ui {
  readonly title = el<HTMLElement>("title-screen");
  readonly over = el<HTMLElement>("over-screen");
  readonly hud = el<HTMLElement>("hud");
  readonly touch = el<HTMLElement>("touch-layer");

  bind(game: Game, onStart: () => void): void {
    el<HTMLButtonElement>("btn-start").addEventListener("click", () => onStart());
    el<HTMLButtonElement>("btn-again").addEventListener("click", () => onStart());
    el<HTMLButtonElement>("btn-mute").addEventListener("click", () => {
      const muted = game.audio.toggleMute();
      this.syncMute(muted);
    });
    el<HTMLButtonElement>("btn-title-mute").addEventListener("click", () => {
      const muted = game.audio.toggleMute();
      this.syncMute(muted);
    });
  }

  showTitle(): void {
    this.title.classList.remove("hidden");
    this.over.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.touch.classList.add("hidden");
    document.body.classList.remove("playing");
  }

  showPlay(): void {
    this.title.classList.add("hidden");
    this.over.classList.add("hidden");
    this.hud.classList.remove("hidden");
    if ("ontouchstart" in window) this.touch.classList.remove("hidden");
    else this.touch.classList.add("hidden");
    document.body.classList.add("playing");
  }

  showOver(kind: OverKind, lead: string, log: RoomLogEntry[], jev: number, fallback: number): void {
    this.title.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.touch.classList.add("hidden");
    this.over.classList.remove("hidden");
    document.body.classList.remove("playing");
    el<HTMLElement>("over-kicker").textContent =
      kind === "dead" ? "DRIFT ENDED" : kind === "exit" ? "THRESHOLD" : "DEPTH MARK";
    el<HTMLElement>("over-title").textContent =
      kind === "dead" ? "It found you" : kind === "exit" ? "A door opened" : "You outlasted the halls";
    el<HTMLElement>("over-lead").textContent = lead;
    const lines = log.map((entry) => {
      const d = entry.decision;
      return `#${entry.depth} ${entry.source}  ${d.roomArchetype} · ${d.size} · ${d.lighting} · ${d.ambience} · ${d.entityBehavior} · loot ${d.loot} · fear ${d.fearIntensity.toFixed(1)}  (${entry.latencyMs}ms)`;
    });
    lines.push("", `Generation: ${jev} jev / ${fallback} fallback`, "This is what Jev (or the fallback) chose.");
    el<HTMLElement>("over-log").textContent = lines.join("\n");
  }

  health(info: HealthResponse | null): void {
    const node = el<HTMLElement>("title-health");
    if (!info) {
      node.textContent = "Server proxy offline. Fallback rooms will still run if the client can start.";
      return;
    }
    node.textContent = info.hasKey
      ? `Jev proxy ready · model ${info.model}`
      : "No TYPESAFE_API_KEY on the server. The drift still runs on fallback rooms.";
  }

  paint(snap: HudSnapshot): void {
    el<HTMLElement>("fear-bar").style.width = `${snap.fear}%`;
    el<HTMLElement>("fear-val").textContent = `${Math.round(snap.fear)}`;
    el<HTMLElement>("bat-bar").style.width = `${snap.battery}%`;
    el<HTMLElement>("bat-val").textContent = `${Math.round(snap.battery)}`;
    el<HTMLElement>("depth-pill").textContent = `DEPTH ${snap.depth}`;
    const key = el<HTMLElement>("key-pill");
    key.textContent = snap.hasKeycard ? "KEYCARD" : "NO CARD";
    key.classList.toggle("dim", !snap.hasKeycard);
    el<HTMLElement>("source-pill").textContent = snap.source.toUpperCase();
    el<HTMLElement>("status-line").textContent = snap.status;
    el<HTMLElement>("jev-line").textContent =
      `Jev ${snap.source} · ${Math.round(snap.latencyMs)}ms · ${snap.callCount} calls · ${snap.jevCalls} jev / ${snap.fallbackCalls} fallback`;
    const warn = el<HTMLElement>("warn-line");
    if (snap.warning) {
      warn.textContent = snap.warning;
      warn.classList.remove("hidden");
    } else {
      warn.classList.add("hidden");
    }
  }

  syncMute(muted: boolean): void {
    el<HTMLButtonElement>("btn-mute").textContent = muted ? "Unmute" : "Mute";
    el<HTMLButtonElement>("btn-title-mute").textContent = muted ? "Unmute" : "Mute";
  }
}
