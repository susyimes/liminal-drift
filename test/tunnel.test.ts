import assert from "node:assert/strict";
import { test } from "node:test";
import { tunnelVibeHud } from "../client/src/game/copy.ts";
import {
  lightHexForMood,
  tunnelOverlayOpacity,
  tunnelTubeMul,
} from "../client/src/game/lighting.ts";
import {
  inferTunnelMood,
  tunnelMeters,
  tunnelProgress,
  tunnelReachedExit,
  tunnelWalkYaw,
} from "../client/src/game/transit.ts";

test("tunnel lengths stay short enough to read", () => {
  assert.ok(tunnelMeters("short") >= 6 && tunnelMeters("short") < 8);
  assert.ok(tunnelMeters("medium") > tunnelMeters("short"));
  assert.ok(tunnelMeters("long") > tunnelMeters("medium"));
  assert.ok(tunnelMeters("long") < 16);
});

test("tunnel progress and exit latch", () => {
  const tunnel = { entry: { x: 0, z: 0 }, exit: { x: 0, z: -10 } };
  assert.ok(tunnelProgress(tunnel, 0, 0) < 0.05);
  assert.ok(Math.abs(tunnelProgress(tunnel, 0, -5) - 0.5) < 0.02);
  assert.equal(tunnelReachedExit(tunnel, 0, -4), false);
  assert.equal(tunnelReachedExit(tunnel, 0, -8.6), true);
});

test("poolcore destinations infer a wet throat", () => {
  assert.equal(inferTunnelMood("empty_office", "poolcore"), "pool_pipe");
  assert.equal(inferTunnelMood("poolcore", "long_hall"), "pool_pipe");
  assert.equal(inferTunnelMood("flooded_lobby", "empty_office"), "damp_service");
  assert.equal(inferTunnelMood("empty_office"), "yellow_throat");
});

test("walking forward down a southward throat matches WASD yaw", () => {
  const yaw = tunnelWalkYaw({ x: 0, z: -1 });
  assert.ok(Math.abs(yaw) < 1e-9);
});

test("tunnel tubes stay in a calm band", () => {
  const samples = Array.from({ length: 180 }, (_, i) => tunnelTubeMul(i / 60, 4));
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  assert.ok(min >= 0.92, `min ${min}`);
  assert.ok(max <= 1.0, `max ${max}`);
  assert.ok(max - min <= 0.07, `swing ${max - min}`);
  let maxStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxStep = Math.max(maxStep, Math.abs(samples[i]! - samples[i - 1]!));
  }
  assert.ok(maxStep < 0.02, `frame step ${maxStep}`);
});

test("tunnel overlay is a readable throat, not a flash", () => {
  const samples = [0, 0.3, 0.5, 0.8, 1].map((p) => tunnelOverlayOpacity(p, false));
  assert.ok(Math.max(...samples) <= 0.28);
  assert.ok(Math.min(...samples) >= 0.14);
  assert.ok(tunnelOverlayOpacity(0.5, true) > tunnelOverlayOpacity(0.5, false));
});

test("humid teal is actually teal", () => {
  assert.notEqual(lightHexForMood("humid_teal", true), lightHexForMood("sick_yellow", true));
  assert.equal(tunnelVibeHud("pool_pipe"), "池核管道 · pool_pipe");
  assert.ok(tunnelVibeHud("yellow_throat").includes("黄喉"));
});
