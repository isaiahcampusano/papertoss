const DEFAULTS = Object.freeze({
  canDistance: 1,
  canWidth: 0.24,
  canDepth: 0.2,
  canHeight: 0.45,
  canYOffset: 0,
  windSpeed: 0,
  gravity: 9.81,
  ballRadius: 0.035,
  rimRadius: 0.012,
  rimRestitution: 0.62,
  rimFriction: 0.08,
  rimCooldown: 0.045,
  simulationStep: 1 / 120,
  maxFlightTime: 8,
});

const copyBall = (ball) => ({ ...ball });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const assertUnitInterval = (name, value) => {
  assertFinite(name, value);
  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between zero and one`);
  }
};

/**
 * Deterministic Paper Toss game logic using metres and seconds.
 *
 * +x points away from the player, +y points down, and +z points right.
 * Gravity accelerates y while the fan accelerates z, matching the original
 * game's forward-facing view and lateral wind.
 */
export class PaperTossGame {
  constructor(options = {}) {
    const config = { ...DEFAULTS, ...options };

    assertFinite("canDistance", config.canDistance);
    assertPositive("canWidth", config.canWidth);
    assertPositive("canDepth", config.canDepth);
    assertPositive("canHeight", config.canHeight);
    assertFinite("canYOffset", config.canYOffset);
    assertFinite("windSpeed", config.windSpeed);
    assertPositive("gravity", config.gravity);
    assertPositive("ballRadius", config.ballRadius);
    assertPositive("rimRadius", config.rimRadius);
    assertUnitInterval("rimRestitution", config.rimRestitution);
    assertUnitInterval("rimFriction", config.rimFriction);
    assertPositive("rimCooldown", config.rimCooldown);
    assertPositive("simulationStep", config.simulationStep);
    assertPositive("maxFlightTime", config.maxFlightTime);

    if (config.ballRadius * 2 >= Math.min(config.canWidth, config.canDepth)) {
      throw new RangeError("canWidth and canDepth must be wider than the ball diameter");
    }

    this.canDistance = config.canDistance;
    this.canWidth = config.canWidth;
    this.canDepth = config.canDepth;
    this.canHeight = config.canHeight;
    this.canYOffset = config.canYOffset;
    this.windSpeed = config.windSpeed;
    this.gravity = config.gravity;
    this.ballRadius = config.ballRadius;
    this.rimRadius = config.rimRadius;
    this.rimRestitution = config.rimRestitution;
    this.rimFriction = config.rimFriction;
    this.rimCooldown = config.rimCooldown;
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
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      elapsed: 0,
    };
    this.ballInFlight = false;
    this.rimBounceCooldown = 0;
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
      canDepth: settings.canDepth ?? this.canDepth,
      canHeight: settings.canHeight ?? this.canHeight,
      canYOffset: settings.canYOffset ?? this.canYOffset,
      windSpeed: settings.windAcceleration ?? settings.windSpeed ?? this.windSpeed,
    };

    assertFinite("canDistance", next.canDistance);
    assertPositive("canWidth", next.canWidth);
    assertPositive("canDepth", next.canDepth);
    assertPositive("canHeight", next.canHeight);
    assertFinite("canYOffset", next.canYOffset);
    assertFinite("windSpeed", next.windSpeed);

    if (this.ballRadius * 2 >= Math.min(next.canWidth, next.canDepth)) {
      throw new RangeError("canWidth and canDepth must be wider than the ball diameter");
    }

    Object.assign(this, next);
    return true;
  }

  /**
   * Launch the ball with an elevation angle, power, and lateral velocity.
   * Returns false when a previous throw is still in flight.
   */
  launch(angleRad, power, lateralSpeed = 0) {
    assertFinite("angleRad", angleRad);
    assertPositive("power", power);
    assertFinite("lateralSpeed", lateralSpeed);

    if (this.ballInFlight) return false;

    this.ball = {
      x: 0,
      y: 0,
      z: 0,
      vx: Math.cos(angleRad) * power,
      vy: -Math.sin(angleRad) * power,
      vz: lateralSpeed,
      elapsed: 0,
    };
    this.ballInFlight = true;
    this.rimBounceCooldown = 0;
    this.throws += 1;
    return true;
  }

  /**
   * Advance the simulation by dt seconds.
   *
   * Small internal steps and swept rim checks prevent a fast ball from
   * tunnelling through the bin when the renderer receives a slow frame.
   */
  update(dt) {
    assertFinite("dt", dt);
    if (dt < 0) throw new RangeError("dt cannot be negative");

    if (!this.ballInFlight || dt === 0) {
      return this.#result(false, false, null, false);
    }

    let remaining = dt;
    let rimHit = false;

    while (remaining > 0 && this.ballInFlight) {
      const step = Math.min(this.simulationStep, remaining);
      const previous = copyBall(this.ball);

      this.ball.x += previous.vx * step;
      this.ball.y += previous.vy * step + 0.5 * this.gravity * step ** 2;
      this.ball.z += previous.vz * step + 0.5 * this.windSpeed * step ** 2;
      this.ball.vy += this.gravity * step;
      this.ball.vz += this.windSpeed * step;
      this.ball.elapsed += step;
      this.rimBounceCooldown = Math.max(0, this.rimBounceCooldown - step);
      remaining -= step;

      const rimImpact = this.rimBounceCooldown === 0 ? this.#rimImpact(previous, this.ball) : null;
      if (rimImpact) {
        this.ball = rimImpact;
        this.rimBounceCooldown = this.rimCooldown;
        rimHit = true;
        continue;
      }

      const binImpact = this.#binImpact(previous, this.ball);
      if (binImpact) {
        this.ball = binImpact;
        this.ballInFlight = false;
        this.score += 1;
        this.currentStreak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
        return this.#result(true, true, "bin", rimHit);
      }

      const belowFloor = this.ball.y - this.ballRadius > this.canYOffset + this.canHeight;
      const timedOut = this.ball.elapsed >= this.maxFlightTime;

      if (belowFloor || timedOut) {
        this.ballInFlight = false;
        this.misses += 1;
        this.currentStreak = 0;
        return this.#result(true, false, belowFloor ? "floor" : "timeout", rimHit);
      }
    }

    return this.#result(false, false, null, rimHit);
  }

  getState() {
    return {
      status: this.ballInFlight ? "flying" : "ready",
      ball: copyBall(this.ball),
      target: {
        x: this.canDistance,
        z: 0,
        openingY: this.canYOffset,
        width: this.canWidth,
        depth: this.canDepth,
        height: this.canHeight,
        rimRadius: this.rimRadius,
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

  #rimImpact(previous, current) {
    if (previous.y > this.canYOffset && current.y > this.canYOffset) return null;

    const collisionRadius = this.ballRadius + this.rimRadius;
    const travel = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
    const samples = clamp(Math.ceil(travel / (collisionRadius * 0.35)), 2, 24);
    let low = 0;
    let high = null;

    for (let index = 1; index <= samples; index += 1) {
      const time = index / samples;
      const point = this.#interpolateBall(previous, current, time);
      if (this.#rimSeparation(point).distance <= collisionRadius) {
        high = time;
        low = (index - 1) / samples;
        break;
      }
    }

    if (high === null) return null;

    for (let iteration = 0; iteration < 7; iteration += 1) {
      const middle = (low + high) / 2;
      const point = this.#interpolateBall(previous, current, middle);
      if (this.#rimSeparation(point).distance <= collisionRadius) high = middle;
      else low = middle;
    }

    const contact = this.#interpolateBall(previous, current, high);
    const separation = this.#rimSeparation(contact);
    let { dx: nx, dy: ny, dz: nz } = separation;
    const normalLength = Math.hypot(nx, ny, nz);

    if (normalLength > 1e-9) {
      nx /= normalLength;
      ny /= normalLength;
      nz /= normalLength;
    } else {
      const speed = Math.hypot(contact.vx, contact.vy, contact.vz) || 1;
      nx = -contact.vx / speed;
      ny = -contact.vy / speed;
      nz = -contact.vz / speed;
    }

    const normalVelocity = contact.vx * nx + contact.vy * ny + contact.vz * nz;
    if (normalVelocity >= -1e-6) return null;

    const tangentScale = 1 - this.rimFriction;
    const outgoingNormalSpeed = -normalVelocity * this.rimRestitution;
    const tangentX = contact.vx - normalVelocity * nx;
    const tangentY = contact.vy - normalVelocity * ny;
    const tangentZ = contact.vz - normalVelocity * nz;
    const pushDistance = collisionRadius + 1e-6;

    return {
      x: separation.rimX + nx * pushDistance,
      y: this.canYOffset + ny * pushDistance,
      z: separation.rimZ + nz * pushDistance,
      vx: tangentX * tangentScale + outgoingNormalSpeed * nx,
      vy: tangentY * tangentScale + outgoingNormalSpeed * ny,
      vz: tangentZ * tangentScale + outgoingNormalSpeed * nz,
      elapsed: contact.elapsed,
    };
  }

  #rimSeparation(ball) {
    const radiusX = this.canDepth / 2;
    const radiusZ = this.canWidth / 2;
    const offsetX = ball.x - this.canDistance;
    const offsetZ = ball.z;
    const angle =
      Math.abs(offsetX) + Math.abs(offsetZ) < 1e-12
        ? 0
        : Math.atan2(offsetZ / radiusZ, offsetX / radiusX);
    const rimX = this.canDistance + Math.cos(angle) * radiusX;
    const rimZ = Math.sin(angle) * radiusZ;
    const dx = ball.x - rimX;
    const dy = ball.y - this.canYOffset;
    const dz = ball.z - rimZ;

    return { rimX, rimZ, dx, dy, dz, distance: Math.hypot(dx, dy, dz) };
  }

  #interpolateBall(previous, current, ratio) {
    return {
      x: previous.x + (current.x - previous.x) * ratio,
      y: previous.y + (current.y - previous.y) * ratio,
      z: previous.z + (current.z - previous.z) * ratio,
      vx: previous.vx + (current.vx - previous.vx) * ratio,
      vy: previous.vy + (current.vy - previous.vy) * ratio,
      vz: previous.vz + (current.vz - previous.vz) * ratio,
      elapsed: previous.elapsed + (current.elapsed - previous.elapsed) * ratio,
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
    const impact = this.#interpolateBall(previous, current, ratio);
    const usableDepth = this.canDepth / 2 - this.ballRadius;
    const usableWidth = this.canWidth / 2 - this.ballRadius;
    const depthOffset = (impact.x - this.canDistance) / usableDepth;
    const lateralOffset = impact.z / usableWidth;

    if (depthOffset ** 2 + lateralOffset ** 2 > 1) return null;
    return impact;
  }

  #result(landed, scored, reason, rimHit) {
    return {
      landed,
      scored,
      reason,
      rimHit,
      ball: copyBall(this.ball),
    };
  }
}

export default PaperTossGame;
