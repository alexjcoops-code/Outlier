import { useState } from 'react';
import { Tally } from '../components/Marks.tsx';
import type { History } from '../lib/history.ts';
import { linkHandler } from '../lib/router.ts';
import { MAX_TOTAL, TIERS } from '../lib/scoring.ts';
import { dayNumber, formatShortDate } from '../lib/ukDate.ts';

interface Props {
  history: History;
  today: string;
  streak: number;
  navigate: (to: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Months to draw: from the earliest played month to the current one, newest first. */
function monthsToShow(history: History, today: string): string[] {
  const keys = Object.keys(history).sort();
  const first = (keys[0] ?? today).slice(0, 7);
  const out: string[] = [];
  let [y, m] = today.slice(0, 7).split('-').map(Number) as [number, number];
  for (let i = 0; i < 24; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key <= first) break;
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function BookPage({ history, today, streak, navigate }: Props) {
  const [picked, setPicked] = useState<string | null>(history[today] ? today : null);
  const played = Object.keys(history).length;
  const best = Math.max(0, ...Object.values(history).map((h) => h.total));
  const entry = picked ? history[picked] : undefined;

  return (
    <section className="book" aria-labelledby="book-title">
      <h1 id="book-title">My book</h1>
      <dl className="book__stats">
        <div>
          <dt>Streak</dt>
          <dd>
            {streak > 0 && <Tally count={streak} />} {streak} {streak === 1 ? 'day' : 'days'}
          </dd>
        </div>
        <div>
          <dt>Worksheets</dt>
          <dd>{played}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{played ? `${best} / ${MAX_TOTAL}` : 'none'}</dd>
        </div>
      </dl>

      <p className="pencil book__archive">
        Missed a day? Every past worksheet is in{' '}
        <a href="/archive" onClick={linkHandler(navigate, '/archive')}>
          the archive
        </a>
        .
      </p>

      {played === 0 && (
        <p className="pencil">
          Nothing marked yet. <a href="/" onClick={linkHandler(navigate, '/')}>Do today's worksheet</a> and it
          will turn up here.
        </p>
      )}

      {monthsToShow(history, today).map((month) => {
        const [y, m] = month.split('-').map(Number) as [number, number];
        const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        // Monday-first offset for the 1st.
        const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
        return (
          <div key={month} className="book__month">
            <h2>
              {MONTH_NAMES[m - 1]} {y}
            </h2>
            <div className="book__grid" role="list">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="book__dow" aria-hidden="true">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`lead-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, '0')}`;
                const h = history[date];
                const future = dayNumber(date) > dayNumber(today);
                if (!h) {
                  return (
                    <span
                      key={date}
                      role="listitem"
                      className={`book__cell ${future ? 'is-future' : ''} ${date === today ? 'is-today' : ''}`}
                      aria-label={`${formatShortDate(date)}: ${future ? 'not yet' : 'not played'}`}
                    >
                      <span className="book__day">{i + 1}</span>
                    </span>
                  );
                }
                return (
                  <button
                    key={date}
                    type="button"
                    role="listitem"
                    className={`book__cell is-played ${date === today ? 'is-today' : ''} ${picked === date ? 'is-picked' : ''}`}
                    style={{ ['--shade' as string]: String(0.12 + (h.total / MAX_TOTAL) * 0.6) }}
                    onClick={() => setPicked(date)}
                    aria-label={`${formatShortDate(date)}: ${h.total} out of ${MAX_TOTAL}`}
                    aria-pressed={picked === date}
                  >
                    <span className="book__day">{i + 1}</span>
                    <span className="book__score">{h.total}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {picked && entry && (
        <div className="book__detail" role="status">
          <p className="mono">
            {formatShortDate(picked)}: {entry.total} / {MAX_TOTAL}
            {!entry.final && <span className="pencil"> (provisional)</span>}
          </p>
          <p className="book__tiers">
            {entry.tiers.map((t, i) => (
              <span key={i} className={`hl tier-${t}`}>
                <span className="mono">Q{i + 1}</span> {TIERS[t].name}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
