import { getLocale, onLocaleChange, setLocale, t, type MessageKey } from "./i18n.ts";
import { decisionLabel } from "./game/copy.ts";
import type { HealthResponse, RoomLogEntry } from "@liminal/shared";
import type { Game, HudSnapshot, OverKind } from "./game/game.ts";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class Ui {
  readonly title = el<HTMLElement>("title-screen");
  readonly over = el<HTMLElement>("over-screen");
  readonly hud = el<HTMLElement>("hud");
  readonly touch = el<HTMLElement>("touch-layer");

  private game: Game | null = null;
  private healthInfo: HealthResponse | null | undefined;
  private overData: { kind: OverKind; log: RoomLogEntry[]; jev: number; fallback: number } | null = null;

  constructor() {
    el<HTMLButtonElement>("lang-en").addEventListener("click", () => setLocale("en"));
    el<HTMLButtonElement>("lang-zh").addEventListener("click", () => setLocale("zh-CN"));
    onLocaleChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  private refreshLanguage(): void {
    document.documentElement.lang = getLocale();
    document.title = t("title");
    document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n as MessageKey);
    });
    el<HTMLElement>("language-switch").setAttribute("aria-label", t("language"));
    el<HTMLElement>("view").setAttribute("aria-label", t("title"));
    el<HTMLElement>("lang-en").setAttribute("aria-pressed", String(getLocale() === "en"));
    el<HTMLElement>("lang-zh").setAttribute("aria-pressed", String(getLocale() === "zh-CN"));
    if (this.healthInfo === undefined) el<HTMLElement>("title-health").textContent = t("checking");
    else this.health(this.healthInfo);
    if (this.game) {
      this.syncMute(this.game.audio.isMuted);
      this.paint(this.game.hud());
      if (this.overData) this.paintOver(this.overData.kind, this.game.overStatus, this.overData.log, this.overData.jev, this.overData.fallback);
    }
  }

  bind(game: Game, onStart: () => void): void {
    this.game = game;
    const click = () => {
      void game.audio.unlock();
      game.audio.uiClick();
    };
    el<HTMLButtonElement>("btn-start").addEventListener("click", () => {
      click();
      onStart();
    });
    el<HTMLButtonElement>("btn-again").addEventListener("click", () => {
      click();
      onStart();
    });
    el<HTMLButtonElement>("btn-mute").addEventListener("click", () => {
      click();
      this.syncMute(game.audio.toggleMute());
    });
    el<HTMLButtonElement>("btn-title-mute").addEventListener("click", () => {
      click();
      this.syncMute(game.audio.toggleMute());
    });
    this.syncMute(game.audio.isMuted);
  }

  showTitle(): void {
    this.title.classList.remove("hidden", "is-leaving");
    this.over.classList.add("hidden");
    this.over.classList.remove("shown", "is-leaving");
    this.hud.classList.add("hidden");
    this.hud.classList.remove("is-live");
    this.touch.classList.add("hidden");
    document.body.classList.remove("playing");
  }

  async showPlay(): Promise<void> {
    this.title.classList.add("is-leaving");
    this.over.classList.add("is-leaving");
    await wait(380);
    this.title.classList.add("hidden");
    this.over.classList.add("hidden");
    this.over.classList.remove("shown", "is-leaving");
    this.hud.classList.remove("hidden");
    requestAnimationFrame(() => this.hud.classList.add("is-live"));
    if ("ontouchstart" in window) this.touch.classList.remove("hidden");
    else this.touch.classList.add("hidden");
    document.body.classList.add("playing");
  }

  async showOver(kind: OverKind, lead: string, log: RoomLogEntry[], jev: number, fallback: number): Promise<void> {
    this.hud.classList.remove("is-live");
    this.touch.classList.add("hidden");
    document.body.classList.remove("playing");
    this.overData = { kind, log, jev, fallback };
    this.paintOver(kind, lead, log, jev, fallback);
    await wait(160);
    this.hud.classList.add("hidden");
    this.title.classList.add("hidden");
    this.over.classList.remove("hidden", "is-leaving");
  }

  private paintOver(kind: OverKind, lead: string, log: RoomLogEntry[], jev: number, fallback: number): void {
    el<HTMLElement>("over-kicker").textContent = t(kind === "dead" ? "deadKicker" : kind === "exit" ? "exitKicker" : "depthKicker");
    el<HTMLElement>("over-title").textContent = t(kind === "dead" ? "deadTitle" : kind === "exit" ? "exitTitle" : "depthTitle");
    el<HTMLElement>("over-lead").textContent = lead;
    const lines = log.map((entry) => {
      const d = entry.decision;
      return `#${entry.depth} ${t(entry.source === "jev" ? "onlineSource" : "localSource")}  ${decisionLabel(d.roomArchetype)}/${decisionLabel(d.poolcoreVariant)} · ${decisionLabel(d.exitLayout)} · ${decisionLabel(d.lightingStyle)}/${decisionLabel(d.lightingMood)} · ${decisionLabel(d.humidity)}/${decisionLabel(d.soundBed)} · ${decisionLabel(d.hazard)} · ${t("tunnel")} ${decisionLabel(d.tunnelLength)}/${decisionLabel(d.tunnelMood)} · ${t("crumb")} ${decisionLabel(d.narrativeCrumb)} · ${t("familiar")} ${t(d.familiarReturn ? "yes" : "no")} (${entry.latencyMs}ms)`;
    });
    lines.push("", `${t("generation")}: ${jev} ${t("onlineSource")} / ${fallback} ${t("localSource")}`, t("director"));
    el<HTMLElement>("over-log").textContent = lines.join("\n");
  }

  health(info: HealthResponse | null): void {
    this.healthInfo = info;
    el<HTMLElement>("title-health").textContent = info?.hasKey
      ? `${t("onlineGeneration")} · ${info.model}` : t("localGeneration");
  }

  paint(snap: HudSnapshot): void {
    if (this.game) this.syncMute(this.game.audio.isMuted);
    el<HTMLElement>("sanity-bar").style.width = `${snap.sanity}%`;
    el<HTMLElement>("sanity-val").textContent = `${Math.round(snap.sanity)}`;
    el<HTMLElement>("bat-bar").style.width = `${snap.battery}%`;
    el<HTMLElement>("bat-val").textContent = `${Math.round(snap.battery)}`;
    el<HTMLElement>("depth-pill").textContent = snap.depthLabel;
    el<HTMLElement>("vibe-pill").textContent = snap.vibe;
    const key = el<HTMLElement>("key-pill");
    key.textContent = t(snap.hasKeycard ? "card" : "noCard");
    key.classList.toggle("dim", !snap.hasKeycard);
    el<HTMLElement>("status-line").textContent = snap.status;
    const hint = el<HTMLElement>("open-hint");
    if (snap.hint) {
      hint.textContent = snap.hint;
      hint.classList.remove("hidden");
      hint.classList.add("is-on");
    } else {
      // The expired opening hint still fades visibly; refresh that copy too.
      hint.textContent = t("opening");
      hint.classList.remove("is-on");
    }
    el<HTMLElement>("jev-line").textContent =
      `${t(snap.source === "jev" ? "onlineSource" : "localSource")} · ${Math.round(snap.latencyMs)}ms · ${snap.jevCalls}/${snap.fallbackCalls}`;
    const warn = el<HTMLElement>("warn-line");
    if (snap.warning) {
      warn.textContent = snap.warning;
      warn.classList.remove("hidden");
    } else {
      warn.textContent = "";
      warn.classList.add("hidden");
    }
    const toast = el<HTMLElement>("pickup-toast");
    if (snap.toast) {
      toast.textContent = snap.toast;
      toast.classList.remove("hidden");
    } else {
      toast.textContent = "";
      toast.classList.add("hidden");
    }
  }

  syncMute(muted: boolean): void {
    el<HTMLButtonElement>("btn-mute").textContent = t(muted ? "unmute" : "mute");
    el<HTMLButtonElement>("btn-title-mute").textContent = t(muted ? "unmute" : "mute");
  }
}
