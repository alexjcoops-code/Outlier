// A complete in-browser backend. Used when no Supabase project is configured
// (local development, the end-to-end test) and, with in-memory storage and
// random prompts, for practice mode. The crowd is 1,100 rule-based ghosts per
// prompt: what the real game uses when the Claude API is unavailable.

import { getPrompt, isValidAnswer, PROMPTS } from '../../prompts.ts';
import { dailyPromptIds, PROMPTS_PER_DAY } from '../daily.ts';
import { GHOST_CONFIG } from '../ghostConfig.ts';
import { generateRuleGhosts, type GhostPlayer } from '../ghostModel.ts';
import { seededRng, shuffle } from '../rng.ts';
import { ghostWeight, scoreAnswer, type Score } from '../scoring.ts';
import { ukDateString } from '../ukDate.ts';
import {
  GRACE_MS,
  TIMER_MS,
  type AdminStats,
  type Backend,
  type DayResults,
  type DayRow,
  type Distribution,
  type SubmitResult,
} from './types.ts';

interface StoredDay {
  starts: Record<number, number>;
  answers: Record<number, number>;
}

interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function memoryStorage(): KeyValue {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const GHOSTS_PER_PROMPT = GHOST_CONFIG.ruleGhosts + GHOST_CONFIG.aiGhosts;

interface Crowd {
  ghosts: GhostPlayer[];
  /** value → number of ghosts who gave it */
  counts: Map<number, number>;
  answered: number;
}

interface Options {
  kind: 'local' | 'practice';
  storage: KeyValue;
  /** Which prompts make up a "day". */
  promptIdsFor: (date: string) => string[];
  /** The year used for the "current year" salience boost. */
  yearFor: (date: string) => number;
  now?: () => number;
}

export function createLocalBackend(opts: Options): Backend {
  const now = opts.now ?? (() => Date.now());
  const crowdCache = new Map<string, Crowd>();

  const load = (date: string): StoredDay => {
    try {
      const raw = opts.storage.getItem(`outlier:day:${date}`);
      if (raw) return JSON.parse(raw) as StoredDay;
    } catch {
      /* corrupt or unavailable storage: start afresh */
    }
    return { starts: {}, answers: {} };
  };
  const save = (date: string, day: StoredDay) => {
    try {
      opts.storage.setItem(`outlier:day:${date}`, JSON.stringify(day));
    } catch {
      /* private mode: play on without saving */
    }
  };

  const crowdFor = (date: string, position: number): Crowd => {
    const key = `${date}:${position}`;
    let crowd = crowdCache.get(key);
    if (!crowd) {
      const prompt = getPrompt(opts.promptIdsFor(date)[position - 1]!);
      const ghosts = generateRuleGhosts(prompt, GHOSTS_PER_PROMPT, seededRng(`ghosts:${key}`), {
        year: opts.yearFor(date),
      });
      const counts = new Map<number, number>();
      for (const g of ghosts) if (g.value !== null) counts.set(g.value, (counts.get(g.value) ?? 0) + 1);
      crowd = { ghosts, counts, answered: ghosts.filter((g) => g.value !== null).length };
      crowdCache.set(key, crowd);
    }
    return crowd;
  };

  const score = (date: string, position: number, value: number): Score => {
    const prompt = getPrompt(opts.promptIdsFor(date)[position - 1]!);
    const crowd = crowdFor(date, position);
    return scoreAnswer({
      sameReal: 1,
      totalReal: 1,
      sameGhost: crowd.counts.get(value) ?? 0,
      totalGhost: crowd.answered,
      ghostCount: crowd.ghosts.length,
      realPlayers: 1,
      clever: prompt.cleverList.includes(value),
    });
  };

  /** What the ghosts would have scored, standing in for other players' totals. */
  const ghostTotals = (date: string): number[] => {
    const ids = opts.promptIdsFor(date);
    const totals = new Array<number>(GHOSTS_PER_PROMPT).fill(0);
    ids.forEach((id, i) => {
      const prompt = getPrompt(id);
      const crowd = crowdFor(date, i + 1);
      crowd.ghosts.forEach((g, k) => {
        if (g.value === null) return;
        totals[k]! += scoreAnswer({
          sameReal: 0,
          totalReal: 0,
          sameGhost: crowd.counts.get(g.value)!,
          totalGhost: crowd.answered,
          ghostCount: crowd.ghosts.length,
          realPlayers: 0,
          clever: prompt.cleverList.includes(g.value),
        }).points;
      });
    });
    return totals;
  };

  const today = () => ukDateString(new Date(now()));

  const isOver = (date: string, day: StoredDay, position: number): boolean => {
    if (opts.kind === 'local' && date < today()) return true;
    if (day.answers[position] !== undefined) return true;
    const started = day.starts[position];
    return started !== undefined && now() - started > TIMER_MS;
  };

  return {
    kind: opts.kind,

    async getResults(date): Promise<DayResults> {
      const day = load(date);
      const ids = opts.promptIdsFor(date);
      const rows: DayRow[] = ids.map((promptId, i) => {
        const position = i + 1;
        const value = day.answers[position];
        const started = day.starts[position] !== undefined;
        if (value === undefined) {
          return { position, promptId, started, value: null, tier: 'none', points: 0, share: null };
        }
        const s = score(date, position, value);
        return { position, promptId, started, value, tier: s.tier, points: s.points, share: s.share };
      });
      const totals = ghostTotals(date).sort((a, b) => a - b);
      return {
        date,
        final: opts.kind === 'local' && date < today(),
        total: rows.reduce((sum, r) => sum + r.points, 0),
        players: 1,
        simulated: true,
        average: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
        top10: totals[Math.floor(totals.length * 0.9)]!,
        rows,
      };
    },

    async startPrompt(date, position) {
      const day = load(date);
      if (position < 1 || position > PROMPTS_PER_DAY) throw new Error('No such question');
      if (opts.kind === 'local' && date !== today()) throw new Error('not_today');
      if (position > 1 && day.starts[position - 1] === undefined) {
        throw new Error('Questions must be answered in order');
      }
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
      const prompt = getPrompt(opts.promptIdsFor(date)[position - 1]!);
      if (!isValidAnswer(prompt, value)) return { ok: false, reason: 'invalid' };
      day.answers[position] = value;
      save(date, day);
      const s = score(date, position, value);
      return { ok: true, tier: s.tier, points: s.points, share: s.share, players: 1, simulated: true };
    },

    async getDistribution(date, position): Promise<Distribution> {
      const day = load(date);
      if (!isOver(date, day, position)) throw new Error('no_peeking');
      const crowd = crowdFor(date, position);
      const mine = day.answers[position];
      const w = ghostWeight(1, crowd.ghosts.length);
      const total = (mine === undefined ? 0 : 1) + w * crowd.answered;
      const values = new Set(crowd.counts.keys());
      if (mine !== undefined) values.add(mine);
      return {
        players: mine === undefined ? 0 : 1,
        simulated: true,
        values: [...values]
          .map((value) => ({
            value,
            share: ((value === mine ? 1 : 0) + w * (crowd.counts.get(value) ?? 0)) / total,
          }))
          .sort((a, b) => b.share - a.share || a.value - b.value),
      };
    },

    async getAdminStats(date): Promise<AdminStats> {
      const day = load(date);
      const ids = opts.promptIdsFor(date);
      return {
        date,
        players: Object.keys(day.answers).length > 0 ? 1 : 0,
        prompts: ids.map((promptId, i) => {
          const position = i + 1;
          const crowd = crowdFor(date, position);
          const table = new Map<number, { value: number; real: number; rules: number; ai: number }>();
          const cell = (value: number) => {
            let c = table.get(value);
            if (!c) table.set(value, (c = { value, real: 0, rules: 0, ai: 0 }));
            return c;
          };
          for (const [value, n] of crowd.counts) cell(value).rules += n;
          const mine = day.answers[position];
          if (mine !== undefined) cell(mine).real++;
          return {
            position,
            promptId,
            realTotal: mine === undefined ? 0 : 1,
            realTimeouts: mine === undefined && isOver(date, day, position) && day.starts[position] !== undefined ? 1 : 0,
            ghostCount: crowd.ghosts.length,
            ghostTimeouts: crowd.ghosts.length - crowd.answered,
            values: [...table.values()].sort((a, b) => a.value - b.value),
          };
        }),
      };
    },
  };
}

const yearOf = (date: string) => Number(date.slice(0, 4));

/** The offline stand-in for the real daily game. */
export function createLocalDailyBackend(storage: KeyValue): Backend {
  return createLocalBackend({
    kind: 'local',
    storage,
    promptIdsFor: (date) => dailyPromptIds(date),
    yearFor: yearOf,
  });
}

/** Practice: seven random prompts per round, nothing saved. Each "date" is a round id. */
export function createPracticeBackend(): Backend {
  const rounds = new Map<string, string[]>();
  return createLocalBackend({
    kind: 'practice',
    storage: memoryStorage(),
    yearFor: () => yearOf(ukDateString()),
    promptIdsFor: (round) => {
      let ids = rounds.get(round);
      if (!ids) {
        // Seven questions of seven different types.
        const seen = new Set<string>();
        const picked = shuffle(PROMPTS, seededRng(round))
          .filter((p) => !seen.has(p.family) && seen.add(p.family))
          .slice(0, PROMPTS_PER_DAY);
        ids = picked.sort((a, b) => a.difficulty - b.difficulty).map((p) => p.id);
        rounds.set(round, ids);
      }
      return ids;
    },
  });
}
