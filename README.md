# Paper Toss

A responsive browser game with deterministic throw physics, changing fan wind,
five difficulty levels, rim bounces, streak scoring, sound, and a device-local
high score. Its centered, forward-facing office view is inspired by the original
mobile game.

**Play:** https://isaiahcampusano.github.io/papertoss/

## Controls

- Touch or mouse: start on the paper ball, flick upward, and steer left or right
  to compensate for the fan.
- Keyboard: focus the game, use left/right to steer and up/down for power, then
  press Space to toss.

Every two made shots advances the difficulty. The fan indicator and animated
airflow show the current wind direction and strength. The aiming gesture shows
direction and power without revealing the full flight path.

## Development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Use `npm test` for the engine and interaction tests, and `npm run build` for the
same production build deployed to GitHub Pages.

## Project structure

- `src/game/PaperTossGame.js` — launch physics, collision, score, and statistics
- `src/game/levels.js` — difficulty presets
- `src/game/progression.js` — score-to-level progression
- `src/ui/input.js` — pointer-swipe conversion
- `src/main.js` — Canvas rendering, controls, sound, and session behavior

In world coordinates, positive `x` points toward the bin, positive `y` points
down, and positive `z` points right. `windSpeed` is lateral acceleration in
m/s². Swept collision checks prevent fast throws from skipping through the rim.

GitHub Actions tests and builds every update to `main`, then deploys the Vite
output to GitHub Pages. Online accounts and shared leaderboards are outside the
static-site scope and would require a separate network service.
