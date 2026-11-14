// Which seven prompts appear on which day.
//
// The choice for a day depends only on the date and on what was used in the
// days before it, so it is the same for everyone. On the server the history
// comes from the daily_prompts table; offline it is rebuilt by replaying every
// day since EPOCH, which gives the same answer.
//
// Two rules keep regular players doing maths rather than remembering:
//   - a question never comes back within NO_REPEAT_DAYS;
//   - a question type (family) never comes back within FAMILY_GAP_DAYS, and
//     never appears twice on one day.

import { PROMPTS, type Prompt } from '../prompts.ts';
import { seededRng, shuffle } from './rng.ts';
import { addDays, dayNumber } from './ukDate.ts';

export const PROMPTS_PER_DAY = 7;
/** A question may not appear twice within any window of this many days. */
export const NO_REPEAT_DAYS = 60;
/** A family used on one day is barred for this many days after it. */
export const FAMILY_GAP_DAYS = 3;
/** Replay starts here. Changing it reshuffles history, so don't. */
export const EPOCH = '2026-01-01';

/** Difficulty of each slot, in play order: easier first, hardest last. */
const SLOT_DIFFICULTY = [1, 1, 1, 2, 2, 2, 3] as const;

export interface History {
  /** Question ids used in the previous NO_REPEAT_DAYS − 1 days. */
  ids: ReadonlySet<string>;
  /** Families used in the previous FAMILY_GAP_DAYS days. */
  families: ReadonlySet<string>;
}

const familyCache = new WeakMap<readonly Prompt[], Map<string, string>>();

function familyOf(bank: readonly Prompt[], id: string): string | undefined {
  let map = familyCache.get(bank);
  if (!map) {
    map = new Map(bank.map((p) => [p.id, p.family]));
    familyCache.set(bank, map);
  }
  return map.get(id);
}

/**
 * The history that applies to `date`, given the ids used on each earlier day.
 * Ids that aren't in the bank (questions since retired) still block a repeat
 * of themselves but have no family.
 */
export function historyFor(
  date: string,
  idsOn: (day: string) => readonly string[],
  bank: readonly Prompt[] = PROMPTS,
): History {
  const ids = new Set<string>();
  const families = new Set<string>();
  for (let back = 1; back < NO_REPEAT_DAYS; back++) {
    for (const id of idsOn(addDays(date, -back))) {
      ids.add(id);
      if (back <= FAMILY_GAP_DAYS) {
        const fam = familyOf(bank, id);
        if (fam) families.add(fam);
      }
    }
  }
  return { ids, families };
}

/** Pick the day's prompts given what came before. Returns ids in play order. */
export function selectDay(date: string, history: History, bank: readonly Prompt[] = PROMPTS): string[] {
  const rng = seededRng(`outlier-day:${date}`);
  const pool = shuffle(
    bank.filter((x) => !history.ids.has(x.id) && !history.families.has(x.family)),
    rng,
  );
  const chosen: Prompt[] = [];
  const usedIds = new Set<string>();
  const usedFamilies = new Set<string>();
  const take = (x: Prompt) => {
    chosen.push(x);
    usedIds.add(x.id);
    usedFamilies.add(x.family);
  };
  const free = (x: Prompt) => !usedIds.has(x.id) && !usedFamilies.has(x.family);

  // Hardest slot first: it has the smallest pool.
  for (const want of [...SLOT_DIFFICULTY].reverse()) {
    const exact = pool.find((x) => free(x) && x.difficulty === want);
    if (exact) take(exact);
  }
  // If a difficulty ran dry, fill the gaps with any free question of a new family.
  for (const x of pool) {
    if (chosen.length >= PROMPTS_PER_DAY) break;
    if (free(x)) take(x);
  }
  if (chosen.length < PROMPTS_PER_DAY) {
    throw new Error(`Prompt bank too small: only ${chosen.length} prompts free on ${date}`);
  }
  // Stable sort keeps the shuffled order within a difficulty.
  return chosen
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.difficulty - b.x.difficulty || a.i - b.i)
    .map(({ x }) => x.id);
}

const replayCache = new WeakMap<readonly Prompt[], Map<number, string[]>>();

/** The prompts for a date, replayed from EPOCH. Deterministic and memoised. */
export function dailyPromptIds(date: string, bank: readonly Prompt[] = PROMPTS): string[] {
  let days = replayCache.get(bank);
  if (!days) {
    days = new Map();
    replayCache.set(bank, days);
  }
  const memo = days;
  const target = dayNumber(date);
  const start = dayNumber(EPOCH);
  const empty: History = { ids: new Set(), families: new Set() };
  if (target < start) return selectDay(date, empty, bank);

  // Find the latest day already computed, then walk forward.
  let from = target;
  while (from > start && !memo.has(from)) from--;
  for (let d = memo.has(from) ? from + 1 : from; d <= target; d++) {
    const day = addDays(EPOCH, d - start);
    const history = historyFor(day, (earlier) => memo.get(dayNumber(earlier)) ?? [], bank);
    memo.set(d, selectDay(day, history, bank));
  }
  return memo.get(target)!;
}
