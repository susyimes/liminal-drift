import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENTER_HOLD_S,
  EYE_POOL,
  EYE_TUNNEL,
  EYE_YELLOW,
  FOOTPRINT_LIFE_S,
  PLACE_INSIDE_M,
  SETTLE_S,
  TILE_M,
  controlEase,
  exitFlashAdd,
  eyeHeight,
  footprintOpacity,
  glanceSignFromExits,
  glanceYaw,
  holdActive,
  isPoolVibe,
  isYellowOffice,
  liftAmount,
  splashOpacity,
  splashScale,
  tileRepeat,
  tunnelFov,
  tunnelLengthFor,
  tunnelPitch,
  tunnelStrafeMul,
} from "../client/src/game/directorFeel.ts";
import { lightHexForMood } from "../client/src/game/lighting.ts";
import { tunnelMeters, tunnelWalkSeconds } from "../client/src/game/transit.ts";

test("poolcore pushes long, yellow office cuts short, walk stays 0.8–1.4s", () => {
  assert.equal(tunnelLengthFor("poolcore", "short"), "long");
  assert.equal(tunnelLengthFor("flooded_lobby", "medium"), "long");
  assert.equal(tunnelLengthFor("empty_office", "long"), "short");
  assert.equal(tunnelLengthFor("hotel_hall", "medium"), "short");
  assert.equal(tunnelLengthFor("maze_cubicles"), "short");
  assert.equal(tunnelLengthFor("stairwell", "medium"), "medium");
  for (const dest of ["poolcore", "empty_office", "stairwell"] as const) {
    const seconds = tunnelWalkSeconds(tunnelMeters(tunnelLengthFor(dest, "medium")));
    assert.ok(seconds >= 0.8 && seconds <= 1.4, `${dest} walk ${seconds}s`);
  }
});

test("enter hold is a half-second jamb beat", () => {
  assert.equal(ENTER_HOLD_S, 0.5);
  assert.equal(holdActive(0.2), true);
  assert.equal(holdActive(0), false);
});

test("mid-tunnel framing is head-down, narrow strafe, mild FOV, no shake", () => {
  assert.ok(tunnelPitch(0.5) < tunnelPitch(0));
  assert.ok(tunnelPitch(0.5) < 0);
  assert.ok(tunnelStrafeMul() <= 0.15);
  const fovs = Array.from({ length: 30 }, (_, i) => tunnelFov(i / 29));
  const swing = Math.max(...fovs) - Math.min(...fovs);
  assert.ok(swing <= 5, `fov swing ${swing}`);
  let maxStep = 0;
  for (let i = 1; i < fovs.length; i += 1) maxStep = Math.max(maxStep, Math.abs(fovs[i]! - fovs[i - 1]!));
  assert.ok(maxStep < 0.6, `fov step ${maxStep} is a shake`);
});

test("exit flash is a short dark then overbright, then lift", () => {
  assert.equal(exitFlashAdd(0.4), 0);
  assert.ok(exitFlashAdd(0.83) < 0);
  assert.ok(exitFlashAdd(0.9) > 0);
  assert.equal(exitFlashAdd(0.98), 0);
  assert.ok(liftAmount(0) < 0.05);
  assert.ok(liftAmount(0.4) > 0.9);
});

test("settle is a 1–2s empty no-reaction beat", () => {
  assert.ok(SETTLE_S >= 1 && SETTLE_S <= 2);
  assert.ok(controlEase(0) < 0.4);
  assert.ok(controlEase(SETTLE_S) >= 0.99);
  assert.ok(controlEase(SETTLE_S / 2) < controlEase(SETTLE_S));
});

test("glance looks across a second exit without locking facing", () => {
  const sign = glanceSignFromExits(0, 0, 0, [{ x: 4, z: -2 }]);
  assert.equal(sign, 1);
  assert.equal(glanceSignFromExits(0, 0, 0, [{ x: -4, z: -2 }]), -1);
  const samples = [0.2, 0.45, 1.05, 1.7, 2.2].map((t) => glanceYaw(t, 1));
  assert.equal(samples[0], 0);
  assert.ok(samples[2]! > samples[1]!);
  assert.equal(samples[4], 0);
  assert.ok(PLACE_INSIDE_M >= 1.2);
});

test("poolcore camera sits lower than yellow office", () => {
  assert.ok(EYE_POOL < EYE_TUNNEL);
  assert.ok(EYE_TUNNEL < EYE_YELLOW);
  assert.equal(eyeHeight("pool"), EYE_POOL);
  assert.equal(eyeHeight("yellow"), EYE_YELLOW);
  assert.equal(isPoolVibe("poolcore"), true);
  assert.equal(isYellowOffice("empty_office"), true);
  assert.equal(isYellowOffice("hotel_hall"), true);
  assert.equal(isYellowOffice("poolcore"), false);
});

test("poolcore and yellow office color temps are instantly distinct", () => {
  const pool = lightHexForMood("humid_teal", true);
  const yellow = lightHexForMood("sick_yellow", true);
  assert.notEqual(pool, yellow);
  const poolB = pool & 0xff;
  const yellowR = (yellow >> 16) & 0xff;
  const poolR = (pool >> 16) & 0xff;
  const yellowB = yellow & 0xff;
  assert.ok(poolB > poolR, "pool reads cool");
  assert.ok(yellowR > yellowB, "office reads warm");
});

test("wet footprints fade in 2–4s and splash rings grow then die", () => {
  assert.ok(FOOTPRINT_LIFE_S >= 2 && FOOTPRINT_LIFE_S <= 4);
  assert.ok(footprintOpacity(0) > 0.2);
  assert.ok(footprintOpacity(2) < footprintOpacity(0.2));
  assert.equal(footprintOpacity(FOOTPRINT_LIFE_S), 0);
  assert.ok(splashOpacity(0) > splashOpacity(0.4));
  assert.ok(splashScale(0.3) > splashScale(0));
  assert.ok(TILE_M >= 0.3 && TILE_M <= 0.5);
  assert.ok(tileRepeat(16) > tileRepeat(8));
});
