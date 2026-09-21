import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectedDoorShouldEnter,
  doorAwaitingDecision,
  doorGenerationTimedOut,
  doorNeedsForcedFallback,
  initialDoorGeneration,
} from "../client/src/game/doors.ts";
import { doorShimmerOpacity, tubeFlickerMul } from "../client/src/game/lighting.ts";

test("start room entry is idle so the first doorway can generate", () => {
  assert.equal(initialDoorGeneration(true, "start"), "idle");
  assert.equal(initialDoorGeneration(false, "start"), "idle");
  assert.equal(initialDoorGeneration(true, "r1"), "ready");
  assert.equal(initialDoorGeneration(false, "r1"), "idle");
});

test("ready-without-decision still needs generation", () => {
  assert.equal(
    doorAwaitingDecision({
      connectedRoomId: null,
      generation: "ready",
      decision: null,
    }),
    true,
  );
  assert.equal(
    doorAwaitingDecision({
      connectedRoomId: null,
      generation: "idle",
      decision: null,
    }),
    true,
  );
  assert.equal(
    doorAwaitingDecision({
      connectedRoomId: "r2",
      generation: "ready",
      decision: null,
    }),
    false,
  );
  assert.equal(
    doorAwaitingDecision({
      connectedRoomId: null,
      generation: "ready",
      decision: { roomArchetype: "empty_office" },
      fake: true,
    }),
    false,
  );
});

test("pending timeout latch fires after prefetch budget", () => {
  assert.equal(doorGenerationTimedOut(0, 5000, 1100), false);
  assert.equal(doorGenerationTimedOut(1000, 1500, 1100), false);
  assert.equal(doorGenerationTimedOut(1000, 2200, 1100), true);
});

test("hung pending door must force a sync fallback, not stay sealed", () => {
  const hung = { connectedRoomId: null, generation: "pending" as const, pendingSince: 1000 };
  assert.equal(doorNeedsForcedFallback(hung, 1500, 1100), false);
  assert.equal(doorNeedsForcedFallback(hung, 2200, 1100), true);
  assert.equal(
    doorNeedsForcedFallback({ ...hung, connectedRoomId: "r2" }, 5000, 1100),
    false,
  );
  assert.equal(
    doorNeedsForcedFallback({ connectedRoomId: null, generation: "ready", pendingSince: 1000 }, 5000, 1100),
    false,
  );
});

test("standing inside a linked doorway does not re-enter the other room", () => {
  assert.equal(connectedDoorShouldEnter("r2", "r2", "start", -0.85), false);
  assert.equal(connectedDoorShouldEnter("r2", "start", "r2", 0.4), false);
  assert.equal(connectedDoorShouldEnter("start", "start", "r2", -0.4), false);
});

test("crossing a linked doorway does enter the destination", () => {
  assert.equal(connectedDoorShouldEnter("start", "start", "r2", 0.2), true);
  assert.equal(connectedDoorShouldEnter("r2", "r2", "start", 0.2), true);
  assert.equal(connectedDoorShouldEnter("start", "r2", "r1", -0.2), true);
});

test("flickering tubes stay in a calm intensity band", () => {
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
  assert.ok(max <= 1.05, `max ${max} too bright`);
  assert.ok(max - min <= 0.28, `swing ${max - min} too large`);
  let maxStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxStep = Math.max(maxStep, Math.abs(samples[i]! - samples[i - 1]!));
  }
  assert.ok(maxStep < 0.08, `frame step ${maxStep} is still a strobe`);
});

test("ready-door shimmer is a static veil, pending is a slow breathe", () => {
  const ready = [0, 0.4, 1.1, 2.2].map((t) => doorShimmerOpacity("ready", t));
  assert.ok(ready.every((v) => v === ready[0]));
  assert.ok(ready[0]! <= 0.06);
  const pending = [0, Math.PI / 4.4, Math.PI / 2.2].map((t) => doorShimmerOpacity("pending", t));
  assert.ok(Math.max(...pending) <= 0.2);
  assert.ok(Math.min(...pending) >= 0.09);
});
