/**
 * Turn what the player typed into a whole number, or null if it isn't one.
 * Commas and spaces are stripped ("1,024" and "1 024" are both 1024).
 * Decimals, signs, letters and anything else are rejected.
 */
export function parseAnswer(raw: string): number | null {
  const cleaned = raw.replace(/[\s,  ]/g, '');
  if (!/^\d{1,12}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}
