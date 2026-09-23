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
  pointAlongTunnel,
  tunnelMeters,
  tunnelProgress,
  tunnelReachedExit,
  tunnelWalkSeconds,
  tunnelWalkYaw,
} from "../client/src/game/transit.ts";
import {
  TUNNEL_WALK_MS,
  armedWaitInSlop,
  beginArmedWait,
  tunnelClockPhase,
  tunnelWaitMs,
  tunnelWalkDurationMs,
  tunnelWalkEase,
  tunnelWalkKind,
  tunnelWalkProgress,
  tunnelWalkU,
  waitMsForCrossing,
  walkMsInBand,
} from "../client/src/game/tunnelClock.ts";

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

test("walk-only clock is 800–1400ms and ignores hold + generation wait", () => {
  assert.equal(tunnelClockPhase(0.4, false), "hold");
  assert.equal(tunnelClockPhase(0, false), "wait");
  assert.equal(tunnelClockPhase(0, true), "walk");
  assert.equal(tunnelWalkKind("empty_office", "long"), "short");
  assert.equal(tunnelWalkKind("hotel_hall"), "short");
  assert.equal(tunnelWalkKind("maze_cubicles"), "short");
  assert.equal(tunnelWalkKind("poolcore", "short"), "long");
  assert.equal(tunnelWalkDurationMs("empty_office"), TUNNEL_WALK_MS.short);
  assert.equal(tunnelWalkDurationMs("poolcore"), TUNNEL_WALK_MS.long);
  assert.ok(TUNNEL_WALK_MS.short >= 800 && TUNNEL_WALK_MS.short <= 1000);
  assert.ok(TUNNEL_WALK_MS.long >= 1200 && TUNNEL_WALK_MS.long <= 1400);
  for (const dest of ["empty_office", "hotel_hall", "maze_cubicles", "poolcore", "stairwell"] as const) {
    assert.ok(walkMsInBand(tunnelWalkDurationMs(dest)), `${dest} ${tunnelWalkDurationMs(dest)}`);
  }
  const holdMs = 500;
  const waitMs = 2000;
  const walkMs = tunnelWalkDurationMs("empty_office");
  const crossingMs = holdMs + waitMs + walkMs + 1350;
  assert.ok(crossingMs > 1400, "full crossing including Jev wait is not the walk");
  assert.ok(walkMsInBand(walkMs));
});

test("armed Wait is exactly the arm, not arm plus dest/Jev latency", () => {
  assert.equal(waitMsForCrossing({ armedMs: 1800, destReadyMs: 400 }), 1800);
  assert.equal(waitMsForCrossing({ armedMs: 1800, destReadyMs: 2500 }), 1800);
  assert.equal(waitMsForCrossing({ armedMs: 1800, destReadyMs: 0 }), 1800);
  assert.equal(waitMsForCrossing({ armedMs: 0, destReadyMs: 433 }), 433);
  assert.ok(armedWaitInSlop(1800, 1800));
  assert.ok(armedWaitInSlop(1755, 1800));
  assert.equal(armedWaitInSlop(2004, 1800), false);
  assert.equal(armedWaitInSlop(3263, 1800), false);
  assert.ok(walkMsInBand(912));
});

test("armGenerationHold wait is booked from throat Wait, not from the arm() call", () => {
  const armCall = 10_000;
  const throatEnter = armCall + 1600;
  const fromCall = beginArmedWait(armCall, 1800);
  assert.ok(fromCall.holdUntil - throatEnter < 300, "deadline from arm() is almost gone at enter");
  const fromWait = beginArmedWait(throatEnter, 1800);
  const waitMs = tunnelWaitMs(fromWait.waitStartedAt, fromWait.holdUntil);
  assert.equal(waitMs, 1800);
  assert.ok(Math.abs(waitMs - 1800) <= 100);
  assert.equal(tunnelWaitMs(0, fromWait.holdUntil), 0);
  assert.ok(walkMsInBand(tunnelWalkDurationMs("hotel_hall")));
});

test("EaseInOut is on time, so a late destination does not stretch the walk", () => {
  assert.equal(tunnelWalkEase(0), 0);
  assert.equal(tunnelWalkEase(1), 1);
  assert.ok(Math.abs(tunnelWalkEase(0.5) - 0.5) < 1e-9);
  const duration = tunnelWalkDurationMs("poolcore");
  let landedAt = 0;
  for (let t = 0; t <= duration + 50; t += 1000 / 60) {
    if (tunnelWalkU(t, duration) >= 1) {
      landedAt = t;
      break;
    }
  }
  assert.ok(walkMsInBand(landedAt), `landedAt ${landedAt}`);
  assert.ok(landedAt >= duration);
  assert.ok(landedAt - duration < 20);
  const startP = 0.16;
  const mid = tunnelWalkProgress(startP, 0.5);
  const end = tunnelWalkProgress(startP, 1);
  assert.ok(mid > startP && mid < end);
  const tunnel = { entry: { x: 0, z: 0 }, exit: { x: 0, z: -10 } };
  const point = pointAlongTunnel(tunnel, 0.5);
  assert.ok(Math.abs(point.z + 5) < 1e-9);
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
