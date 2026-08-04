import "./style.css";

import { PaperTossGame } from "./game/PaperTossGame.js";
import { LEVELS } from "./game/levels.js";
import { swipeToLaunch } from "./ui/input.js";

const canvas = document.querySelector("#gameCanvas");
const context = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const throwsElement = document.querySelector("#throws");
const streakElement = document.querySelector("#streak");
const windElement = document.querySelector("#wind");
const statusElement = document.querySelector("#gameStatus");
const resetButton = document.querySelector("#resetGame");

const game = new PaperTossGame({
  ...LEVELS[0],
  canWidth: 0.28,
  canHeight: 0.42,
  ballRadius: 0.028,
  maxFlightTime: 5,
});

const view = { width: 960, height: 560, scale: 1, originX: 0, originY: 0 };
const drag = { active: false, pointerId: null, startX: 0, startY: 0, x: 0, y: 0 };

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

function updateScoreboard() {
  const stats = game.getStats();
  scoreElement.textContent = stats.score;
  throwsElement.textContent = stats.throws;
  streakElement.textContent = stats.currentStreak;
  windElement.textContent = game.windSpeed === 0 ? "Still" : `${game.windSpeed > 0 ? "→" : "←"} ${Math.abs(game.windSpeed).toFixed(1)}`;
}

function setStatus(message, tone = "ready") {
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
}

function roundedRectangle(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function drawRoom() {
  const gradient = context.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#f8f4ec");
  gradient.addColorStop(0.68, "#eee6d9");
  gradient.addColorStop(0.68, "#ba7d4d");
  gradient.addColorStop(1, "#7d4b2e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, view.width, view.height);

  context.fillStyle = "rgba(101, 73, 48, 0.09)";
  for (let y = 44; y < view.height * 0.65; y += 58) {
    context.fillRect(0, y, view.width, 1);
  }

  context.fillStyle = "rgba(54, 34, 22, 0.16)";
  context.fillRect(0, view.height * 0.68, view.width, 5);

  context.save();
  context.translate(view.width * 0.48, view.originY - 54);
  context.fillStyle = "#615c57";
  context.fillRect(-5, 26, 10, 54);
  context.fillStyle = "#44413e";
  roundedRectangle(context, -40, 76, 80, 12, 6);
  context.fill();
  context.fillStyle = "#2e7d72";
  context.beginPath();
  context.arc(0, 0, 35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#d8ece8";
  for (let index = 0; index < 4; index += 1) {
    context.rotate(Math.PI / 2);
    context.beginPath();
    context.ellipse(0, -17, 9, 22, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "#f3b23d";
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fill();
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

  context.fillStyle = "#7c8688";
  context.beginPath();
  context.moveTo(centerX - openingWidth * 0.48, openingY + 2);
  context.lineTo(centerX + openingWidth * 0.48, openingY + 2);
  context.lineTo(centerX + openingWidth * 0.37, openingY + bodyHeight);
  context.lineTo(centerX - openingWidth * 0.37, openingY + bodyHeight);
  context.closePath();
  context.fill();

  context.fillStyle = "#283234";
  context.beginPath();
  context.ellipse(centerX, openingY, openingWidth / 2, Math.max(8, openingWidth * 0.12), 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#aeb8b9";
  context.lineWidth = 5;
  context.stroke();
  context.restore();
}

function drawPaper(ball = game.ball) {
  const position = toScreen(ball);
  const radius = Math.max(13, game.ballRadius * view.scale);

  context.save();
  context.translate(position.x, position.y);
  context.rotate(ball.elapsed * 7);
  context.fillStyle = "rgba(31, 25, 21, 0.18)";
  context.beginPath();
  context.ellipse(5, radius + 9, radius * 0.9, radius * 0.36, 0, 0, Math.PI * 2);
  context.fill();

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

function drawAim() {
  if (!drag.active) return;

  const launch = swipeToLaunch({
    startX: drag.startX,
    startY: drag.startY,
    endX: drag.x,
    endY: drag.y,
  });

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

function draw() {
  context.clearRect(0, 0, view.width, view.height);
  drawRoom();
  drawBin();
  drawAim();
  drawPaper();
}

canvas.addEventListener("pointerdown", (event) => {
  if (game.ballInFlight) return;
  const point = pointerPosition(event);
  const ball = toScreen();
  if (Math.hypot(point.x - ball.x, point.y - ball.y) > 56) return;

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
});

function finishDrag(event) {
  if (!drag.active || event.pointerId !== drag.pointerId) return;

  Object.assign(drag, pointerPosition(event));
  const launch = swipeToLaunch({
    startX: drag.startX,
    startY: drag.startY,
    endX: drag.x,
    endY: drag.y,
  });
  drag.active = false;

  if (!launch) {
    setStatus("Try a longer swipe toward the bin.", "missed");
    return;
  }

  game.launch(launch.angleRad, launch.power);
  updateScoreboard();
  setStatus("In the air…", "flying");
}

canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", () => {
  drag.active = false;
  setStatus("Drag the paper toward the bin and release.");
});

resetButton.addEventListener("click", () => {
  game.resetGame();
  drag.active = false;
  updateScoreboard();
  setStatus("Fresh sheet. Take your shot.");
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateScoreboard();

let previousTime = performance.now();
function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.15);
  previousTime = now;

  if (game.ballInFlight) {
    const result = game.update(dt);
    if (result.landed) {
      setStatus(result.scored ? "Clean toss!" : "Just missed. Try again.", result.scored ? "scored" : "missed");
      updateScoreboard();
      game.resetBall();
    }
  }

  draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
