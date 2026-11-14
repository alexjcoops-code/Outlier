import { useState, type FormEvent } from 'react';
import { Scribble } from '../components/Marks.tsx';
import type { AdminPromptStats, AdminStats, Backend } from '../lib/backend/types.ts';
import { jensenShannon } from '../lib/divergence.ts';
import { addDays } from '../lib/ukDate.ts';
import { getPrompt } from '../prompts.ts';

const SECRET_KEY = 'outlier:admin-secret';

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** Real answers drawn over the ghost answers, one row per value. Shares, so the sizes compare. */
function Overlay({ p }: { p: AdminPromptStats }) {
  const ghostTotal = p.values.reduce((s, v) => s + v.rules + v.ai, 0);
  const rows = p.values
    .map((v) => ({
      value: v.value,
      real: p.realTotal ? v.real / p.realTotal : 0,
      ghost: ghostTotal ? (v.rules + v.ai) / ghostTotal : 0,
    }))
    .sort((a, b) => Math.max(b.real, b.ghost) - Math.max(a.real, a.ghost) || a.value - b.value)
    .slice(0, 14)
    .sort((a, b) => a.value - b.value);
  const max = Math.max(0.01, ...rows.map((r) => Math.max(r.real, r.ghost)));
  return (
    <table className="overlay">
      <thead>
        <tr>
          <th scope="col">Answer</th>
          <th scope="col">
            <span className="overlay__key overlay__key--ghost" /> ghosts <span className="overlay__key overlay__key--real" /> real
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.value}>
            <th scope="row" className="mono">
              {r.value.toLocaleString('en-GB')}
            </th>
            <td>
              <span className="overlay__bars">
                <span className="overlay__ghost" style={{ width: `${(r.ghost / max) * 100}%` }} />
                <span className="overlay__real" style={{ width: `${(r.real / max) * 100}%` }} />
              </span>
              <span className="overlay__nums mono">
                {pct(r.ghost)} · {p.realTotal ? pct(r.real) : 'n/a'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PromptStats({ p }: { p: AdminPromptStats }) {
  const real = new Map(p.values.filter((v) => v.real).map((v) => [v.value, v.real]));
  const ghosts = new Map(p.values.filter((v) => v.rules + v.ai).map((v) => [v.value, v.rules + v.ai]));
  const rules = new Map(p.values.filter((v) => v.rules).map((v) => [v.value, v.rules]));
  const ai = new Map(p.values.filter((v) => v.ai).map((v) => [v.value, v.ai]));
  const aiCount = p.values.reduce((s, v) => s + v.ai, 0);
  const js = (m: Map<number, number>) => (p.realTotal && m.size ? jensenShannon(real, m).toFixed(2) : 'n/a');
  const realTimeoutRate = p.realTotal + p.realTimeouts ? p.realTimeouts / (p.realTotal + p.realTimeouts) : null;

  return (
    <div className="admin__prompt">
      <h2>
        <span className="mono pencil">Q{p.position}.</span> {getPrompt(p.promptId).text}
      </h2>
      <dl className="admin__scores">
        <div>
          <dt>JS divergence</dt>
          <dd>{js(ghosts)}</dd>
        </div>
        <div>
          <dt>rules only</dt>
          <dd>{js(rules)}</dd>
        </div>
        <div>
          <dt>AI only</dt>
          <dd>{aiCount ? js(ai) : 'n/a'}</dd>
        </div>
        <div>
          <dt>time-outs</dt>
          <dd>
            {realTimeoutRate === null ? 'n/a' : pct(realTimeoutRate)} real · {p.ghostCount ? pct(p.ghostTimeouts / p.ghostCount) : 'n/a'} ghost
          </dd>
        </div>
      </dl>
      <p className="pencil mono admin__meta">
        {p.realTotal} real answers · {p.ghostCount} ghosts ({aiCount} answered by AI)
      </p>
      <Overlay p={p} />
    </div>
  );
}

/** Ghost tuning: how the simulated answers compare with what real players said. */
export function AdminPage({ backend, today }: { backend: Backend; today: string }) {
  const [secret, setSecret] = useState(() => sessionStorage.getItem(SECRET_KEY) ?? '');
  const [date, setDate] = useState(today);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'denied'>('idle');

  const load = async (e?: FormEvent, forDate = date) => {
    e?.preventDefault();
    setState('loading');
    try {
      const s = await backend.getAdminStats(forDate, secret);
      sessionStorage.setItem(SECRET_KEY, secret);
      setStats(s);
      setState('idle');
    } catch {
      setStats(null);
      setState('denied');
    }
  };

  const step = (days: number) => {
    const next = addDays(date, days);
    setDate(next);
    void load(undefined, next);
  };

  return (
    <section className="admin" aria-labelledby="admin-title">
      <h1 id="admin-title">Staffroom</h1>
      <p className="pencil">
        Ghost answers against real ones, per question. JS divergence runs from 0 (identical) to 1 (nothing in common).
        Tune <span className="mono">src/lib/ghostConfig.ts</span>; <span className="mono">npm run ghosts:suggest</span> proposes new
        percentages from the last 14 days.
      </p>
      <form className="admin__form" onSubmit={load}>
        <label>
          Secret
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="submit" className="stamp stamp--small">
          Open
        </button>
      </form>
      {backend.kind !== 'supabase' && (
        <p className="pencil">No Supabase project is configured, so this shows the offline demo data and ignores the secret.</p>
      )}
      {state === 'loading' && <Scribble label="Fetching the register" />}
      {state === 'denied' && (
        <p className="hand" role="alert">
          Staff only. Wrong secret, or the staffroom is shut.
        </p>
      )}
      {stats && state === 'idle' && (
        <>
          <p className="admin__nav mono">
            <button type="button" className="linklike" onClick={() => step(-1)}>
              ← day before
            </button>
            <span>
              {stats.date} · {stats.players} real {stats.players === 1 ? 'player' : 'players'}
            </span>
            <button type="button" className="linklike" onClick={() => step(1)}>
              day after →
            </button>
          </p>
          {stats.prompts.map((p) => (
            <PromptStats key={p.position} p={p} />
          ))}
        </>
      )}
    </section>
  );
}
