import assert from "node:assert/strict";
import { test } from "node:test";
import { circleHitsAabb, firstFreePoint } from "../client/src/game/math.ts";
import {
  inputHeld,
  shouldClearHeldKeys,
  tokensForKeyEvent,
  walkIntent,
} from "../client/src/input.ts";

test("movement binds event.code even when key is IME / layout garbage", () => {
  const tokens = tokensForKeyEvent({ key: "ц", code: "KeyW" });
  assert.ok(tokens.includes("KeyW"));
  assert.ok(tokens.includes("w"));
  assert.deepEqual(walkIntent(tokens), { x: 0, z: 1 });
});

test("arrow codes and key names both walk", () => {
  assert.deepEqual(walkIntent(tokensForKeyEvent({ key: "ArrowUp", code: "ArrowUp" })), { x: 0, z: 1 });
  assert.deepEqual(walkIntent(["arrowup"]), { x: 0, z: 1 });
  assert.deepEqual(walkIntent(["KeyS"]), { x: 0, z: -1 });
  assert.deepEqual(walkIntent(["a", "KeyD"]), { x: 0, z: 0 });
});

test("code-only automation events still move (Playwright keyboard.down KeyW)", () => {
  const tokens = tokensForKeyEvent({ key: "", code: "KeyW" });
  assert.ok(inputHeld(tokens, "w", "KeyW"));
  assert.equal(walkIntent(tokens).z, 1);
});

test("key-only events still move when code is missing", () => {
  const tokens = tokensForKeyEvent({ key: "w", code: "" });
  assert.deepEqual(walkIntent(tokens), { x: 0, z: 1 });
});

test("held keys are not cleared on blur-like visible states", () => {
  assert.equal(shouldClearHeldKeys("visible"), false);
  assert.equal(shouldClearHeldKeys(""), false);
  assert.equal(shouldClearHeldKeys("hidden"), true);
});

test("start spawn (0, 1.2) is free of offset desks and can step south", () => {
  const desks = [
    { minX: -3.7, maxX: -2.3, minY: 0, maxY: 1.1, minZ: -2.36, maxZ: -1.64 },
    { minX: 1.7, maxX: 3.1, minY: 0, maxY: 1.1, minZ: 1.74, maxZ: 2.46 },
    { minX: -1.9, maxX: -0.5, minY: 0, maxY: 1.1, minZ: 2.84, maxZ: 3.56 },
  ];
  const blocked = (x: number, z: number) => desks.some((box) => circleHitsAabb(x, z, 0.3, box));
  const spawn = firstFreePoint(blocked, 0, 1.2);
  assert.equal(spawn.x, 0);
  assert.equal(spawn.z, 1.2);
  assert.equal(blocked(0, 1.2 - 0.4), false, "one step toward the south door must be open");
});

test("firstFreePoint walks off a blocked preferred spawn", () => {
  const wall = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 2, minZ: 1.0, maxZ: 1.4 };
  const blocked = (x: number, z: number) => circleHitsAabb(x, z, 0.3, wall);
  const spawn = firstFreePoint(blocked, 0, 1.2);
  assert.equal(blocked(spawn.x, spawn.z), false);
});
