const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Convert a screen-space swipe into the engine's angle and power values. */
export function swipeToLaunch({ startX, startY, endX, endY }) {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);

  if (distance < 18 || dx < 10) return null;

  const angleRad = clamp(Math.atan2(-dy, dx), 0.12, 1.45);
  const powerProgress = clamp((distance - 18) / 202, 0, 1);
  const power = 1.8 + powerProgress * 3.6;

  return { angleRad, power, distance };
}
