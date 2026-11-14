import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerOutcome, VersusBackend, VersusState } from './versus.ts';

const CURRENT = 'outlier:versus-match';

function remembered(): string | null {
  try {
    return sessionStorage.getItem(CURRENT);
  } catch {
    return null;
  }
}
function remember(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CURRENT, id);
    else sessionStorage.removeItem(CURRENT);
  } catch {
    /* fine: a refresh just loses the match */
  }
}

/**
 * Follows one match: polls its state, keeps a clock in step with the server's,
 * and remembers the match for this tab so a refresh drops you back in.
 */
export function useVersus(backend: VersusBackend) {
  const [matchId, setMatchId] = useState<string | null>(() => {
    const id = remembered();
    // Ghost matches live in memory, so they can't survive a refresh.
    return id && !(backend.kind === 'local' || id.startsWith('ghost-')) ? id : null;
  });
  const [state, setState] = useState<VersusState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Server clock minus ours. */
  const offset = useRef(0);
  const pollNow = useRef<() => void>(() => {});
  /** My answers by round, so the input shows what I handed in. */
  const [mine, setMine] = useState<Record<number, number>>({});

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!matchId) return;
    let stopped = false;
    let timer = 0;
    let failures = 0;
    const fast = matchId.startsWith('ghost-');
    const poll = async () => {
      clearTimeout(timer);
      const sent = Date.now();
      try {
        const s = await backend.state(matchId);
        if (stopped) return;
        offset.current = s.serverNow - (sent + Date.now()) / 2;
        setNow(Date.now() + offset.current);
        setState(s);
        setProblem(null);
        failures = 0;
        if (s.status === 'done' || s.status === 'abandoned') {
          remember(null);
          return;
        }
      } catch (e) {
        if (stopped) return;
        failures++;
        const message = e instanceof Error ? e.message : String(e);
        if (/not in that match|has gone/i.test(message)) {
          remember(null);
          setMatchId(null);
          setState(null);
          return;
        }
        setProblem(failures > 2 ? message : null);
      }
      timer = window.setTimeout(() => void poll(), fast ? 250 : Math.min(800 * 2 ** Math.max(0, failures - 2), 8000));
    };
    pollNow.current = () => void poll();
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [backend, matchId]);

  const enter = useCallback((id: string) => {
    remember(id);
    setMine({});
    setState(null);
    setMatchId(id);
  }, []);

  const exit = useCallback(() => {
    if (matchId && state && (state.status === 'waiting' || state.status === 'playing')) {
      void backend.leave(matchId).catch(() => {});
    }
    remember(null);
    setMatchId(null);
    setState(null);
    setMine({});
  }, [backend, matchId, state]);

  const answer = useCallback(
    async (round: number, value: number): Promise<AnswerOutcome> => {
      if (!matchId) return 'late';
      const outcome = await backend.answer(matchId, round, value);
      if (outcome === 'ok') setMine((m) => ({ ...m, [round]: value }));
      pollNow.current();
      return outcome;
    },
    [backend, matchId],
  );

  const start = useCallback(async () => {
    if (!matchId) return;
    await backend.start(matchId);
    pollNow.current();
  }, [backend, matchId]);

  return { matchId, state, problem, now, mine, enter, exit, answer, start };
}
