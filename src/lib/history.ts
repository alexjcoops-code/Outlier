// "My book": past results and the streak, kept in localStorage alongside the player id.

import type { DayResults } from './backend/types.ts';
import type { TierId } from './scoring.ts';
import { addDays } from './ukDate.ts';

export interface HistoryEntry {
  total: number;
  tiers: TierId[];
  /** False while the score could still change (the day hasn't ended). */
  final: boolean;
}

export type History = Record<string, HistoryEntry>;

const KEY = 'outlier:history';

export function loadHistory(): History {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as History;
  } catch {
    return {};
  }
}

/** Record a finished day (all seven prompts seen). Returns the updated history. */
export function recordDay(results: DayResults): History {
  const history = loadHistory();
  if (!results.rows.every((r) => r.started)) return history;
  history[results.date] = {
    total: results.total,
    tiers: results.rows.map((r) => r.tier),
    final: results.final,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable */
  }
  return history;
}

/** Consecutive days played, counting back from today (or yesterday, if today isn't done yet). */
export function streak(history: History, today: string): number {
  let day = history[today] ? today : addDays(today, -1);
  let n = 0;
  while (history[day]) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
