// Playing a past worksheet from the archive.
//
// The day is over, so its crowd is final and nothing you do can change it. The
// archive backend wraps the real one: it asks it for the day's questions and,
// once you've answered, for that day's crowd, and marks you against that crowd
// in the browser. Your archive answers are kept in localStorage and never sent
// anywhere; they don't count towards your streak or anyone else's marks.

import { getPrompt, isValidAnswer } from '../../prompts.ts';
import { PROMPTS_PER_DAY } from '../daily.ts';
import { GHOST_CROWD, GHOST_FADE_PLAYERS, scoreFromCrowd } from '../scoring.ts';
import {
  GRACE_MS,
  TIMER_MS,
  type Backend,
  type DayResults,
  type DayRow,
  type Distribution,
  type SubmitResult,
} from './types.ts';

interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredDay {
  starts: Record<number, number>;
  answers: Record<number, number>;
}

/** Where a finished archive worksheet is recorded, for the archive list. */
export const ARCHIVE_SCORES_KEY = 'oddle:archive-scores';

export interface ArchiveScore {
  total: number;
  tiers: DayRow['tier'][];
}

export function loadArchiveScores(storage: KeyValue = localStorage): Record<string, ArchiveScore> {
  try {
    return JSON.parse(storage.getItem(ARCHIVE_SCORES_KEY) ?? '{}') as Record<string, ArchiveScore>;
  } catch {
    return {};
  }
}

export function recordArchiveScore(results: DayResults, storage: KeyValue = localStorage): void {
  if (!results.rows.every((r) => r.started)) return;
  const all = loadArchiveScores(storage);
  all[results.date] = { total: results.total, tiers: results.rows.map((r) => r.tier) };
  try {
    storage.setItem(ARCHIVE_SCORES_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Put your answer into a finished day's crowd, so the rack has a ball for you.
 * The crowd's weights aren't sent, only shares, so its size is rebuilt from the
 * player count the same way the scoring weighs ghosts.
 */
export function withMyAnswer(crowd: Distribution, mine: number | undefined): Distribution {
  if (mine === undefined) return crowd;
  const ghosts = GHOST_CROWD * Math.max(0, 1 - crowd.players / GHOST_FADE_PLAYERS);
  const size = Math.max(1, crowd.players + ghosts);
  const keep = size / (size + 1);
  const me = 1 / (size + 1);
  const values = crowd.values.map((v) => ({ value: v.value, share: v.share * keep }));
  const found = values.find((v) => v.value === mine);
  if (found) found.share += me;
  else values.push({ value: mine, share: me });
  values.sort((a, b) => b.share - a.share || a.value - b.value);
  return { ...crowd, players: crowd.players + 1, values };
}

export function createArchiveBackend(real: Backend, storage: KeyValue, now: () => number = () => Date.now()): Backend {
  const dayCache = new Map<string, Promise<DayResults>>();
  const crowdCache = new Map<string, Promise<Distribution>>();

  const key = (date: string) => `oddle:archive:${date}`;
  const load = (date: string): StoredDay => {
    try {
      const raw = storage.getItem(key(date));
      if (raw) return JSON.parse(raw) as StoredDay;
    } catch {
      /* start afresh */
    }
    return { starts: {}, answers: {} };
  };
  const save = (date: string, day: StoredDay) => {
    try {
      storage.setItem(key(date), JSON.stringify(day));
    } catch {
      /* private mode: play on without saving */
    }
  };

  /** The day as the server has it: its questions, its crowd size and its averages. */
  const theDay = (date: string) => {
    let p = dayCache.get(date);
    if (!p) {
      p = real.getResults(date);
      p.catch(() => dayCache.delete(date));
      dayCache.set(date, p);
    }
    return p;
  };
  const theCrowd = (date: string, position: number) => {
    const k = `${date}:${position}`;
    let p = crowdCache.get(k);
    if (!p) {
      p = real.getDistribution(date, position);
      p.catch(() => crowdCache.delete(k));
      crowdCache.set(k, p);
    }
    return p;
  };

  const mark = async (date: string, promptId: string, position: number, value: number) => {
    const crowd = await theCrowd(date, position);
    const share = crowd.values.find((v) => v.value === value)?.share ?? 0;
    return { ...scoreFromCrowd(share, getPrompt(promptId).cleverList.includes(value)), crowd };
  };

  return {
    kind: real.kind,

    async getResults(date) {
      const day = await theDay(date);
      const stored = load(date);
      const rows: DayRow[] = await Promise.all(
        day.rows.map(async (r): Promise<DayRow> => {
          const value = stored.answers[r.position];
          const started = stored.starts[r.position] !== undefined;
          if (value === undefined) {
            return { position: r.position, promptId: r.promptId, started, value: null, tier: 'none', points: 0, share: null };
          }
          const s = await mark(date, r.promptId, r.position, value);
          return { position: r.position, promptId: r.promptId, started, value, tier: s.tier, points: s.points, share: s.share };
        }),
      );
      return {
        date,
        final: true,
        total: rows.reduce((sum, r) => sum + r.points, 0),
        players: day.players,
        simulated: day.simulated,
        average: day.average,
        top10: day.top10,
        rows,
      };
    },

    async startPrompt(date, position) {
      if (position < 1 || position > PROMPTS_PER_DAY) throw new Error('No such question');
      await theDay(date);
      const day = load(date);
      if (position > 1 && day.starts[position - 1] === undefined) throw new Error('Questions must be answered in order');
      if (day.starts[position] === undefined) {
        day.starts[position] = now();
        save(date, day);
      }
      return { remainingMs: Math.max(0, TIMER_MS - (now() - day.starts[position]!)) };
    },

    async submitAnswer(date, position, value): Promise<SubmitResult> {
      const day = load(date);
      const started = day.starts[position];
      if (started === undefined) return { ok: false, reason: 'not_started' };
      if (day.answers[position] !== undefined) return { ok: false, reason: 'already' };
      if (now() - started > TIMER_MS + GRACE_MS) return { ok: false, reason: 'expired' };
      const promptId = (await theDay(date)).rows[position - 1]!.promptId;
      if (!isValidAnswer(getPrompt(promptId), value)) return { ok: false, reason: 'invalid' };
      const s = await mark(date, promptId, position, value);
      day.answers[position] = value;
      save(date, day);
      return { ok: true, tier: s.tier, points: s.points, share: s.share, players: s.crowd.players, simulated: s.crowd.simulated };
    },

    async getDistribution(date, position) {
      const day = load(date);
      const answered = day.answers[position] !== undefined;
      const started = day.starts[position];
      // No peeking at the crowd before you've had your go.
      if (!answered && (started === undefined || now() - started < TIMER_MS)) throw new Error('no_peeking');
      return withMyAnswer(await theCrowd(date, position), day.answers[position]);
    },

    getAdminStats() {
      return Promise.reject(new Error('not_available'));
    },
  };
}
