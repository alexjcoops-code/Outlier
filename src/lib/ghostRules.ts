// Rule-based ghost players: sample valid answers weighted by human salience.

import { validAnswers, type Prompt } from '../prompts.ts';
import { GHOST_WEIGHTS, type GhostWeights } from './ghostWeights.ts';
import { allDigitsSame } from './maths.ts';
import type { Rng } from './rng.ts';

const TIMES_TABLE = new Set<number>();
for (let a = 2; a <= 12; a++) for (let b = 2; b <= 12; b++) TIMES_TABLE.add(a * b);

/** How strongly a ghost is drawn to answer n, the rank-th smallest valid answer (0-based). */
export function salience(
  n: number,
  rank: number,
  prompt: Prompt,
  w: GhostWeights = GHOST_WEIGHTS,
): number {
  let weight = 1 + w.rank.strength / (1 + rank / w.rank.halfLife);
  if (rank < w.firstFew.count) weight *= w.firstFew.boost;

  if (n <= 12) weight *= w.small.upTo12;
  else if (n <= 20) weight *= w.small.upTo20;
  else if (n <= 100) weight *= w.small.upTo100;

  const extraDigits = String(n).length - 3;
  if (extraDigits > 0) weight *= Math.pow(w.perExtraDigit, extraDigits);

  if (n % 10 === 0) weight *= w.endsIn0;
  else if (n % 10 === 5) weight *= w.endsIn5;

  if (TIMES_TABLE.has(n)) weight *= w.timesTable;
  if ((w.famous.numbers as readonly number[]).includes(n)) weight *= w.famous.boost;
  if (prompt.cleverList.includes(n)) weight *= w.cleverList;
  if (n >= w.age.min && n <= w.age.max) weight *= w.age.boost;
  if (n >= w.birthYear.min && n <= w.birthYear.max) weight *= w.birthYear.boost;
  if (allDigitsSame(n)) weight *= w.repeatedDigits;

  return weight;
}

/** Draw `count` ghost answers for a prompt (with replacement). All are valid. */
export function sampleGhosts(
  prompt: Prompt,
  count: number,
  rng: Rng,
  w: GhostWeights = GHOST_WEIGHTS,
): number[] {
  const valid = validAnswers(prompt);
  const cumulative: number[] = [];
  let total = 0;
  valid.forEach((n, rank) => {
    total += salience(n, rank, prompt, w);
    cumulative.push(total);
  });
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const target = rng() * total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! > target) hi = mid;
      else lo = mid + 1;
    }
    out.push(valid[lo]!);
  }
  return out;
}
