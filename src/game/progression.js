export const SCORES_PER_LEVEL = 2;

export function levelIndexForScore(score, levelCount, scoresPerLevel = SCORES_PER_LEVEL) {
  if (!Number.isInteger(levelCount) || levelCount < 1) {
    throw new RangeError("levelCount must be a positive integer");
  }
  if (!Number.isFinite(score) || score < 0) {
    throw new RangeError("score cannot be negative");
  }
  if (!Number.isInteger(scoresPerLevel) || scoresPerLevel < 1) {
    throw new RangeError("scoresPerLevel must be a positive integer");
  }

  return Math.min(Math.floor(score / scoresPerLevel), levelCount - 1);
}

export function windDescription(windAcceleration) {
  if (windAcceleration === 0) return "Still";
  const direction = windAcceleration > 0 ? "Right" : "Left";
  return `${direction} ${Math.abs(windAcceleration).toFixed(1)}`;
}
