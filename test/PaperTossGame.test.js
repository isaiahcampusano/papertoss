import test from "node:test";
import assert from "node:assert/strict";

import { PaperTossGame } from "../src/game/PaperTossGame.js";

const runUntilLanded = (game, limit = 5) => {
  const dt = 1 / 60;
  for (let elapsed = 0; elapsed < limit; elapsed += dt) {
    const result = game.update(dt);
    if (result.landed) return result;
  }
  throw new Error("The throw did not land within the test limit");
};

test("launch converts angle and power into screen-space velocity", () => {
  const game = new PaperTossGame();

  assert.equal(game.launch(Math.PI / 4, 10), true);
  assert.ok(Math.abs(game.ball.vx - Math.SQRT1_2 * 10) < 1e-12);
  assert.ok(Math.abs(game.ball.vy + Math.SQRT1_2 * 10) < 1e-12);
  assert.equal(game.getStats().throws, 1);
  assert.equal(game.launch(Math.PI / 4, 10), false);
});

test("constant acceleration produces deterministic motion", () => {
  const game = new PaperTossGame({
    canYOffset: 10,
    canHeight: 10,
    windSpeed: 2,
    gravity: 10,
  });

  game.launch(0, 4);
  const result = game.update(0.5);

  assert.ok(Math.abs(result.ball.x - 2.25) < 1e-10);
  assert.ok(Math.abs(result.ball.y - 1.25) < 1e-10);
  assert.ok(Math.abs(result.ball.vx - 5) < 1e-10);
  assert.ok(Math.abs(result.ball.vy - 5) < 1e-10);
});

test("a centered descending throw scores", () => {
  const game = new PaperTossGame({
    canDistance: 1,
    canWidth: 0.3,
    ballRadius: 0.02,
  });
  const powerForOneMetreRange = Math.sqrt(game.gravity);

  game.launch(Math.PI / 4, powerForOneMetreRange);
  const result = runUntilLanded(game);

  assert.equal(result.scored, true);
  assert.equal(result.reason, "bin");
  assert.ok(Math.abs(result.ball.x - 1) < 1e-3);
  assert.equal(game.getStats().score, 1);
});

test("crossing detection still scores when update receives a long frame", () => {
  const game = new PaperTossGame({
    canDistance: 1,
    canWidth: 0.3,
    ballRadius: 0.02,
  });

  game.launch(Math.PI / 4, Math.sqrt(game.gravity));
  const result = game.update(1);

  assert.equal(result.landed, true);
  assert.equal(result.scored, true);
});

test("a throw outside the opening records a miss", () => {
  const game = new PaperTossGame({
    canDistance: 1.5,
    canWidth: 0.25,
    ballRadius: 0.02,
  });

  game.launch(Math.PI / 4, Math.sqrt(game.gravity * 0.6));
  const result = runUntilLanded(game);

  assert.equal(result.scored, false);
  assert.equal(result.reason, "floor");
  assert.deepEqual(game.getStats(), {
    score: 0,
    throws: 1,
    misses: 1,
    accuracy: 0,
    currentStreak: 0,
    bestStreak: 0,
  });
});

test("difficulty can change between throws but not during one", () => {
  const game = new PaperTossGame();

  assert.equal(game.setDifficulty({ canDistance: 1.4, windAcceleration: -2 }), true);
  assert.equal(game.canDistance, 1.4);
  assert.equal(game.windSpeed, -2);

  game.launch(Math.PI / 4, 3);
  assert.equal(game.setDifficulty({ windSpeed: 5 }), false);
  assert.equal(game.windSpeed, -2);
});

test("invalid configuration and simulation input fail early", () => {
  assert.throws(
    () => new PaperTossGame({ canWidth: 0.05, ballRadius: 0.03 }),
    /wider than the ball diameter/,
  );

  const game = new PaperTossGame();
  assert.throws(() => game.launch(0.5, 0), /greater than zero/);
  assert.throws(() => game.update(-0.1), /cannot be negative/);
});
