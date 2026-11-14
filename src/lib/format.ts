/**
 * How an answer is written on the page. Four-digit answers are often years
 * (1979) or clock times (1325), which look wrong with a comma, so commas only
 * start at 10,000.
 */
export function formatAnswer(n: number): string {
  return Math.abs(n) < 10_000 ? String(n) : n.toLocaleString('en-GB');
}

/** Highlighter colours by tier, for canvas drawing (which can't read CSS variables). Keep in step with tokens.css. */
export const TIER_HEX: Record<string, string> = {
  obvious: '#cfcfcf',
  clever: '#b9d7f0',
  fair: '#ffe97a',
  rare: '#ffb570',
  outlier: '#ff7a8a',
  lone: '#8fdd9c',
  none: '#cfcfcf',
};

/** The teacher's green pen: Lone Wolf stamps and top awards. */
export const GREEN_INK = '#1c7a45';
