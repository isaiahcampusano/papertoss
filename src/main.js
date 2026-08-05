import "./style.css";

import { PaperTossGame } from "./game/PaperTossGame.js";
import { LEVELS } from "./game/levels.js";
import { levelIndexForScore, windDescription } from "./game/progression.js";
import { swipeToLaunch } from "./ui/input.js";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d");
const gameCard = document.querySelector(".game-card");
const scoreElement = document.querySelector("#score");
const throwsElement = document.querySelector("#throws");
const streakElement = document.querySelector("#streak");
const bestScoreElement = document.querySelector("#bestScore");
const windElement = document.querySelector("#wind");
const statusElement = document.querySelector("#gameStatus");
const levelElement = document.querySelector("#levelLabel");
const powerFill = document.querySelector("#powerFill");
const powerValue = document.querySelector("#powerValue");
const resetButton = document.querySelector("#resetGame");
const soundButton = document.querySelector("#toggleSound");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const storageKeys = { highScore: "paper-toss-high-score", muted: "paper-toss-muted" };
const CAMERA_TILT = Object.freeze({
  referenceWidth: 760,
  minimumStrength: 0.62,
  originOffset: 0.012,
  targetOffset: 0.035,
  vanishingPointOffset: 0.07,
  horizonSlope: 0.006,
  rimYaw: 0.035,
});

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The game remains fully playable when browser storage is unavailable.
  }
}

const game = new PaperTossGame({
  ...LEVELS[0],
  canWidth: 0.28,
  canDepth: 0.21,
  canHeight: 0.42,
  ballRadius: 0.028,
  maxFlightTime: 5,
});

const view = {
  width: 960,
  height: 560,
  originX: 0,
  originY: 0,
  targetX: 0,
  targetY: 0,
  vanishingX: 0,
  horizonLeftY: 0,
  horizonRightY: 0,
  rollSlope: 0,
  rollRadians: 0,
  rimRotation: 0,
  tiltStrength: 1,
  verticalScale: 1,
  lateralScale: 1,
};
const drag = { active: false, pointerId: null, startX: 0, startY: 0, x: 0, y: 0 };
const keyboardAim = {
  active: false,
  angleRad: Math.PI / 4,
  power: Math.sqrt(game.gravity * game.canDistance),
  lateralSpeed: 0,
};
const particles = [];

let currentLevelIndex = 0;
let highScore = Number.parseInt(readStorage(storageKeys.highScore, "0"), 10) || 0;
let muted = readStorage(storageKeys.muted, "false") === "true";
let audioContext;
let feedbackTimer;
let rimFlash = 0;

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  view.width = bounds.width;
  view.height = bounds.height;
  view.tiltStrength = clamp(
    bounds.width / CAMERA_TILT.referenceWidth,
    CAMERA_TILT.minimumStrength,
    1,
  );
  view.originX = bounds.width * (0.5 - CAMERA_TILT.originOffset * view.tiltStrength);
  view.originY = bounds.height * 0.86;
  view.targetX = bounds.width * (0.5 + CAMERA_TILT.targetOffset * view.tiltStrength);
  view.vanishingX = bounds.width * (0.5 + CAMERA_TILT.vanishingPointOffset * view.tiltStrength);
  view.horizonLeftY = bounds.height * (0.54 - CAMERA_TILT.horizonSlope * view.tiltStrength);
  view.horizonRightY = bounds.height * (0.54 + CAMERA_TILT.horizonSlope * view.tiltStrength);
  view.rollSlope = (view.horizonRightY - view.horizonLeftY) / bounds.width;
  view.rollRadians = Math.atan(view.rollSlope);
  view.rimRotation = view.rollRadians + CAMERA_TILT.rimYaw * view.tiltStrength;
  view.targetY = horizonYAt(view.targetX) + bounds.height * 0.04;
  view.verticalScale = bounds.height * 0.72;
  view.lateralScale = Math.min(bounds.width * 0.58, 520) / Math.max(1, game.canDistance);
}

function horizonYAt(x) {
  return view.horizonLeftY + x * view.rollSlope;
}

function toScreen(ball = game.ball) {
  const progress = clamp(ball.x / game.canDistance, 0, 1.4);
  const perspective = 1.18 - clamp(progress, 0, 1) * 0.18;
  const centerX = view.originX + (view.targetX - view.originX) * progress;
  const x = centerX + (ball.z ?? 0) * view.lateralScale * perspective;
  return {
    x,
    y:
      view.originY +
      (view.targetY - view.originY) * progress +
      ball.y * view.verticalScale +
      (x - centerX) * view.rollSlope,
    progress,
  };
}

function pointerPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function setStatus(message, tone = "ready") {
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
  gameCard.dataset.feedback = tone;
  window.clearTimeout(feedbackTimer);
  if (tone === "scored" || tone === "missed") {
    feedbackTimer = window.setTimeout(() => {
      gameCard.dataset.feedback = "ready";
    }, 700);
  }
}

function updatePower(launch) {
  if (!launch) {
    powerFill.style.width = "0%";
    powerValue.textContent = "Ready";
    return;
  }

  const progress = clamp((launch.power - 1.8) / 3.6, 0, 1);
  powerFill.style.width = `${Math.round(progress * 100)}%`;
  powerValue.textContent = `${launch.power.toFixed(1)} m/s`;
}

function updateScoreboard() {
  const stats = game.getStats();
  scoreElement.textContent = stats.score;
  throwsElement.textContent = stats.throws;
  streakElement.textContent = stats.currentStreak;
  bestScoreElement.textContent = highScore;
  windElement.textContent = windDescription(game.windSpeed);
  const level = LEVELS[currentLevelIndex];
  levelElement.textContent = `Level ${currentLevelIndex + 1} · ${level.name}`;
}

function updateSoundButton() {
  soundButton.textContent = muted ? "Sound off" : "Sound on";
  soundButton.setAttribute("aria-pressed", String(!muted));
  soundButton.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
}

function getAudioContext() {
  if (muted) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration, { delay = 0, type = "sine", volume = 0.045, endFrequency } = {}) {
  const audio = getAudioContext();
  if (!audio) return;

  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playThrowSound() {
  playTone(150, 0.18, { type: "triangle", volume: 0.025, endFrequency: 390 });
}

function playResultSound(scored) {
  if (scored) {
    playTone(523, 0.18, { type: "triangle" });
    playTone(784, 0.28, { delay: 0.12, type: "triangle", volume: 0.055 });
  } else {
    playTone(170, 0.26, { type: "sine", volume: 0.03, endFrequency: 105 });
  }
}

function playRimSound() {
  playTone(920, 0.065, { type: "square", volume: 0.018, endFrequency: 610 });
}

function applyLevel(index) {
  currentLevelIndex = index;
  game.setDifficulty(LEVELS[index]);
  keyboardAim.power = clamp(Math.sqrt(game.gravity * game.canDistance), 1.8, 5.4);
  keyboardAim.lateralSpeed = 0;
  resizeCanvas();
  updateScoreboard();
}

function roundedRectangle(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function drawRoom(now) {
  const wall = context.createLinearGradient(0, 0, 0, Math.max(view.horizonLeftY, view.horizonRightY));
  wall.addColorStop(0, "#faf7f0");
  wall.addColorStop(1, "#e7ddd0");
  context.fillStyle = wall;
  context.fillRect(0, 0, view.width, view.height);

  context.strokeStyle = "rgba(101, 73, 48, 0.08)";
  context.lineWidth = 1;
  for (let y = 42; y < view.horizonLeftY - 12; y += 56) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(view.width, y + view.horizonRightY - view.horizonLeftY);
    context.stroke();
  }

  const floor = context.createLinearGradient(0, Math.min(view.horizonLeftY, view.horizonRightY), 0, view.height);
  floor.addColorStop(0, "#b98255");
  floor.addColorStop(1, "#6d3d24");
  context.fillStyle = floor;
  context.beginPath();
  context.moveTo(0, view.horizonLeftY);
  context.lineTo(view.width, view.horizonRightY);
  context.lineTo(view.width, view.height);
  context.lineTo(0, view.height);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(75, 42, 24, 0.18)";
  context.lineWidth = 1;
  for (let offset = -3; offset <= 3; offset += 1) {
    const startX = view.vanishingX + offset * view.width * 0.008;
    const endX = view.vanishingX + offset * view.width * 0.22;
    context.beginPath();
    context.moveTo(startX, horizonYAt(startX));
    context.lineTo(endX, view.height);
    context.stroke();
  }

  context.fillStyle = "rgba(54, 34, 22, 0.18)";
  context.beginPath();
  context.moveTo(0, view.horizonLeftY - 4);
  context.lineTo(view.width, view.horizonRightY - 4);
  context.lineTo(view.width, view.horizonRightY + 3);
  context.lineTo(0, view.horizonLeftY + 3);
  context.closePath();
  context.fill();

  const windowWidth = view.width * 0.19;
  const windowHeight = view.height * 0.25;
  const windowX = view.width * (0.74 + 0.01 * view.tiltStrength);
  const windowY = view.height * 0.11;
  context.save();
  context.translate(windowX + windowWidth / 2, windowY + windowHeight / 2);
  context.rotate(view.rollRadians);
  context.fillStyle = "#fffdf7";
  context.fillRect(-windowWidth / 2 - 6, -windowHeight / 2 - 6, windowWidth + 12, windowHeight + 12);
  const sky = context.createLinearGradient(0, -windowHeight / 2, 0, windowHeight / 2);
  sky.addColorStop(0, "#aad7df");
  sky.addColorStop(1, "#e5eee5");
  context.fillStyle = sky;
  context.fillRect(-windowWidth / 2, -windowHeight / 2, windowWidth, windowHeight);
  context.fillStyle = "rgba(255, 255, 255, 0.65)";
  context.fillRect(-2.5, -windowHeight / 2, 5, windowHeight);
  context.fillRect(-windowWidth / 2, -2.5, windowWidth, 5);
  context.restore();

  context.fillStyle = "#f2cf68";
  context.save();
  context.translate(view.width * (0.16 - 0.01 * view.tiltStrength), view.height * 0.2);
  context.rotate(-0.035 + view.rollRadians);
  context.fillRect(-46, -32, 92, 64);
  context.fillStyle = "rgba(77, 62, 42, 0.42)";
  context.fillRect(-29, -11, 54, 3);
  context.fillRect(-29, 3, 41, 3);
  context.restore();

  drawFan(now);
}

function drawFan(now) {
  const speed = Math.max(0.7, Math.abs(game.windSpeed) * 1.5);
  const rotation = reduceMotion ? 0 : (now / 1000) * speed;
  const fanX = view.width * (game.windSpeed < 0 ? 0.73 : 0.29);
  const fanY = horizonYAt(fanX) - view.height * 0.015;

  context.save();
  context.translate(fanX, fanY);
  context.rotate(view.rollRadians);
  context.fillStyle = "#615c57";
  context.fillRect(-5, 28, 10, 54);
  context.fillStyle = "#44413e";
  roundedRectangle(context, -40, 78, 80, 12, 6);
  context.fill();
  context.fillStyle = "#2e7d72";
  context.beginPath();
  context.arc(0, 0, 36, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.35)";
  context.lineWidth = 2;
  context.stroke();

  context.rotate(rotation);
  context.fillStyle = "#d8ece8";
  for (let index = 0; index < 4; index += 1) {
    context.rotate(Math.PI / 2);
    context.beginPath();
    context.ellipse(0, -18, 9, 22, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "#f3b23d";
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fill();
  context.restore();

  if (game.windSpeed !== 0) drawWind(now, fanX, fanY);
}

function drawWind(now, fanX, fanY) {
  const direction = Math.sign(game.windSpeed);
  const span = view.width * 0.28;
  context.save();
  context.strokeStyle = "rgba(47, 119, 111, 0.34)";
  context.lineWidth = 2;
  context.setLineDash([12, 12]);
  context.lineDashOffset = reduceMotion ? 0 : (-now / 22) * direction;
  for (let index = -1; index <= 1; index += 1) {
    const startX = fanX + direction * 42;
    const endX = fanX + direction * (42 + span);
    context.beginPath();
    context.moveTo(startX, fanY + index * 15);
    context.lineTo(endX, fanY + index * 15 + (endX - startX) * view.rollSlope);
    context.stroke();
  }
  context.restore();
}

function drawBin() {
  const centerX = view.targetX;
  const openingY = view.targetY + game.canYOffset * view.verticalScale;
  const openingWidth = game.canWidth * view.lateralScale;
  const openingDepth = Math.max(18, game.canDepth * view.lateralScale * 0.34);
  const bodyHeight = Math.min(game.canHeight * view.verticalScale * 0.58, view.height * 0.23);
  const bodyBottomY = openingY + bodyHeight;
  const bottomCenterX = centerX + openingWidth * 0.025 * view.tiltStrength;
  const topLeftX = centerX - openingWidth * 0.5;
  const topRightX = centerX + openingWidth * 0.46;
  const topLeftY = openingY - Math.sin(view.rimRotation) * openingWidth * 0.48 + openingDepth * 0.08;
  const topRightY = openingY + Math.sin(view.rimRotation) * openingWidth * 0.44 + openingDepth * 0.08;
  const bottomLeftX = bottomCenterX - openingWidth * 0.35;
  const bottomRightX = bottomCenterX + openingWidth * 0.39;

  context.save();
  context.fillStyle = "rgba(40, 30, 24, 0.22)";
  context.beginPath();
  context.ellipse(
    bottomCenterX + 14,
    bodyBottomY + 9,
    openingWidth * 0.52,
    11,
    view.rimRotation,
    0,
    Math.PI * 2,
  );
  context.fill();

  const metal = context.createLinearGradient(centerX - openingWidth / 2, 0, centerX + openingWidth / 2, 0);
  metal.addColorStop(0, "#687477");
  metal.addColorStop(0.5, "#aab3b4");
  metal.addColorStop(1, "#626d6f");
  context.fillStyle = metal;
  context.beginPath();
  context.moveTo(topLeftX, topLeftY);
  context.lineTo(topRightX, topRightY);
  context.lineTo(bottomRightX, bodyBottomY);
  context.lineTo(bottomLeftX, bodyBottomY);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(34, 47, 49, 0.12)";
  context.beginPath();
  context.moveTo(centerX + openingWidth * 0.05, openingY + openingDepth * 0.18);
  context.lineTo(topRightX, topRightY);
  context.lineTo(bottomRightX, bodyBottomY);
  context.lineTo(bottomCenterX + openingWidth * 0.04, bodyBottomY);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(41, 51, 53, 0.36)";
  context.lineWidth = 1;
  for (let offset = -0.22; offset <= 0.22; offset += 0.11) {
    const startX = centerX + openingWidth * offset;
    context.beginPath();
    context.moveTo(
      startX,
      openingY + openingDepth * 0.42 + (startX - centerX) * view.rollSlope,
    );
    context.lineTo(bottomCenterX + openingWidth * offset * 0.72, bodyBottomY - 8);
    context.stroke();
  }

  context.fillStyle = "#283234";
  context.beginPath();
  context.ellipse(
    centerX,
    openingY,
    openingWidth / 2,
    openingDepth / 2,
    view.rimRotation,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.strokeStyle = rimFlash > 0 ? "#f3b23d" : "#c5cdcd";
  context.lineWidth = rimFlash > 0 ? 7 : 5;
  context.stroke();
  context.strokeStyle = "rgba(255, 255, 255, 0.38)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(
    centerX,
    openingY - 1,
    openingWidth * 0.46,
    openingDepth * 0.38,
    view.rimRotation,
    Math.PI,
    Math.PI * 2,
  );
  context.stroke();
  context.restore();
}

function drawPaper(ball = game.ball) {
  const position = toScreen(ball);
  const radius = 20 - clamp(position.progress, 0, 1) * 9;

  context.save();
  context.translate(position.x, position.y);
  context.fillStyle = `rgba(31, 25, 21, ${clamp(0.18 + ball.y * 0.2, 0.07, 0.22)})`;
  context.beginPath();
  context.ellipse(
    6 + view.tiltStrength * 3,
    radius + 9,
    radius * 0.9,
    radius * 0.36,
    view.rollRadians,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.rotate(reduceMotion ? 0 : ball.elapsed * 7);
  context.shadowColor = "rgba(72, 55, 41, 0.14)";
  context.shadowBlur = 8;
  context.fillStyle = "#fffdf8";
  context.strokeStyle = "#c9c3b8";
  context.lineWidth = 2;
  context.beginPath();
  for (let point = 0; point < 12; point += 1) {
    const angle = (point / 12) * Math.PI * 2;
    const wobble = point % 2 === 0 ? 1 : 0.78;
    const x = Math.cos(angle) * radius * wobble;
    const y = Math.sin(angle) * radius * wobble;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = "#ded8cd";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(-radius * 0.55, -radius * 0.2);
  context.lineTo(radius * 0.4, radius * 0.35);
  context.moveTo(-radius * 0.15, radius * 0.55);
  context.lineTo(radius * 0.5, -radius * 0.35);
  context.stroke();
  context.restore();
}

function activeAim() {
  if (drag.active) {
    return swipeToLaunch({
      startX: drag.startX,
      startY: drag.startY,
      endX: drag.x,
      endY: drag.y,
    });
  }
  return keyboardAim.active && !game.ballInFlight ? keyboardAim : null;
}

function drawAim() {
  const launch = activeAim();
  if (!launch) return;
  const paper = toScreen();
  const aimPoint = drag.active
    ? { x: drag.x, y: drag.y }
    : { x: paper.x + launch.lateralSpeed * 28, y: paper.y - 38 };

  context.save();
  context.setLineDash([8, 9]);
  context.strokeStyle = "#ed7d3a";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(paper.x, paper.y);
  context.lineTo(aimPoint.x, aimPoint.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "#ed7d3a";
  context.beginPath();
  context.arc(aimPoint.x, aimPoint.y, 6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function spawnCelebration() {
  if (reduceMotion) return;
  const target = toScreen({ x: game.canDistance, y: game.canYOffset, z: 0 });
  const colors = ["#ed7d3a", "#f3b23d", "#2f776f", "#fffdf8"];
  for (let index = 0; index < 38; index += 1) {
    particles.push({
      x: target.x,
      y: target.y,
      vx: (Math.random() - 0.5) * 230,
      vy: -70 - Math.random() * 190,
      life: 0.7 + Math.random() * 0.45,
      size: 3 + Math.random() * 5,
      color: colors[index % colors.length],
    });
  }
}

function updateParticles(dt) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 360 * dt;
    particle.life -= dt;
    if (particle.life <= 0) particles.splice(index, 1);
  }
}

function drawParticles() {
  for (const particle of particles) {
    context.globalAlpha = clamp(particle.life, 0, 1);
    context.fillStyle = particle.color;
    context.fillRect(particle.x, particle.y, particle.size, particle.size * 0.62);
  }
  context.globalAlpha = 1;
}

function draw(now) {
  context.clearRect(0, 0, view.width, view.height);
  drawRoom(now);
  drawBin();
  drawAim();
  drawPaper();
  drawParticles();
}

function launchShot(launch) {
  if (!launch || game.ballInFlight) return;
  game.launch(launch.angleRad, launch.power, launch.lateralSpeed);
  keyboardAim.active = false;
  updatePower(null);
  updateScoreboard();
  setStatus("In the air…", "flying");
  playThrowSound();
}

function finishThrow(result) {
  playResultSound(result.scored);

  if (result.scored) {
    highScore = Math.max(highScore, game.score);
    writeStorage(storageKeys.highScore, highScore);
    spawnCelebration();
    navigator.vibrate?.(35);
  }

  const previousLevel = currentLevelIndex;
  const nextLevel = levelIndexForScore(game.score, LEVELS.length);
  game.resetBall();
  if (nextLevel !== currentLevelIndex) applyLevel(nextLevel);

  if (result.scored && nextLevel > previousLevel) {
    setStatus(`Level up — ${LEVELS[nextLevel].name}!`, "scored");
  } else {
    setStatus(result.scored ? "Clean toss!" : "Just missed. Try again.", result.scored ? "scored" : "missed");
  }
  updateScoreboard();
}

canvas.addEventListener("pointerdown", (event) => {
  if (game.ballInFlight) return;
  canvas.focus({ preventScroll: true });
  keyboardAim.active = false;
  const point = pointerPosition(event);
  const ball = toScreen();
  if (Math.hypot(point.x - ball.x, point.y - ball.y) > 58) return;

  drag.active = true;
  drag.pointerId = event.pointerId;
  drag.startX = ball.x;
  drag.startY = ball.y;
  drag.x = point.x;
  drag.y = point.y;
  canvas.setPointerCapture(event.pointerId);
  setStatus("Release to toss.", "aiming");
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag.active || event.pointerId !== drag.pointerId) return;
  Object.assign(drag, pointerPosition(event));
  updatePower(activeAim());
});

function finishDrag(event) {
  if (!drag.active || event.pointerId !== drag.pointerId) return;
  Object.assign(drag, pointerPosition(event));
  const launch = activeAim();
  drag.active = false;

  if (!launch) {
    updatePower(null);
    setStatus("Try a longer upward flick.", "missed");
    return;
  }
  launchShot(launch);
}

canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", () => {
  drag.active = false;
  updatePower(null);
  setStatus("Flick the paper upward and release.");
});

canvas.addEventListener("focus", () => {
  if (!game.ballInFlight && !drag.active) {
    keyboardAim.active = true;
    updatePower(keyboardAim);
  }
});

canvas.addEventListener("blur", () => {
  keyboardAim.active = false;
  updatePower(null);
});

canvas.addEventListener("keydown", (event) => {
  if (game.ballInFlight) return;
  const handledKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
  if (!handledKeys.includes(event.key)) return;
  event.preventDefault();
  keyboardAim.active = true;

  if (event.key === "ArrowLeft") keyboardAim.lateralSpeed = clamp(keyboardAim.lateralSpeed - 0.08, -1.35, 1.35);
  if (event.key === "ArrowRight") keyboardAim.lateralSpeed = clamp(keyboardAim.lateralSpeed + 0.08, -1.35, 1.35);
  if (event.key === "ArrowUp") keyboardAim.power = clamp(keyboardAim.power + 0.15, 1.8, 5.4);
  if (event.key === "ArrowDown") keyboardAim.power = clamp(keyboardAim.power - 0.15, 1.8, 5.4);
  if (event.key === " ") launchShot(keyboardAim);
  else {
    updatePower(keyboardAim);
    setStatus("Steer with arrows. Press Space to toss.", "aiming");
  }
});

resetButton.addEventListener("click", () => {
  game.resetGame();
  drag.active = false;
  particles.length = 0;
  applyLevel(0);
  updatePower(null);
  setStatus("Fresh sheet. Take your shot.");
});

soundButton.addEventListener("click", () => {
  muted = !muted;
  writeStorage(storageKeys.muted, muted);
  updateSoundButton();
  if (!muted) playTone(440, 0.12, { type: "triangle", volume: 0.035 });
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateScoreboard();
updateSoundButton();

let previousTime = performance.now();
function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.15);
  previousTime = now;

  if (game.ballInFlight) {
    const result = game.update(dt);
    if (result.rimHit) {
      rimFlash = 0.14;
      playRimSound();
      setStatus("Off the rim…", "flying");
    }
    if (result.landed) finishThrow(result);
  }

  rimFlash = Math.max(0, rimFlash - dt);
  updateParticles(dt);
  draw(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
