import { useCallback, useEffect, useRef, useState } from 'react';
import { getPrompt, isValidAnswer } from '../prompts.ts';
import { GRACE_MS, OfflineError, type Backend, type DayResults, type Distribution } from './backend/types.ts';
import { parseAnswer } from './parseAnswer.ts';
import { PROMPTS_PER_DAY } from './daily.ts';
import { TIERS, type TierId } from './scoring.ts';

export interface RevealData {
  position: number;
  value: number | null;
  tier: TierId;
  points: number;
  share: number | null;
  players: number;
  simulated: boolean;
  /** The whole crowd for this prompt: undefined while loading, null if it couldn't be fetched. */
  crowd?: Distribution | null;
}

export type Phase =
  | { name: 'loading' }
  | { name: 'error' }
  | { name: 'start'; position: number }
  | { name: 'prompt'; position: number; deadline: number; locked: number | null }
  | { name: 'reveal'; data: RevealData }
  | { name: 'results' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for the red tick to draw before the reveal. */
const TICK_MS = 650;

export function useGame(backend: Backend, date: string, onFinished?: (r: DayResults) => void) {
  const [phase, setPhaseState] = useState<Phase>({ name: 'loading' });
  const [results, setResults] = useState<DayResults | null>(null);
  const [offline, setOffline] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const phaseRef = useRef<Phase>(phase);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  // Bumped whenever the game is reloaded, so stale async work can tell it is stale.
  const generation = useRef(0);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const say = useCallback((text: string) => {
    // Toggle a trailing no-break space so identical messages are announced again.
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }, []);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    setPhase({ name: 'loading' });
    try {
      const r = await backend.getResults(date);
      if (gen !== generation.current) return;
      setResults(r);
      setOffline(false);
      const next = r.rows.find((row) => !row.started);
      if (next) setPhase({ name: 'start', position: next.position });
      else {
        finishedRef.current?.(r);
        setPhase({ name: 'results' });
      }
    } catch {
      if (gen === generation.current) setPhase({ name: 'error' });
    }
  }, [backend, date, setPhase]);

  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);

  const patchRow = useCallback((position: number, patch: Partial<DayResults['rows'][number]>) => {
    setResults((r) =>
      r && {
        ...r,
        rows: r.rows.map((row) => (row.position === position ? { ...row, ...patch } : row)),
      },
    );
  }, []);

  const reveal = useCallback(
    (data: RevealData) => {
      patchRow(data.position, {
        started: true,
        value: data.value,
        tier: data.tier,
        points: data.points,
        share: data.share,
      });
      setPhase({ name: 'reveal', data });
      // Fetch the crowd for the "where did you land" plot. Allowed now: the prompt is done.
      const gen = generation.current;
      const attach = (crowd: Distribution | null) => {
        const p = phaseRef.current;
        if (gen === generation.current && p.name === 'reveal' && p.data.position === data.position) {
          setPhase({ name: 'reveal', data: { ...p.data, crowd } });
        }
      };
      // A time-out is reported a moment before the server's clock agrees, so wait for it.
      const delay = data.tier === 'none' ? 600 : 0;
      setTimeout(() => {
        backend.getDistribution(date, data.position).then(attach, () => attach(null));
      }, delay);
      say(
        data.tier === 'none'
          ? 'Out of time. No points.'
          : `Accepted. ${TIERS[data.tier].name}, ${data.points} points`,
      );
    },
    [backend, date, patchRow, say, setPhase],
  );

  const timedOut = useCallback(
    (position: number) =>
      reveal({
        position,
        value: null,
        tier: 'none',
        points: 0,
        share: null,
        players: results?.players ?? 0,
        simulated: results?.simulated ?? true,
      }),
    [reveal, results],
  );

  const begin = useCallback(
    async (position: number) => {
      const gen = generation.current;
      try {
        const { remainingMs } = await backend.startPrompt(date, position);
        if (gen !== generation.current) return;
        setOffline(false);
        patchRow(position, { started: true });
        if (remainingMs <= 0) timedOut(position);
        else setPhase({ name: 'prompt', position, deadline: performance.now() + remainingMs, locked: null });
      } catch {
        if (gen === generation.current) setPhase({ name: 'error' });
      }
    },
    [backend, date, patchRow, setPhase, timedOut],
  );

  const start = useCallback(() => {
    const p = phaseRef.current;
    if (p.name === 'start') void begin(p.position);
  }, [begin]);

  /** Returns false if the answer was rejected (so the input should shake). */
  const submit = useCallback(
    async (raw: string): Promise<boolean> => {
      const p = phaseRef.current;
      if (p.name !== 'prompt' || p.locked !== null || !results) return true;
      const prompt = getPrompt(results.rows[p.position - 1]!.promptId);
      const value = parseAnswer(raw);
      if (value === null || !isValidAnswer(prompt, value)) {
        say('Not valid, try again');
        return false;
      }
      const gen = generation.current;
      const lockedAt = performance.now();
      setPhase({ ...p, locked: value });

      // Keep trying while there is any chance the server will still accept it.
      for (;;) {
        try {
          const res = await backend.submitAnswer(date, p.position, value);
          if (gen !== generation.current) return true;
          setOffline(false);
          if (res.ok) {
            await sleep(Math.max(0, TICK_MS - (performance.now() - lockedAt)));
            if (gen !== generation.current) return true;
            reveal({ position: p.position, value, ...res });
            return true;
          }
          if (res.reason === 'invalid') {
            // Client and server disagree: trust the server, let them try again.
            setPhase({ ...p, locked: null });
            say('Not valid, try again');
            return false;
          }
          if (res.reason === 'rate_limited' && performance.now() < p.deadline) {
            await sleep(1500);
            continue;
          }
          if (res.reason === 'already') {
            void load();
            return true;
          }
          timedOut(p.position);
          return true;
        } catch (e) {
          if (gen !== generation.current) return true;
          if (e instanceof OfflineError && performance.now() < p.deadline + GRACE_MS - 500) {
            setOffline(true);
            await sleep(1500);
            continue;
          }
          setOffline(e instanceof OfflineError);
          timedOut(p.position);
          return true;
        }
      }
    },
    [backend, date, load, results, reveal, say, setPhase, timedOut],
  );

  const expire = useCallback(() => {
    const p = phaseRef.current;
    if (p.name === 'prompt' && p.locked === null) timedOut(p.position);
  }, [timedOut]);

  const next = useCallback(async () => {
    const p = phaseRef.current;
    if (p.name !== 'reveal') return;
    if (p.data.position < PROMPTS_PER_DAY) {
      await begin(p.data.position + 1);
      return;
    }
    const gen = generation.current;
    setPhase({ name: 'loading' });
    try {
      const r = await backend.getResults(date);
      if (gen !== generation.current) return;
      setResults(r);
      finishedRef.current?.(r);
      setPhase({ name: 'results' });
    } catch {
      if (gen === generation.current) setPhase({ name: 'error' });
    }
  }, [backend, begin, date, setPhase]);

  return { phase, results, offline, announcement, start, submit, expire, next, reload: load };
}
