import { setLocale } from "../client/src/i18n.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENING_HINT, depthHudText, hudVibeArchetype, roomVibeHud, roomVibeZh } from "../client/src/game/copy.ts";
import {
  doorFrameHex,
  doorVeilHex,
  doorVeilOpacity,
  enterExposureDip,
  enterFadeOpacity,
  enterVignetteAdd,
  startGuideMul,
  tubeFlickerMul,
} from "../client/src/game/lighting.ts";

test("HUD progress and room vibe use the selected locale", () => {
  setLocale("en");
  assert.equal(depthHudText(1), "DEPTH 1");
  assert.equal(depthHudText(7), "DEPTH 7");
  assert.equal(roomVibeZh("stairwell"), "楼梯间");
  assert.equal(roomVibeHud("maze_cubicles"), "Cubicle maze");
  assert.equal(roomVibeHud("long_hall"), "Long hall");
  assert.equal(roomVibeHud("poolcore"), "Pool halls");
  assert.equal(roomVibeHud("hotel_hall"), "Hotel hall");
  assert.equal(roomVibeHud("empty_classroom"), "Empty classroom");
  assert.ok(OPENING_HINT.includes("门"));
});

test("room-entry fade is a short dark recover, not a strobe", () => {
  const samples: number[] = [];
  let fade = 1;
  for (let i = 0; i < 48; i += 1) {
    samples.push(enterFadeOpacity(fade));
    fade = Math.max(0, fade - (1 / 60) * 2.15);
  }
  assert.ok(samples[0]! <= 0.22, `peak ${samples[0]} is a wipe`);
  assert.ok(samples[0]! >= 0.1, `peak ${samples[0]} too timid`);
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
  assert.ok(doorVeilOpacity(false) >= 0.28);
  assert.equal(doorVeilOpacity(true), 0);
  assert.notEqual(doorFrameHex(false), doorFrameHex(true));
  assert.ok(((doorFrameHex(false) >> 16) & 0xff) - ((doorFrameHex(true) >> 16) & 0xff) > 80);
  assert.ok(((doorVeilHex(false) >> 16) & 0xff) > 180);
});

test("HUD vibe prefers the room just entered over a jamb-overlap currentId", () => {
  setLocale("en");
  assert.equal(hudVibeArchetype("maze_cubicles", "long_hall", "long_hall"), "maze_cubicles");
  assert.equal(hudVibeArchetype(null, "long_hall", "empty_office"), "long_hall");
  assert.equal(hudVibeArchetype(null, null, "empty_office"), "empty_office");
  assert.equal(roomVibeHud("maze_cubicles"), "Cubicle maze");
  assert.notEqual(roomVibeHud("maze_cubicles"), roomVibeHud("long_hall"));
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
