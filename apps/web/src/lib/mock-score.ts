/**
 * MOCK: the backend has no quality scoring or save-rate prediction yet.
 * Scores are derived from the id so they stay stable between renders.
 */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Predicted save rate in percent, 3.4–5.6. */
export function predictedSaveRate(id: string): number {
  return Math.round((3.4 + hash(id) * 2.2) * 10) / 10;
}

/** AI quality score, 86–96. */
export function aiQualityScore(id: string): number {
  return Math.round(86 + hash(`q${id}`) * 10);
}
