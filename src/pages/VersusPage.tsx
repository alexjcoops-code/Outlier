import { CONFETTI_COLOURS, GREEN_INK, TIER_HEX, formatAnswer } from '../lib/format.ts';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnswerInput } from '../components/AnswerInput.tsx';
import { InkStamp } from '../components/InkStamp.tsx';
import { Circled, Emphasis, RedDash, RedTick, Scribble } from '../components/Marks.tsx';
import { TimerLine } from '../components/TimerLine.tsx';
import { TIMER_MS } from '../lib/backend/types.ts';
import { burst, buzz } from '../lib/celebrate.ts';
import { parseAnswer } from '../lib/parseAnswer.ts';
import { linkHandler } from '../lib/router.ts';
import { TIERS } from '../lib/scoring.ts';
import { useVersus } from '../lib/useVersus.ts';
import { getPrompt } from '../prompts.ts';
import {
  CODE_LENGTH,
  VERSUS_REVEAL_MS,
  VERSUS_ROUNDS,
  VERSUS_SIZES,
  cleanName,
  matchTotals,
  normaliseCode,
  randomName,
  scoreRound,
  type RoundScore,
  type VersusBackend,
  type VersusState,
} from '../lib/versus.ts';

const NAME_KEY = 'outlier:name';
const SIZE_KEY = 'outlier:versus-size';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* fine */
  }
}

const versusLabel = (size: number) => `1 v ${size - 1}`;
const secondsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));

interface Props {
  backend: VersusBackend;
  navigate: (to: string) => void;
}

export function VersusPage({ backend, navigate }: Props) {
  const v = useVersus(backend);
  const { state } = v;

  if (!v.matchId) return <Lobby backend={backend} navigate={navigate} onEnter={v.enter} />;
  if (!state) {
    return v.problem ? (
      <div className="notice" role="alert">
        <span className="hand">Can't reach the game server.</span>
        <p>{v.problem}</p>
        <p style={{ marginTop: 16 }}>
          <button type="button" className="stamp stamp--small" onClick={v.exit}>
            Back
          </button>
        </p>
      </div>
    ) : (
      <Scribble label="Finding your seat" />
    );
  }

  const trouble = v.problem && (
    <p className="question__offline" role="alert">
      <span className="hand">Lost the signal.</span> Trying again…
    </p>
  );

  if (state.status === 'waiting') {
    return (
      <>
        <WaitingRoom state={state} now={v.now} onStart={() => void v.start().catch(() => {})} onLeave={v.exit} onGhosts={async () => {
          const name = state.players.find((p) => p.me)?.name ?? randomName();
          const size = state.size;
          v.exit();
          v.enter(await backend.playGhosts(name, size));
        }} />
        {trouble}
      </>
    );
  }
  if (state.status === 'abandoned') {
    return (
      <div className="notice">
        <span className="hand">Everyone went home.</span>
        <p>This match ended because the other players left.</p>
        <p style={{ marginTop: 16 }}>
          <button type="button" className="stamp stamp--small" onClick={v.exit}>
            Find another match
          </button>
        </p>
      </div>
    );
  }
  if (state.status === 'done') return <Final state={state} onAgain={v.exit} navigate={navigate} />;

  return (
    <>
      <Match state={state} now={v.now} mine={v.mine} onAnswer={v.answer} onLeave={v.exit} />
      {trouble}
    </>
  );
}

// ───────────────────────────── Lobby ─────────────────────────────

function Lobby({ backend, navigate, onEnter }: { backend: VersusBackend; navigate: (to: string) => void; onEnter: (id: string) => void }) {
  const invited = useMemo(() => normaliseCode(new URLSearchParams(window.location.search).get('code') ?? ''), []);
  const [name, setName] = useState(() => stored(NAME_KEY) ?? randomName());
  const [size, setSize] = useState<number>(() => {
    const s = Number(stored(SIZE_KEY));
    return (VERSUS_SIZES as readonly number[]).includes(s) ? s : 2;
  });
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = backend.kind === 'online';

  const go = async (what: string, action: (n: string) => Promise<string>) => {
    const clean = cleanName(name) || randomName();
    setName(clean);
    store(NAME_KEY, clean);
    store(SIZE_KEY, String(size));
    setBusy(what);
    setError(null);
    try {
      const id = await action(clean);
      if (invited) window.history.replaceState(null, '', '/versus');
      onEnter(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  };

  const ghostsLabel = `Play ${size - 1} ${size === 2 ? 'ghost' : 'ghosts'}`;

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = normaliseCode(code);
    if (c.length !== CODE_LENGTH) {
      setError(`Room codes have ${CODE_LENGTH} letters and numbers.`);
      return;
    }
    void go('join', (n) => backend.joinRoom(n, c));
  };

  return (
    <section className="versus" aria-labelledby="versus-title">
      <h1 id="versus-title">
        Versus <span className="start__dash" aria-hidden="true" /> <span className="start__count">you against the room</span>
      </h1>
      <p className="pencil start__lede">
        {VERSUS_ROUNDS} questions, 40 seconds each, everyone at once. Rare right answers score more, and if someone else in the
        room says the same number, you <em>split the points</em>.
      </p>

      {invited && online && (
        <p className="versus__invite">
          <span className="hand">You've been invited!</span> Room <span className="mono">{invited}</span> is waiting for you.
        </p>
      )}

      <ol className="worksheet">
        <li className="worksheet__item">
          <span className="margin-note" aria-hidden="true">
            1.
          </span>
          <label className="versus__field">
            <span className="worksheet__q">Name on your paper</span>
            <input
              className="versus__name"
              value={name}
              maxLength={20}
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName((n) => cleanName(n) || randomName())}
            />
          </label>
        </li>

        {!invited && (
          <li className="worksheet__item">
            <span className="margin-note" aria-hidden="true">
              2.
            </span>
            <fieldset className="versus__sizes">
              <legend className="worksheet__q">How many players?</legend>
              {VERSUS_SIZES.map((s) => (
                <label key={s} className="tickbox">
                  <input type="radio" name="size" value={s} checked={s === size} onChange={() => setSize(s)} />
                  <span className="tickbox__box" aria-hidden="true">
                    {s === size && <RedTick size={30} />}
                  </span>
                  {versusLabel(s)}
                </label>
              ))}
            </fieldset>
          </li>
        )}

        <li className="worksheet__item">
          <span className="margin-note" aria-hidden="true">
            {invited ? 2 : 3}.
          </span>
          {online && invited ? (
            <form className="versus__join versus__join--main" onSubmit={join}>
              <input
                className="versus__code mono"
                value={code}
                aria-label="Room code"
                autoCapitalize="characters"
                maxLength={CODE_LENGTH + 2}
                onChange={(e) => setCode(normaliseCode(e.target.value))}
              />
              <button type="submit" className="stamp" disabled={busy !== null}>
                {busy === 'join' ? 'Joining…' : 'Join room'}
              </button>
            </form>
          ) : online ? (
            <>
              <div className="versus__actions versus__actions--first">
                <button type="button" className="stamp" disabled={busy !== null} onClick={() => void go('quick', (n) => backend.quickMatch(n, size))}>
                  {busy === 'quick' ? 'Finding…' : 'Find players'}
                </button>
                <span className="pencil versus__hint">Strangers, live. Starts when the table's full.</span>
              </div>
              <ul className="versus__more">
                <li>
                  <button type="button" className="linklike" disabled={busy !== null} onClick={() => void go('room', (n) => backend.createRoom(n, size))}>
                    {busy === 'room' ? 'Making a room…' : 'Make a room for friends'}
                  </button>{' '}
                  <span className="pencil">and send them the link</span>
                </li>
                <li>
                  <form className="versus__join" onSubmit={join}>
                    <span className="pencil">Got a code?</span>
                    <input
                      className="versus__code mono"
                      value={code}
                      aria-label="Room code"
                      autoCapitalize="characters"
                      maxLength={CODE_LENGTH + 2}
                      onChange={(e) => setCode(normaliseCode(e.target.value))}
                    />
                    <button type="submit" className="linklike" disabled={busy !== null}>
                      {busy === 'join' ? 'Joining…' : 'Join room'}
                    </button>
                  </form>
                </li>
                <li>
                  <button type="button" className="linklike" disabled={busy !== null} onClick={() => void go('ghosts', (n) => backend.playGhosts(n, size))}>
                    {ghostsLabel}
                  </button>{' '}
                  <span className="pencil">if nobody's about</span>
                </li>
              </ul>
            </>
          ) : (
            <div className="versus__actions versus__actions--first">
              <button type="button" className="stamp" disabled={busy !== null} onClick={() => void go('ghosts', (n) => backend.playGhosts(n, size))}>
                {ghostsLabel}
              </button>
            </div>
          )}
        </li>
      </ol>

      {error && (
        <p className="versus__error" role="alert">
          <span className="hand">Hmm.</span> {error}
        </p>
      )}
      {!online && (
        <p className="pencil versus__note">
          This copy of the game has no server, so you can only play ghosts. They're simulated players, and they're always
          labelled.
        </p>
      )}
      <p className="versus__back">
        <a href="/" onClick={linkHandler(navigate, '/')}>
          Back to today's worksheet
        </a>
      </p>
    </section>
  );
}

// ───────────────────────────── Waiting room ─────────────────────────────

function WaitingRoom({
  state,
  now,
  onStart,
  onLeave,
  onGhosts,
}: {
  state: VersusState;
  now: number;
  onStart: () => void;
  onLeave: () => void;
  onGhosts: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = state.code ? `${window.location.origin}/versus?code=${state.code}` : '';
  const host = state.mySeat === state.hostSeat;
  const here = state.players.length;
  const alone = state.kind === 'quick' && state.startBy !== null && now > state.startBy && here < 2;

  const share = async () => {
    const text = `Play me at Oddle: room ${state.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Oddle versus', text, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* dismissed */
    }
  };

  return (
    <section className="versus" aria-labelledby="waiting-title">
      <h1 id="waiting-title">
        {state.kind === 'private' ? 'Your room' : 'Finding players'} <span className="start__dash" aria-hidden="true" />{' '}
        <span className="start__count">{versusLabel(state.size)}</span>
      </h1>

      {state.code && (
        <div className="versus__room">
          <p className="pencil mono">Room code</p>
          <p className="versus__bigcode mono" aria-label={`Room code ${state.code.split('').join(' ')}`}>
            {state.code}
          </p>
          <button type="button" className="stamp stamp--small stamp--ghost" onClick={() => void share()}>
            {copied ? 'Link copied' : 'Send the link'}
          </button>
        </div>
      )}

      <Register state={state} mode="waiting" now={now} />

      <p className="pencil versus__status" aria-live="polite">
        {state.kind === 'private'
          ? here < 2
            ? 'Waiting for someone to join…'
            : here < state.size
              ? host
                ? `${here} here. Start now, or wait for a full room.`
                : `${here} here. Waiting for the host to start.`
              : 'Full! Starting…'
          : alone
            ? 'Nobody else is about right now.'
            : state.startBy !== null && here >= 2
              ? `Starting in ${secondsLeft(state.startBy, now)}s with whoever's here…`
              : `Looking for players… ${state.startBy !== null ? `${secondsLeft(state.startBy, now)}s` : ''}`}
      </p>

      <div className="versus__actions">
        {state.kind === 'private' && host && (
          <button type="button" className="stamp" disabled={here < 2} onClick={onStart}>
            Start now
          </button>
        )}
        {alone && (
          <button type="button" className="stamp" onClick={onGhosts}>
            Play ghosts instead
          </button>
        )}
        <button type="button" className="linklike" onClick={onLeave}>
          Leave
        </button>
      </div>
    </section>
  );
}

// ───────────────────────────── The register ─────────────────────────────

/**
 * The class register: one row per player, one column per question. While
 * waiting it shows empty seats; during a round, a tick for who has handed in;
 * once a round closes, everyone's points.
 */
function Register({ state, mode, now }: { state: VersusState; mode: 'waiting' | 'live' | 'final'; now: number }) {
  const totals = useMemo(() => matchTotals(state), [state]);
  const scores = useMemo(() => {
    const out = new Map<number, Map<number, RoundScore>>();
    for (const r of state.rounds) {
      if (!r.answers) continue;
      out.set(r.round, new Map(scoreRound(r.promptId, r.answers, state.year).map((s) => [s.seat, s])));
    }
    return out;
  }, [state]);

  const seats =
    mode === 'final'
      ? totals.map((t) => t.seat)
      : Array.from({ length: state.size }, (_, i) => i + 1).filter((s) => mode === 'waiting' || state.players.some((p) => p.seat === s));
  const current = state.rounds[state.round - 1];
  const live = mode === 'live' && current && !current.answers && state.roundStartsAt !== null && now >= state.roundStartsAt;

  return (
    <table className={`register register--${mode}`}>
      <thead>
        <tr>
          {mode === 'final' && <th className="register__place" scope="col"><span className="sr-only">Place</span></th>}
          <th scope="col" className="register__name">Name</th>
          {mode !== 'waiting' &&
            Array.from({ length: VERSUS_ROUNDS }, (_, i) => (
              <th key={i} scope="col" className="register__q mono">
                Q{i + 1}
              </th>
            ))}
          {mode !== 'waiting' && <th scope="col" className="register__total mono">Total</th>}
        </tr>
      </thead>
      <tbody>
        {seats.map((seat) => {
          const p = state.players.find((x) => x.seat === seat);
          const t = totals.find((x) => x.seat === seat);
          return (
            <tr key={seat} className={`${p?.me ? 'register__me' : ''} ${p?.left ? 'register__left' : ''}`}>
              {mode === 'final' && <td className="register__place mono">{t ? ordinal(t.place) : ''}</td>}
              <th scope="row" className="register__name">
                {p ? (
                  <>
                    {p.name}
                    {p.me && <span className="pencil"> (you)</span>}
                    {p.ghost && <span className="register__ghost">ghost</span>}
                    {p.left && <span className="pencil"> left</span>}
                  </>
                ) : (
                  <span className="register__empty pencil">empty seat</span>
                )}
              </th>
              {mode !== 'waiting' &&
                Array.from({ length: VERSUS_ROUNDS }, (_, i) => {
                  const round = i + 1;
                  const s = scores.get(round)?.get(seat);
                  if (s) {
                    return (
                      <td key={i} className="register__q mono" style={{ background: `color-mix(in srgb, var(--tier-${s.tier}) 45%, transparent)` }}>
                        {s.points}
                      </td>
                    );
                  }
                  const ticking = live && round === state.round && current!.answered.includes(seat);
                  return (
                    <td key={i} className="register__q">
                      {ticking ? <RedTick size={18} /> : ''}
                    </td>
                  );
                })}
              {mode !== 'waiting' && <td className="register__total mono">{t?.total ?? 0}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

// ───────────────────────────── A round ─────────────────────────────

function Match({
  state,
  now,
  mine,
  onAnswer,
  onLeave,
}: {
  state: VersusState;
  now: number;
  mine: Record<number, number>;
  onAnswer: (round: number, value: number) => Promise<string>;
  onLeave: () => void;
}) {
  const round = state.round;
  const r = state.rounds[round - 1]!;
  const prompt = getPrompt(r.promptId);
  const startsAt = state.roundStartsAt!;
  const [note, setNote] = useState<string | null>(null);

  // performance.now() deadline for the pencil timer, fixed once per round.
  const deadline = useMemo(
    () => performance.now() + (startsAt + TIMER_MS - now),
    [round, startsAt],
  );

  useEffect(() => setNote(null), [round]);

  const confirm = (
    <p className="versus__leave">
      <button
        type="button"
        className="linklike pencil"
        onClick={() => {
          if (window.confirm("Leave the match? You'll score nothing for the rest.")) onLeave();
        }}
      >
        Leave match
      </button>
    </p>
  );

  // Countdown before the question.
  if (now < startsAt) {
    const prev = round > 1 ? state.rounds[round - 2] : undefined;
    return (
      <section className="versus" aria-live="polite">
        <div className="versus__countdown">
          <p className="pencil mono">
            Question {round} of {VERSUS_ROUNDS}
          </p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={secondsLeft(startsAt, now)}
              className="versus__count"
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {secondsLeft(startsAt, now)}
            </motion.p>
          </AnimatePresence>
        </div>
        <Register state={state} mode="live" now={now} />
        {!prev && <p className="pencil versus__status">Everyone gets the question at the same moment.</p>}
      </section>
    );
  }

  const closed = state.closedAt !== null;
  const iAnswered = r.answered.includes(state.mySeat);
  const myValue = mine[round] ?? null;
  const outOfTime = !iAnswered && now > startsAt + TIMER_MS;

  return (
    <section className="question versus" aria-labelledby="prompt-text">
      <div className="question__body">
        <span className="margin-note" aria-hidden="true">
          Q{round}.
        </span>
        <h2 id="prompt-text" className="question__prompt">
          <span className="sr-only">
            Question {round} of {VERSUS_ROUNDS}:{' '}
          </span>
          {prompt.text}
        </h2>

        {!closed ? (
          <>
            <TimerLine deadline={deadline} stopped={iAnswered} onExpire={() => {}} />
            {outOfTime ? (
              <p className="versus__waitnote">
                <RedDash /> <span className="hand">Out of time.</span>
              </p>
            ) : iAnswered && myValue === null ? (
              <p className="versus__waitnote pencil">Handed in.</p>
            ) : (
              <AnswerInput
                key={round}
                locked={myValue}
                onSubmit={async (raw) => {
                  const n = parseAnswer(raw);
                  if (n === null) return false;
                  const outcome = await onAnswer(round, n).catch(() => 'offline');
                  if (outcome === 'ok' || outcome === 'already') return true;
                  if (outcome === 'invalid') return false;
                  setNote(outcome === 'late' ? 'Too late for that one.' : outcome === 'rate_limited' ? 'Slow down a little.' : "Couldn't hand that in. Try again.");
                  return outcome !== 'offline';
                }}
              />
            )}
            {note && <p className="versus__waitnote pencil">{note}</p>}
            {iAnswered && <p className="pencil versus__status">Waiting for the others…</p>}
            <Register state={state} mode="live" now={now} />
          </>
        ) : (
          <RoundReveal state={state} now={now} />
        )}
      </div>
      {confirm}
    </section>
  );
}

// ───────────────────────────── Everyone's answers ─────────────────────────────

function RoundReveal({ state, now }: { state: VersusState; now: number }) {
  const reduce = useReducedMotion();
  const r = state.rounds[state.round - 1]!;
  const scores = useMemo(() => scoreRound(r.promptId, r.answers!, state.year), [r, state.year]);
  const nameOf = (seat: number) => state.players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;
  const ghost = (seat: number) => state.players.find((p) => p.seat === seat)?.ghost ?? false;
  const order = [...scores].sort((a, b) => b.points - a.points || a.seat - b.seat);
  const me = scores.find((s) => s.seat === state.mySeat);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || reduce || !me) return;
    fired.current = true;
    // A little confetti for a rare answer nobody in the room copied.
    if (me.points >= 60) {
      // Lone Wolf: coloured confetti. Outlier: red-pen emphasis round the score (below), no confetti.
      if (me.tier === 'lone') burst({ x: window.innerWidth / 2, y: window.innerHeight * 0.35, chads: 60, stars: 8, colour: TIER_HEX.lone!, palette: CONFETTI_COLOURS, shower: 60 });
      else if (me.tier !== 'outlier') burst({ x: window.innerWidth / 2, y: window.innerHeight * 0.35, chads: 18, stars: 0, colour: TIER_HEX[me.tier]! });
      buzz([18]);
    }
  }, [me, reduce]);

  const nextAt = state.closedAt! + VERSUS_REVEAL_MS;
  const last = state.round >= VERSUS_ROUNDS;

  return (
    <div className="versus__reveal">
      <ol className="answers">
        {order.map((s, i) => (
          <motion.li
            key={s.seat}
            className={`answers__row ${s.seat === state.mySeat ? 'answers__row--me' : ''}`}
            initial={reduce ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduce ? 0 : 0.15 * i }}
          >
            <span className="answers__name">
              {nameOf(s.seat)}
              {ghost(s.seat) && <span className="register__ghost">ghost</span>}
            </span>
            <span className={`answers__value mono ${s.value === null ? 'answers__value--none' : ''}`}>{s.value === null ? 'no answer' : formatAnswer(s.value)}</span>
            {s.tier === 'none' ? (
              <span />
            ) : (
              <span className="answers__tier" style={{ background: `var(--tier-${s.tier})` }}>
                {TIERS[s.tier].name}
              </span>
            )}
            <span className="answers__points mono">
              {s.sharedWith.length > 0 ? (
                <>
                  <span className="pencil">
                    {s.base} ÷ {s.sharedWith.length + 1} =
                  </span>{' '}
                  {s.points}
                </>
              ) : s.seat === state.mySeat && s.points > 0 ? (
                <span className="answers__mine">
                  <Circled delay={0.5}>{s.points}</Circled>
                  {s.tier === 'outlier' && <Emphasis delay={reduce ? 0 : 0.8} className="answers__emphasis" />}
                </span>
              ) : (
                s.points
              )}
            </span>
            {s.sharedWith.length > 0 && (
              <span className="answers__shared hand">same as {s.sharedWith.map(nameOf).join(', ')}</span>
            )}
          </motion.li>
        ))}
      </ol>
      <p className="pencil versus__status">
        {last ? 'Marking the papers…' : `Question ${state.round + 1} in ${secondsLeft(nextAt, now)}s`}
      </p>
    </div>
  );
}

// ───────────────────────────── Final ─────────────────────────────

function Final({ state, onAgain, navigate }: { state: VersusState; onAgain: () => void; navigate: (to: string) => void }) {
  const reduce = useReducedMotion();
  const totals = matchTotals(state);
  const mine = totals.find((t) => t.seat === state.mySeat);
  const won = mine?.place === 1;
  const shared = won && totals.filter((t) => t.place === 1).length > 1;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!won || reduce) return;
    const box = ref.current?.getBoundingClientRect();
    const t = setTimeout(() => {
      burst({ x: box ? box.left + box.width / 2 : window.innerWidth / 2, y: box ? box.top + 40 : 200, chads: 120, stars: 16, colour: '#ffe97a' });
      buzz([30, 50, 30]);
    }, 500);
    return () => clearTimeout(t);
  }, [won, reduce]);

  return (
    <section className="versus" aria-labelledby="final-title">
      <div className="versus__final" ref={ref}>
        <h1 id="final-title">
          {won ? (shared ? 'Joint top of the class' : 'Top of the class') : `You came ${ordinal(mine?.place ?? totals.length)}`}
        </h1>
        {won && <InkStamp text={shared ? 'Joint first' : 'Winner'} ink={GREEN_INK} delay={0.3} className="versus__stamp" />}
        <p className="pencil start__lede">
          {versusLabel(state.size)}
          {state.kind === 'ghosts' ? ' against ghosts' : ''} · {VERSUS_ROUNDS} questions
        </p>
      </div>
      <Register state={state} mode="final" now={state.serverNow} />
      <div className="versus__actions">
        <button type="button" className="stamp" onClick={onAgain}>
          Play again
        </button>
        <a href="/" onClick={linkHandler(navigate, '/')}>
          Today's worksheet
        </a>
      </div>
    </section>
  );
}
