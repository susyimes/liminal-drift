import assert from "node:assert/strict";
import { test } from "node:test";
import { doorAwaitingDecision, doorGenerationTimedOut, initialDoorGeneration } from "../client/src/game/doors.ts";

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
