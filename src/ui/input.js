const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Convert an upward screen-space flick into forward power and lateral aim. */
export function swipeToLaunch({ startX, startY, endX, endY }) {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  const upwardDistance = -dy;

  if (distance < 18 || upwardDistance < 14) return null;

  const angleRad = Math.PI / 4;
  const powerProgress = clamp((upwardDistance - 18) / 202, 0, 1);
  const power = 1.8 + powerProgress * 3.6;
  const lateralSpeed = clamp(dx / 90, -1.35, 1.35);

  return { angleRad, power, lateralSpeed, distance };
}
