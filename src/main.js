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
  canHeight: 0.42,
  ballRadius: 0.028,
  maxFlightTime: 5,
});

const view = { width: 960, height: 560, scale: 1, originX: 0, originY: 0 };
const drag = { active: false, pointerId: null, startX: 0, startY: 0, x: 0, y: 0 };
const keyboardAim = { active: false, angleRad: Math.PI / 4, power: Math.sqrt(game.gravity * game.canDistance) };
const particles = [];

let currentLevelIndex = 0;
let highScore = Number.parseInt(readStorage(storageKeys.highScore, "0"), 10) || 0;
let muted = readStorage(storageKeys.muted, "false") === "true";
let audioContext;
let feedbackTimer;

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  view.width = bounds.width;
  view.height = bounds.height;
  view.originX = bounds.width * 0.09;
  view.originY = bounds.height * 0.69;
  view.scale = (bounds.width * 0.76) / Math.max(1.25, game.canDistance + 0.25);
}

function toScreen(ball = game.ball) {
  return {
    x: view.originX + ball.x * view.scale,
    y: view.originY + ball.y * view.scale,
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

function applyLevel(index) {
  currentLevelIndex = index;
  game.setDifficulty(LEVELS[index]);
  keyboardAim.power = clamp(Math.sqrt(game.gravity * game.canDistance), 1.8, 5.4);
  resizeCanvas();
  updateScoreboard();
}

function roundedRectangle(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function drawRoom(now) {
  const gradient = context.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#faf6ee");
  gradient.addColorStop(0.68, "#eee5d7");
  gradient.addColorStop(0.68, "#ba7d4d");
  gradient.addColorStop(1, "#744226");
  context.fillStyle = gradient;
  context.fillRect(0, 0, view.width, view.height);

  context.fillStyle = "rgba(101, 73, 48, 0.08)";
  for (let y = 42; y < view.height * 0.65; y += 56) context.fillRect(0, y, view.width, 1);

  const windowWidth = view.width * 0.19;
  const windowHeight = view.height * 0.25;
  const windowX = view.width * 0.73;
  const windowY = view.height * 0.11;
  context.fillStyle = "#fffdf7";
  context.fillRect(windowX - 6, windowY - 6, windowWidth + 12, windowHeight + 12);
  const sky = context.createLinearGradient(0, windowY, 0, windowY + windowHeight);
  sky.addColorStop(0, "#aad7df");
  sky.addColorStop(1, "#e5eee5");
  context.fillStyle = sky;
  context.fillRect(windowX, windowY, windowWidth, windowHeight);
  context.fillStyle = "rgba(255, 255, 255, 0.65)";
  context.fillRect(windowX + windowWidth * 0.48, windowY, 5, windowHeight);
  context.fillRect(windowX, windowY + windowHeight * 0.48, windowWidth, 5);

  context.fillStyle = "#f0cf67";
  context.save();
  context.translate(view.width * 0.14, view.height * 0.18);
  context.rotate(-0.035);
  context.fillRect(-38, -28, 76, 56);
  context.fillStyle = "rgba(77, 62, 42, 0.42)";
  context.fillRect(-25, -10, 47, 3);
  context.fillRect(-25, 2, 35, 3);
  context.restore();

  context.fillStyle = "rgba(54, 34, 22, 0.16)";
  context.fillRect(0, view.height * 0.68, view.width, 5);
  drawFan(now);
}

function drawFan(now) {
  const speed = Math.max(0.7, Math.abs(game.windSpeed) * 1.5);
  const rotation = reduceMotion ? 0 : (now / 1000) * speed;
  const fanX = view.width * 0.47;
  const fanY = view.originY - 57;

  context.save();
  context.translate(fanX, fanY);
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
  const span = view.width * 0.16;
  context.save();
  context.strokeStyle = "rgba(47, 119, 111, 0.34)";
  context.lineWidth = 2;
  context.setLineDash([12, 12]);
  context.lineDashOffset = reduceMotion ? 0 : (-now / 22) * direction;
  for (let index = -1; index <= 1; index += 1) {
    context.beginPath();
    context.moveTo(fanX + direction * 42, fanY + index * 15);
    context.lineTo(fanX + direction * (42 + span), fanY + index * 15);
    context.stroke();
  }
  context.restore();
}

function drawBin() {
  const centerX = view.originX + game.canDistance * view.scale;
  const openingY = view.originY + game.canYOffset * view.scale;
  const openingWidth = game.canWidth * view.scale;
  const bodyHeight = Math.min(game.canHeight * view.scale, view.height * 0.26);

  context.save();
  context.fillStyle = "rgba(40, 30, 24, 0.22)";
  context.beginPath();
  context.ellipse(centerX + 12, openingY + bodyHeight + 7, openingWidth * 0.72, 12, 0, 0, Math.PI * 2);
  context.fill();

  const metal = context.createLinearGradient(centerX - openingWidth / 2, 0, centerX + openingWidth / 2, 0);
  metal.addColorStop(0, "#687477");
  metal.addColorStop(0.5, "#aab3b4");
  metal.addColorStop(1, "#626d6f");
  context.fillStyle = metal;
  context.beginPath();
  context.moveTo(centerX - openingWidth * 0.48, openingY + 2);
  context.lineTo(centerX + openingWidth * 0.48, openingY + 2);
  context.lineTo(centerX + openingWidth * 0.37, openingY + bodyHeight);
  context.lineTo(centerX - openingWidth * 0.37, openingY + bodyHeight);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(41, 51, 53, 0.36)";
  context.lineWidth = 1;
  for (let offset = -0.22; offset <= 0.22; offset += 0.11) {
    context.beginPath();
    context.moveTo(centerX + openingWidth * offset, openingY + 9);
    context.lineTo(centerX + openingWidth * offset * 0.74, openingY + bodyHeight - 8);
    context.stroke();
  }

  context.fillStyle = "#283234";
  context.beginPath();
  context.ellipse(centerX, openingY, openingWidth / 2, Math.max(8, openingWidth * 0.12), 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#c5cdcd";
  context.lineWidth = 5;
  context.stroke();
  context.restore();
}

function drawPaper(ball = game.ball) {
  const position = toScreen(ball);
  const radius = Math.max(12, game.ballRadius * view.scale);

  context.save();
  context.translate(position.x, position.y);
  context.rotate(reduceMotion ? 0 : ball.elapsed * 7);
  context.fillStyle = "rgba(31, 25, 21, 0.18)";
  context.beginPath();
  context.ellipse(5, radius + 9, radius * 0.9, radius * 0.36, 0, 0, Math.PI * 2);
  context.fill();

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

function drawTrajectory(launch) {
  if (!launch) return;
  const vx = Math.cos(launch.angleRad) * launch.power;
  const vy = -Math.sin(launch.angleRad) * launch.power;

  context.save();
  for (let step = 1; step <= 34; step += 1) {
    const time = step * 0.035;
    const ball = {
      x: vx * time + 0.5 * game.windSpeed * time ** 2,
      y: vy * time + 0.5 * game.gravity * time ** 2,
    };
    if (time > 0.2 && ball.y > game.canYOffset + 0.08) break;
    const point = toScreen(ball);
    if (point.x > view.width || point.y < 0) break;
    context.globalAlpha = clamp(0.7 - step * 0.018, 0.16, 0.7);
    context.fillStyle = "#ed7d3a";
    context.beginPath();
    context.arc(point.x, point.y, Math.max(1.5, 3.5 - step * 0.06), 0, Math.PI * 2);
    context.fill();
  }
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
  drawTrajectory(launch);
  if (!drag.active) return;

  context.save();
  context.setLineDash([8, 9]);
  context.strokeStyle = launch ? "#ed7d3a" : "rgba(80, 69, 59, 0.38)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(drag.startX, drag.startY);
  context.lineTo(drag.x, drag.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = launch ? "#ed7d3a" : "#7c746b";
  context.beginPath();
  context.arc(drag.x, drag.y, 6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function spawnCelebration() {
  if (reduceMotion) return;
  const target = toScreen({ x: game.canDistance, y: game.canYOffset });
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
  game.launch(launch.angleRad, launch.power);
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
    setStatus("Try a longer swipe toward the bin.", "missed");
    return;
  }
  launchShot(launch);
}

canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", () => {
  drag.active = false;
  updatePower(null);
  setStatus("Drag the paper toward the bin and release.");
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

  if (event.key === "ArrowLeft") keyboardAim.angleRad = clamp(keyboardAim.angleRad + 0.05, 0.12, 1.45);
  if (event.key === "ArrowRight") keyboardAim.angleRad = clamp(keyboardAim.angleRad - 0.05, 0.12, 1.45);
  if (event.key === "ArrowUp") keyboardAim.power = clamp(keyboardAim.power + 0.15, 1.8, 5.4);
  if (event.key === "ArrowDown") keyboardAim.power = clamp(keyboardAim.power - 0.15, 1.8, 5.4);
  if (event.key === " ") launchShot(keyboardAim);
  else {
    updatePower(keyboardAim);
    setStatus("Aim with arrows. Press Space to toss.", "aiming");
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
    if (result.landed) finishThrow(result);
  }

  updateParticles(dt);
  draw(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
