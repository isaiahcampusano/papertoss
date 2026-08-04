# Paper Toss

A responsive browser game with deterministic throw physics, changing fan wind,
five difficulty levels, streak scoring, sound, and a device-local high score.

**Play:** https://isaiahcampusano.github.io/papertoss/

## Controls

- Touch or mouse: start on the paper ball, swipe up and right, then release.
- Keyboard: focus the game, use the arrow keys to adjust aim and power, then
  press Space to toss.

Every two made shots advances the difficulty. The fan indicator and animated
airflow show the current wind direction and strength.

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

Coordinates follow the screen convention: positive `x` is right and positive
`y` is down. `windSpeed` is horizontal acceleration in m/s². Small internal
simulation steps prevent fast throws from skipping through the bin.

GitHub Actions tests and builds every update to `main`, then deploys the Vite
output to GitHub Pages. Online accounts and shared leaderboards are outside the
static-site scope and would require a separate network service.
