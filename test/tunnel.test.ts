import assert from "node:assert/strict";
import { test } from "node:test";
import { tunnelVibeHud } from "../client/src/game/copy.ts";
import {
  lightHexForMood,
  tunnelOverlayOpacity,
  tunnelStartupFlicker,
  tunnelTubeMul,
} from "../client/src/game/lighting.ts";
import {
  inferTunnelMood,
  tunnelMeters,
  tunnelProgress,
  tunnelReachedExit,
  tunnelWalkSeconds,
  tunnelWalkYaw,
} from "../client/src/game/transit.ts";

test("tunnel lengths stay a 0.8–1.4s walk, not a cutscene", () => {
  assert.ok(tunnelMeters("short") >= 3.6 && tunnelMeters("short") < 4.6);
  assert.ok(tunnelMeters("medium") > tunnelMeters("short"));
  assert.ok(tunnelMeters("long") > tunnelMeters("medium"));
  assert.ok(tunnelMeters("long") < 6.4);
  for (const kind of ["short", "medium", "long"] as const) {
    const seconds = tunnelWalkSeconds(tunnelMeters(kind));
    assert.ok(seconds >= 0.8 && seconds <= 1.4, `${kind} walk ${seconds}s`);
  }
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
  assert.ok(min >= 0.95, `min ${min}`);
  assert.ok(max <= 1.0, `max ${max}`);
  assert.ok(max - min <= 0.04, `swing ${max - min}`);
  let maxStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxStep = Math.max(maxStep, Math.abs(samples[i]! - samples[i - 1]!));
  }
  assert.ok(maxStep < 0.02, `frame step ${maxStep}`);
});

test("tunnel overlay is a side squeeze, not a black wipe", () => {
  const samples = [0, 0.3, 0.5, 0.8, 1].map((p) => tunnelOverlayOpacity(p, false));
  assert.ok(Math.max(...samples) <= 0.12);
  assert.ok(Math.min(...samples) >= 0.03);
  assert.ok(tunnelOverlayOpacity(0.5, true) > tunnelOverlayOpacity(0.5, false));
});

test("tunnel tubes flicker once or twice then hold", () => {
  const start = tunnelStartupFlicker(0.12);
  const mid = tunnelStartupFlicker(0.36);
  const settled = [0.5, 0.9, 1.4].map((t) => tunnelStartupFlicker(t));
  assert.ok(start < 0.9, `first dip ${start}`);
  assert.ok(mid < 1, `second dip ${mid}`);
  assert.ok(settled.every((v) => v === 1));
  let maxStep = 0;
  let prev = tunnelStartupFlicker(0);
  for (let t = 1 / 60; t < 0.6; t += 1 / 60) {
    const v = tunnelStartupFlicker(t);
    maxStep = Math.max(maxStep, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(maxStep < 0.08, `frame step ${maxStep} is a strobe`);
});

test("humid teal is actually teal", () => {
  assert.notEqual(lightHexForMood("humid_teal", true), lightHexForMood("sick_yellow", true));
  assert.equal(tunnelVibeHud("pool_pipe"), "池核管道 · pool_pipe");
  assert.ok(tunnelVibeHud("yellow_throat").includes("黄喉"));
});
