const DEFAULTS = Object.freeze({
  canDistance: 1,
  canWidth: 0.24,
  canHeight: 0.45,
  canYOffset: 0,
  windSpeed: 0,
  gravity: 9.81,
  ballRadius: 0.035,
  simulationStep: 1 / 120,
  maxFlightTime: 8,
});

const copyBall = (ball) => ({ ...ball });

const assertFinite = (name, value) => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
};

const assertPositive = (name, value) => {
  assertFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
};

/**
 * Deterministic Paper Toss game logic using metres and seconds.
 *
 * Coordinates match a typical screen: +x points right and +y points down.
 * Wind and gravity are constant accelerations measured in m/s^2.
 */
export class PaperTossGame {
  constructor(options = {}) {
    const config = { ...DEFAULTS, ...options };

    assertFinite("canDistance", config.canDistance);
    assertPositive("canWidth", config.canWidth);
    assertPositive("canHeight", config.canHeight);
    assertFinite("canYOffset", config.canYOffset);
    assertFinite("windSpeed", config.windSpeed);
    assertPositive("gravity", config.gravity);
    assertPositive("ballRadius", config.ballRadius);
    assertPositive("simulationStep", config.simulationStep);
    assertPositive("maxFlightTime", config.maxFlightTime);

    if (config.ballRadius * 2 >= config.canWidth) {
      throw new RangeError("canWidth must be wider than the ball diameter");
    }

    this.canDistance = config.canDistance;
    this.canWidth = config.canWidth;
    this.canHeight = config.canHeight;
    this.canYOffset = config.canYOffset;
    this.windSpeed = config.windSpeed;
    this.gravity = config.gravity;
    this.ballRadius = config.ballRadius;
    this.simulationStep = config.simulationStep;
    this.maxFlightTime = config.maxFlightTime;

    this.score = 0;
    this.throws = 0;
    this.misses = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.resetBall();
  }

  /** Reset the paper ball without changing score statistics. */
  resetBall() {
    this.ball = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      elapsed: 0,
    };
    this.ballInFlight = false;
  }

  /** Reset the entire session, including scoring statistics. */
  resetGame() {
    this.score = 0;
    this.throws = 0;
    this.misses = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.resetBall();
  }

  /**
   * Change the target or wind between throws.
   * Returns false if a throw is currently in progress.
   */
  setDifficulty(settings = {}) {
    if (this.ballInFlight) return false;

    const next = {
      canDistance: settings.canDistance ?? this.canDistance,
      canWidth: settings.canWidth ?? this.canWidth,
      canHeight: settings.canHeight ?? this.canHeight,
      canYOffset: settings.canYOffset ?? this.canYOffset,
      windSpeed: settings.windAcceleration ?? settings.windSpeed ?? this.windSpeed,
    };

    assertFinite("canDistance", next.canDistance);
    assertPositive("canWidth", next.canWidth);
    assertPositive("canHeight", next.canHeight);
    assertFinite("canYOffset", next.canYOffset);
    assertFinite("windSpeed", next.windSpeed);

    if (this.ballRadius * 2 >= next.canWidth) {
      throw new RangeError("canWidth must be wider than the ball diameter");
    }

    Object.assign(this, next);
    return true;
  }

  /**
   * Launch the ball with an angle above horizontal and an initial speed.
   * Returns false when a previous throw is still in flight.
   */
  launch(angleRad, power) {
    assertFinite("angleRad", angleRad);
    assertPositive("power", power);

    if (this.ballInFlight) return false;

    this.ball = {
      x: 0,
      y: 0,
      vx: Math.cos(angleRad) * power,
      vy: -Math.sin(angleRad) * power,
      elapsed: 0,
    };
    this.ballInFlight = true;
    this.throws += 1;
    return true;
  }

  /**
   * Advance the simulation by dt seconds.
   *
   * Small internal steps and crossing interpolation prevent a fast ball from
   * tunnelling through the bin opening when the renderer has a slow frame.
   */
  update(dt) {
    assertFinite("dt", dt);
    if (dt < 0) throw new RangeError("dt cannot be negative");

    if (!this.ballInFlight || dt === 0) {
      return this.#result(false, false, null);
    }

    let remaining = dt;

    while (remaining > 0 && this.ballInFlight) {
      const step = Math.min(this.simulationStep, remaining);
      const previous = copyBall(this.ball);

      this.ball.x += previous.vx * step + 0.5 * this.windSpeed * step ** 2;
      this.ball.y += previous.vy * step + 0.5 * this.gravity * step ** 2;
      this.ball.vx += this.windSpeed * step;
      this.ball.vy += this.gravity * step;
      this.ball.elapsed += step;
      remaining -= step;

      const impact = this.#binImpact(previous, this.ball);
      if (impact) {
        this.ball = impact;
        this.ballInFlight = false;
        this.score += 1;
        this.currentStreak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
        return this.#result(true, true, "bin");
      }

      const belowFloor = this.ball.y - this.ballRadius > this.canYOffset + this.canHeight;
      const timedOut = this.ball.elapsed >= this.maxFlightTime;

      if (belowFloor || timedOut) {
        this.ballInFlight = false;
        this.misses += 1;
        this.currentStreak = 0;
        return this.#result(true, false, belowFloor ? "floor" : "timeout");
      }
    }

    return this.#result(false, false, null);
  }

  getState() {
    return {
      status: this.ballInFlight ? "flying" : "ready",
      ball: copyBall(this.ball),
      target: {
        x: this.canDistance,
        openingY: this.canYOffset,
        width: this.canWidth,
        height: this.canHeight,
      },
      windAcceleration: this.windSpeed,
      ...this.getStats(),
    };
  }

  getStats() {
    return {
      score: this.score,
      throws: this.throws,
      misses: this.misses,
      accuracy: this.throws === 0 ? 0 : (this.score / this.throws) * 100,
      currentStreak: this.currentStreak,
      bestStreak: this.bestStreak,
    };
  }

  #binImpact(previous, current) {
    const crossedOpening =
      previous.y <= this.canYOffset &&
      current.y >= this.canYOffset &&
      current.vy > 0 &&
      current.y !== previous.y;

    if (!crossedOpening) return null;

    const ratio = (this.canYOffset - previous.y) / (current.y - previous.y);
    const x = previous.x + (current.x - previous.x) * ratio;
    const usableHalfWidth = this.canWidth / 2 - this.ballRadius;

    if (Math.abs(x - this.canDistance) > usableHalfWidth) return null;

    return {
      x,
      y: this.canYOffset,
      vx: previous.vx + (current.vx - previous.vx) * ratio,
      vy: previous.vy + (current.vy - previous.vy) * ratio,
      elapsed: previous.elapsed + (current.elapsed - previous.elapsed) * ratio,
    };
  }

  #result(landed, scored, reason) {
    return {
      landed,
      scored,
      reason,
      ball: copyBall(this.ball),
    };
  }
}

export default PaperTossGame;
