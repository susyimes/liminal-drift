import { fetchHealth } from "./api.ts";
import { Game } from "./game/game.ts";
import { Ui } from "./ui.ts";

const canvas = document.getElementById("view");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("canvas missing");

const game = new Game(canvas);
const ui = new Ui();
(window as Window & { __liminal?: Game }).__liminal = game;

ui.showTitle();
ui.syncMute(game.audio.isMuted);
void fetchHealth().then((info) => ui.health(info));

game.renderer.domElement.addEventListener("click", () => {
  if (game.mode !== "playing") return;
  try {
    void game.renderer.domElement.requestPointerLock();
  } catch {
    // Pointer lock is optional mouse-look only. WASD must work without it.
  }
});

async function begin(): Promise<void> {
  void game.audio.unlock();
  game.startRun();
  await ui.showPlay();
  ui.syncMute(game.audio.isMuted);
}

ui.bind(game, () => {
  void begin();
});

const playtestCount = Number(new URLSearchParams(location.search).get("playtest") || "0");
if (Number.isFinite(playtestCount) && playtestCount > 0) {
  void (async () => {
    await begin();
    const log: unknown[] = [];
    for (let i = 0; i < playtestCount; i += 1) {
      const step = await game.stepUnexploredDoor();
      log.push({ ...step, tunnel: game.lastTunnelReport() });
      if (step.kind !== "entered") break;
    }
    (window as Window & { __liminalPlaytest?: unknown }).__liminalPlaytest = log;
    console.info("[liminal-playtest]", log);
  })();
}

function frame(): void {
  if (game.mode === "playing") ui.paint(game.hud());
  if (game.mode === "over" && !ui.over.classList.contains("shown")) {
    ui.over.classList.add("shown");
    void ui.showOver(game.overKind, game.overStatus, game.world.log, game.world.jevCalls, game.world.fallbackCalls);
  }
  if (game.mode === "playing") ui.over.classList.remove("shown");
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
