# Paper Toss

A dependency-free JavaScript game-logic engine for a Paper Toss clone. It
models launch velocity, gravity, fan wind, target collision, scoring, misses,
streaks, and difficulty changes without depending on a rendering framework.

## Requirements

- Node.js 20 or newer

## Run the tests

```sh
npm test
```

## Use the engine

```js
import { PaperTossGame } from "./src/game/PaperTossGame.js";

const game = new PaperTossGame({
  canDistance: 1,
  canWidth: 0.24,
  canYOffset: 0,
  windSpeed: 0.8,
});

// Angle is in radians and power is the initial speed in metres per second.
game.launch(Math.PI / 4, 3.2);

function tick(deltaSeconds) {
  const result = game.update(deltaSeconds);

  // Render with result.ball.x and result.ball.y.
  if (result.landed) {
    console.log(result.scored ? "Made it!" : "Missed", game.getStats());
  }
}
```

Coordinates follow the screen convention: positive `x` is right and positive
`y` is down. `windSpeed` is therefore horizontal acceleration in m/s², not a
literal air speed. Positive values push right; negative values push left.

## API

- `launch(angleRad, power)` starts a throw and returns `false` if one is active.
- `update(dt)` advances physics and returns `{ landed, scored, reason, ball }`.
- `setDifficulty(settings)` changes the bin or wind between throws.
- `getState()` returns a render-friendly snapshot of the game.
- `getStats()` returns score, throws, misses, accuracy, and streak data.
- `resetBall()` readies the ball while preserving stats.
- `resetGame()` clears the full session.

Difficulty presets are exported from `src/game/levels.js`.

## Integration notes

Call `launch` when the player releases a swipe, converting the swipe direction
to an angle and its length or speed to power. Call `update` from the frontend's
animation loop using elapsed seconds. The engine uses small internal simulation
steps, so a slow visual frame will not let the ball skip through the bin.

This is the local game-logic layer described in the handoff. A network backend
for accounts, leaderboards, saved progress, or server-side throw validation is
not included yet.
