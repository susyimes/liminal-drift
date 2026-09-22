import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENING_HINT, depthHudText, roomVibeHud, roomVibeZh } from "../client/src/game/copy.ts";
import {
  doorFrameHex,
  doorVeilOpacity,
  enterExposureDip,
  enterFadeOpacity,
  enterVignetteAdd,
  startGuideMul,
  tubeFlickerMul,
} from "../client/src/game/lighting.ts";

test("HUD progress names DEPTH and the room vibe in Chinese", () => {
  assert.equal(depthHudText(1), "深度 DEPTH 1");
  assert.equal(depthHudText(7), "深度 DEPTH 7");
  assert.equal(roomVibeZh("stairwell"), "楼梯间");
  assert.equal(roomVibeHud("maze_cubicles"), "隔间迷宫 · maze_cubicles");
  assert.equal(roomVibeHud("long_hall"), "长廊 · long_hall");
  assert.ok(OPENING_HINT.includes("门"));
});

test("room-entry fade is a short dark recover, not a strobe", () => {
  const samples: number[] = [];
  let fade = 1;
  for (let i = 0; i < 48; i += 1) {
    samples.push(enterFadeOpacity(fade));
    fade = Math.max(0, fade - (1 / 60) * 2.15);
  }
  assert.ok(samples[0]! <= 0.62, `peak ${samples[0]} too opaque`);
  assert.ok(samples[0]! >= 0.4, `peak ${samples[0]} too timid`);
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i]! <= samples[i - 1]! + 1e-9, "fade must be monotonic");
    assert.ok(Math.abs(samples[i]! - samples[i - 1]!) < 0.08, "frame step still a flash");
  }
  assert.ok(samples[samples.length - 1]! < 0.02, "fade must finish quickly");
  assert.ok(enterExposureDip(1) > enterExposureDip(0.2));
  assert.equal(enterExposureDip(0), 0);
  assert.ok(enterVignetteAdd(1) < 0.3);
});

test("unexplored doors stay marked; explored doors stay open", () => {
  assert.ok(doorVeilOpacity(false) > 0.05);
  assert.equal(doorVeilOpacity(true), 0);
  assert.notEqual(doorFrameHex(false), doorFrameHex(true));
});

test("start-room guide lamp breathes slowly", () => {
  const samples = Array.from({ length: 180 }, (_, i) => startGuideMul(i / 60));
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  assert.ok(min >= 0.93, `min ${min}`);
  assert.ok(max <= 1.07, `max ${max}`);
  assert.ok(max - min <= 0.12, `swing ${max - min}`);
  let maxStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxStep = Math.max(maxStep, Math.abs(samples[i]! - samples[i - 1]!));
  }
  assert.ok(maxStep < 0.02, `frame step ${maxStep}`);
});

test("start-room flickering tubes still stay in the calm band", () => {
  const samples: number[] = [];
  for (let t = 0; t < 8; t += 1 / 60) {
    samples.push(
      tubeFlickerMul({
        buzzing: true,
        powerFlicker: 0,
        time: t,
        phase: 12,
        fear: 20,
        here: true,
      }),
    );
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  assert.ok(min >= 0.68, `min ${min} too dark`);
  assert.ok(max - min <= 0.28, `swing ${max - min} too large`);
});
