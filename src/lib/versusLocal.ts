// Versus against ghosts, played entirely in the browser.
//
// Used when nobody else is around ("play the ghosts"), when the app runs
// without a server, and by the end-to-end tests. The ghosts are the same
// rule-based players as in the daily crowd, each with an ability and a style,
// and they answer at human-ish speeds. They are always labelled as ghosts.

import { getPrompt, isValidAnswer } from '../prompts.ts';
import { TIMER_MS } from './backend/types.ts';
import { ABILITIES, GHOST_CONFIG, STYLES, type Ability, type Style } from './ghostConfig.ts';
import { playGhost } from './ghostModel.ts';
import { seededRng, type Rng } from './rng.ts';
import { ukDateString } from './ukDate.ts';
import {
  VERSUS_COUNTDOWN_MS,
  VERSUS_REVEAL_MS,
  VERSUS_ROUNDS,
  cleanName,
  pickVersusPrompts,
  type AnswerOutcome,
  type VersusBackend,
  type VersusState,
} from './versus.ts';

const GHOST_NAMES = ['Ada', 'Euler', 'Noether', 'Gauss', 'Ramanujan', 'Hypatia', 'Turing', 'Hilbert', 'Fermat', 'Pascal', 'Fibonacci', 'Germain'];

interface Plan {
  value: number | null;
  /** Milliseconds after the round starts that the answer goes in. */
  at: number;
}

interface LocalMatch {
  id: string;
  size: number;
  year: number;
  promptIds: string[];
  status: 'playing' | 'done' | 'abandoned';
  round: number;
  roundStartsAt: number;
  closedAt: number | null;
  players: { seat: number; name: string; ghost: boolean }[];
  /** plans[round][seat] for every ghost. */
  plans: Map<number, Map<number, Plan>>;
  /** The real player's answers by round. */
  mine: Map<number, Plan>;
}

function pick<T extends string>(items: readonly T[], share: (x: T) => number, rng: Rng): T {
  const total = items.reduce((s, x) => s + share(x), 0);
  let r = rng() * total;
  for (const x of items) {
    r -= share(x);
    if (r <= 0) return x;
  }
  return items[items.length - 1]!;
}

export interface LocalVersusOptions {
  now?: () => number;
  /** Seed for the ghosts and the questions; random by default. */
  seed?: () => string;
}

export function createLocalVersus(opts: LocalVersusOptions = {}): VersusBackend {
  const now = opts.now ?? (() => Date.now());
  const seed = opts.seed ?? (() => `${Date.now()}-${Math.random()}`);
  const matches = new Map<string, LocalMatch>();

  function create(name: string, size: number): string {
    const s = seed();
    const rng = seededRng(`ghosts:${s}`);
    const id = `ghost-${s}`;
    const year = Number(ukDateString().slice(0, 4));
    const promptIds = pickVersusPrompts(s);
    const names = [...GHOST_NAMES].sort(() => rng() - 0.5);
    const players = [{ seat: 1, name: cleanName(name) || 'You', ghost: false }];
    for (let seat = 2; seat <= size; seat++) players.push({ seat, name: names[seat - 2]!, ghost: true });

    // Each ghost keeps one ability and style for the whole match.
    const cast = new Map<number, { ability: Ability; style: Style }>();
    for (const p of players.filter((x) => x.ghost)) {
      cast.set(p.seat, {
        ability: pick(ABILITIES, (a) => GHOST_CONFIG.abilities[a].share, rng),
        style: pick(STYLES, (st) => GHOST_CONFIG.styles[st].share, rng),
      });
    }
    const plans = new Map<number, Map<number, Plan>>();
    promptIds.forEach((pid, i) => {
      const prompt = getPrompt(pid);
      const round = new Map<number, Plan>();
      for (const [seat, c] of cast) {
        const g = playGhost(prompt, c.ability, c.style, rng, { year });
        // Thinking time, plus a few seconds for every wrong number tried first.
        const at = 3_000 + rng() * 13_000 + g.invalidTries * (1_500 + rng() * 2_000);
        round.set(seat, at > TIMER_MS - 500 || g.value === null ? { value: null, at: Infinity } : { value: g.value, at });
      }
      plans.set(i + 1, round);
    });

    matches.set(id, {
      id,
      size,
      year,
      promptIds,
      status: 'playing',
      round: 1,
      roundStartsAt: now() + VERSUS_COUNTDOWN_MS,
      closedAt: null,
      players,
      plans,
      mine: new Map(),
    });
    return id;
  }

  /** Move the match along to where it should be at time t. */
  function tick(m: LocalMatch, t: number): void {
    for (let guard = 0; guard < 3 * VERSUS_ROUNDS && m.status === 'playing'; guard++) {
      if (m.closedAt === null) {
        const elapsed = t - m.roundStartsAt;
        const ghostsDone = [...m.plans.get(m.round)!.values()].every((p) => p.at <= elapsed);
        const allIn = m.mine.has(m.round) && ghostsDone;
        if (elapsed >= TIMER_MS || (elapsed >= 0 && allIn)) {
          // Closed when the last answer went in, or when time ran out.
          const last = Math.max(...[...m.plans.get(m.round)!.values()].map((p) => (p.at === Infinity ? TIMER_MS : p.at)), m.mine.get(m.round)?.at ?? TIMER_MS);
          m.closedAt = m.roundStartsAt + Math.min(TIMER_MS, last);
          continue;
        }
        return;
      }
      // Hand out the next question three seconds before it starts, so the countdown shows.
      if (t < m.closedAt + VERSUS_REVEAL_MS - 3_000) return;
      if (m.round >= VERSUS_ROUNDS) {
        if (t >= m.closedAt + VERSUS_REVEAL_MS) m.status = 'done';
        return;
      }
      m.round += 1;
      m.roundStartsAt = m.closedAt + VERSUS_REVEAL_MS;
      m.closedAt = null;
    }
  }

  function get(id: string): LocalMatch {
    const m = matches.get(id);
    if (!m) throw new Error('That match has gone.');
    return m;
  }

  return {
    kind: 'local',
    quickMatch: async () => {
      throw new Error('Online matches need the game server.');
    },
    createRoom: async () => {
      throw new Error('Online matches need the game server.');
    },
    joinRoom: async () => {
      throw new Error('Online matches need the game server.');
    },
    playGhosts: async (name, size) => create(name, size),
    start: async () => {},
    leave: async (id) => {
      const m = matches.get(id);
      if (m && m.status === 'playing') m.status = 'abandoned';
    },
    state: async (id): Promise<VersusState> => {
      const m = get(id);
      const t = now();
      tick(m, t);
      const rounds = m.promptIds.slice(0, m.round).map((promptId, i) => {
        const round = i + 1;
        const closed = round < m.round || m.closedAt !== null;
        const plans = m.plans.get(round)!;
        const elapsed = round === m.round ? t - m.roundStartsAt : Infinity;
        const answered = [...(m.mine.has(round) ? [1] : []), ...[...plans].filter(([, p]) => p.at <= elapsed).map(([s]) => s)];
        return {
          round,
          promptId,
          answered,
          answers: closed
            ? [{ seat: 1, value: m.mine.get(round)?.value ?? null }, ...[...plans].map(([seat, p]) => ({ seat, value: p.value }))]
            : null,
        };
      });
      return {
        id: m.id,
        code: null,
        kind: 'ghosts',
        size: m.size,
        status: m.status,
        hostSeat: 1,
        mySeat: 1,
        year: m.year,
        players: m.players.map((p) => ({ ...p, me: p.seat === 1, left: false })),
        round: m.round,
        roundStartsAt: m.roundStartsAt,
        closedAt: m.closedAt,
        startBy: null,
        serverNow: t,
        rounds,
      };
    },
    answer: async (id, round, value): Promise<AnswerOutcome> => {
      const m = get(id);
      const t = now();
      tick(m, t);
      if (m.status !== 'playing' || round !== m.round) return 'late';
      if (t < m.roundStartsAt) return 'not_started';
      if (m.closedAt !== null || t > m.roundStartsAt + TIMER_MS) return 'late';
      if (m.mine.has(round)) return 'already';
      if (!isValidAnswer(getPrompt(m.promptIds[round - 1]!), value)) return 'invalid';
      m.mine.set(round, { value, at: t - m.roundStartsAt });
      return 'ok';
    },
  };
}
