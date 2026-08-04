import test from "node:test";
import assert from "node:assert/strict";

import { levelIndexForScore, windDescription } from "../src/game/progression.js";

test("the difficulty advances every two made shots", () => {
  assert.equal(levelIndexForScore(0, 5), 0);
  assert.equal(levelIndexForScore(1, 5), 0);
  assert.equal(levelIndexForScore(2, 5), 1);
  assert.equal(levelIndexForScore(8, 5), 4);
  assert.equal(levelIndexForScore(100, 5), 4);
});

test("wind descriptions expose direction and strength", () => {
  assert.equal(windDescription(0), "Still");
  assert.equal(windDescription(1.25), "Right 1.3");
  assert.equal(windDescription(-2), "Left 2.0");
});

test("invalid progression input fails early", () => {
  assert.throws(() => levelIndexForScore(-1, 5), /cannot be negative/);
  assert.throws(() => levelIndexForScore(1, 0), /positive integer/);
});
