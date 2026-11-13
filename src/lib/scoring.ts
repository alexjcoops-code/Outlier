// Crowd scoring. The same rules are implemented in SQL (score_tier in the
// migrations); tests/unit/sql.test.ts checks the two agree.

export type TierId = 'obvious' | 'clever' | 'fair' | 'rare' | 'outlier' | 'lone' | 'none';

export interface TierInfo {
  id: TierId;
  name: string;
  points: number;
  /** Symbol used in the share text. */
  symbol: string;
  /** One-line rule for the mark scheme. */
  rule: string;
}

export const TIERS: Record<TierId, TierInfo> = {
  obvious: { id: 'obvious', name: 'Obvious', points: 10, symbol: '·', rule: '1 in 5 or more said it' },
  clever: { id: 'clever', name: 'Predictably Clever', points: 15, symbol: '○', rule: 'famous number' },
  fair: { id: 'fair', name: 'Fair', points: 30, symbol: '◐', rule: '8% to 20% said it' },
  rare: { id: 'rare', name: 'Rare', points: 60, symbol: '●', rule: '3% to 8% said it' },
  outlier: { id: 'outlier', name: 'Outlier', points: 85, symbol: '★', rule: 'under 3% said it' },
  lone: { id: 'lone', name: 'Lone Wolf', points: 100, symbol: '✦', rule: 'nobody else said it' },
  none: { id: 'none', name: 'No answer', points: 0, symbol: '✗', rule: 'out of time' },
};

/** Mark-scheme order, lowest to highest. */
export const TIER_ORDER: readonly TierId[] = ['obvious', 'clever', 'fair', 'rare', 'outlier', 'lone'];

export const MAX_TOTAL = 700;
/** Ghosts carry no weight once this many real players have played today. */
export const GHOST_FADE_PLAYERS = 200;

export function ghostWeight(realPlayers: number): number {
  return Math.max(0, 1 - realPlayers / GHOST_FADE_PLAYERS);
}

export interface CrowdCounts {
  /** Real answers to this prompt equal to yours, including your own. */
  sameReal: number;
  /** All real answers to this prompt, including your own. */
  totalReal: number;
  sameGhost: number;
  totalGhost: number;
  /** Distinct real players today; sets the ghost weight. */
  realPlayers: number;
  /** Is the answer on this prompt's "famous numbers" list? */
  clever: boolean;
}

export interface Score {
  tier: TierId;
  points: number;
  /** Weighted share of answers equal to yours, 0–1. */
  share: number;
}

export function scoreAnswer(c: CrowdCounts): Score {
  const w = ghostWeight(c.realPlayers);
  const same = c.sameReal + w * c.sameGhost;
  const total = c.totalReal + w * c.totalGhost;
  const share = total > 0 ? same / total : 1;

  let tier: TierId;
  if (c.sameReal <= 1 && w * c.sameGhost === 0) tier = 'lone';
  else if (share >= 0.2) tier = 'obvious';
  else if (share < 0.03) tier = 'outlier';
  else if (c.clever) tier = 'clever';
  else if (share >= 0.08) tier = 'fair';
  else tier = 'rare';

  return { tier, points: TIERS[tier].points, share };
}

/** "4%", "under 1%", "23%" */
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 1) return 'under 1%';
  return `${Math.round(pct)}%`;
}
