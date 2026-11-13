import { useState, type FormEvent } from 'react';
import { Scribble } from '../components/Marks.tsx';
import type { AdminStats, Backend } from '../lib/backend/types.ts';
import { addDays } from '../lib/ukDate.ts';
import { getPrompt } from '../prompts.ts';

const SECRET_KEY = 'outlier:admin-secret';

/** Share of a source's answers that went to each value, as a little bar. */
function Bar({ count, total, kind }: { count: number; total: number; kind: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <td className="admin__cell">
      <span className={`admin__bar admin__bar--${kind}`} style={{ width: `${Math.min(100, pct * 2)}%` }} />
      <span className="admin__num">{count ? `${pct.toFixed(0)}%` : ''}</span>
    </td>
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
      <p className="pencil">Ghost answers against real ones, per question. Tune src/lib/ghostWeights.ts to close the gaps.</p>
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
          {stats.prompts.map((p) => {
            const rules = p.values.reduce((s, v) => s + v.rules, 0);
            const ai = p.values.reduce((s, v) => s + v.ai, 0);
            const top = p.values
              .slice()
              .sort((a, b) => b.real + b.rules + b.ai - (a.real + a.rules + a.ai) || a.value - b.value)
              .slice(0, 12);
            // Total variation distance between real answers and all ghosts: 0 identical, 1 disjoint.
            const ghosts = rules + ai;
            const gap =
              p.realTotal && ghosts
                ? p.values.reduce((s, v) => s + Math.abs(v.real / p.realTotal - (v.rules + v.ai) / ghosts), 0) / 2
                : null;
            return (
              <div key={p.position} className="admin__prompt">
                <h2>
                  <span className="mono pencil">Q{p.position}.</span> {getPrompt(p.promptId).text}
                </h2>
                <p className="pencil mono admin__meta">
                  {p.realTotal} real · {rules} rule ghosts · {ai} AI ghosts
                  {gap !== null && ` · gap ${(gap * 100).toFixed(0)}%`}
                </p>
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th scope="col">Answer</th>
                      <th scope="col">Real</th>
                      <th scope="col">Rules</th>
                      <th scope="col">AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((v) => (
                      <tr key={v.value}>
                        <th scope="row" className="mono">
                          {v.value.toLocaleString('en-GB')}
                        </th>
                        <Bar count={v.real} total={p.realTotal} kind="real" />
                        <Bar count={v.rules} total={rules} kind="rules" />
                        <Bar count={v.ai} total={ai} kind="ai" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
