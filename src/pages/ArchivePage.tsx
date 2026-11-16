import { useState } from 'react';
import { loadArchiveScores } from '../lib/backend/archive.ts';
import type { History } from '../lib/history.ts';
import { linkHandler } from '../lib/router.ts';
import { MAX_TOTAL } from '../lib/scoring.ts';
import { addDays, dayNumber, formatShortDate } from '../lib/ukDate.ts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many worksheets to list before "Show older". */
const PAGE = 30;

/**
 * The first worksheet in the archive. VITE_LAUNCH_DATE sets it; without it the
 * real game starts on its launch day and the offline demo offers the last 60 days.
 */
export function archiveStart(today: string, offline: boolean): string {
  const env = import.meta.env.VITE_LAUNCH_DATE as string | undefined;
  if (env && /^\d{4}-\d{2}-\d{2}$/.test(env)) return env;
  return offline ? addDays(today, -60) : '2026-11-13';
}

/** Can this date be played from the archive? */
export function inArchive(date: string, today: string, offline: boolean): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today && date >= archiveStart(today, offline);
}

/** Has an archive worksheet been started but not finished? */
function startedInArchive(date: string): boolean {
  try {
    return localStorage.getItem(`oddle:archive:${date}`) !== null;
  } catch {
    return false;
  }
}

interface Props {
  history: History;
  today: string;
  offline: boolean;
  navigate: (to: string) => void;
}

export function ArchivePage({ history, today, offline, navigate }: Props) {
  const [shown, setShown] = useState(PAGE);
  const scores = loadArchiveScores();
  const start = archiveStart(today, offline);
  const first = dayNumber(start);

  const dates: string[] = [];
  for (let d = addDays(today, -1); d >= start; d = addDays(d, -1)) dates.push(d);
  const visible = dates.slice(0, shown);
  const missed = dates.filter((d) => !history[d] && !scores[d]).length;

  // Group the visible days by month, newest first.
  const months: { key: string; dates: string[] }[] = [];
  for (const d of visible) {
    const key = d.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, dates: [] });
    months.at(-1)!.dates.push(d);
  }

  return (
    <section className="archive" aria-labelledby="archive-title">
      <h1 id="archive-title">The archive</h1>
      <p className="pencil archive__lede">
        Every past worksheet. You're marked against that day's crowd, which has finished, so your answers don't
        change anyone's marks, and they don't count towards your streak.
      </p>
      {dates.length === 0 ? (
        <p className="pencil">Nothing here yet. Yesterday's worksheet turns up here at midnight.</p>
      ) : (
        <p className="archive__count mono">
          {dates.length} {dates.length === 1 ? 'worksheet' : 'worksheets'}, {missed} not done yet
        </p>
      )}

      {months.map(({ key, dates: days }) => {
        const [y, m] = key.split('-').map(Number) as [number, number];
        return (
          <div key={key} className="archive__month">
            <h2>
              {MONTH_NAMES[m - 1]} {y}
            </h2>
            <ol className="archive__list">
              {days.map((date) => {
                const number = dayNumber(date) - first + 1;
                const live = history[date];
                const done = scores[date];
                const href = `/archive/${date}`;
                return (
                  <li key={date} className="archive__row">
                    <span className="margin-note archive__no" aria-hidden="true">
                      {number}.
                    </span>
                    <span className="archive__date">
                      <span className="sr-only">Worksheet {number}, </span>
                      {formatShortDate(date)}
                    </span>
                    {live ? (
                      <span className="archive__status pencil">
                        Done on the day <span className="mono archive__score">{live.total}</span>
                      </span>
                    ) : done ? (
                      <a className="archive__status" href={href} onClick={linkHandler(navigate, href)}>
                        <span className="sr-only">See your marks: </span>
                        <span className="mono archive__score">{done.total}</span>
                        <span className="pencil"> / {MAX_TOTAL}</span>
                      </a>
                    ) : (
                      <a className="archive__status archive__go" href={href} onClick={linkHandler(navigate, href)}>
                        {startedInArchive(date) ? 'Carry on' : 'Do it'}
                        <span className="sr-only">: worksheet for {formatShortDate(date)}</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}

      {shown < dates.length && (
        <p className="archive__more">
          <button type="button" className="stamp stamp--small stamp--ghost" onClick={() => setShown((n) => n + PAGE)}>
            Show older
          </button>
        </p>
      )}
    </section>
  );
}
