import assert from "node:assert/strict";
import { test } from "node:test";
import { rotateWall, rotateY, wallNormal, yawFromTurns } from "../client/src/game/math.ts";

test("rotateY matches Three.js Ry and rotateWall at 90° steps", () => {
  const south = rotateY(0, -1, yawFromTurns(1));
  assert.ok(Math.abs(south.x - -1) < 1e-9, "local south maps to world west after +90°");
  assert.ok(Math.abs(south.z) < 1e-9);
  assert.equal(rotateWall("s", 1), "w");

  const north = rotateY(0, 1, yawFromTurns(1));
  assert.ok(Math.abs(north.x - 1) < 1e-9, "local north maps to world east after +90°");
  assert.ok(Math.abs(north.z) < 1e-9);
  assert.equal(rotateWall("n", 1), "e");

  const flip = rotateY(0, -1, yawFromTurns(2));
  assert.ok(Math.abs(flip.x) < 1e-9);
  assert.ok(Math.abs(flip.z - 1) < 1e-9, "local south maps to world north after 180°");
  assert.equal(rotateWall("s", 2), "n");
});

test("door outward after yaw matches the wall's world normal", () => {
  for (const turns of [0, 1, 2, 3] as const) {
    const yaw = yawFromTurns(turns);
    const local = wallNormal("s");
    const world = rotateY(local.x, local.z, yaw);
    const expectedWall = rotateWall("s", turns);
    const expected = wallNormal(expectedWall);
    assert.ok(Math.abs(world.x - expected.x) < 1e-9, `turn ${turns} x`);
    assert.ok(Math.abs(world.z - expected.z) < 1e-9, `turn ${turns} z`);
  }
});
