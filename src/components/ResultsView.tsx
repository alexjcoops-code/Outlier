import { useReducedMotion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { awardFor, burst, buzz, shakePage } from '../lib/celebrate.ts';
import type { Backend, DayResults, DayRow, Distribution } from '../lib/backend/types.ts';
import { teacherComment } from '../lib/comment.ts';
import { linkHandler } from '../lib/router.ts';
import { formatShare, MAX_TOTAL, TIERS } from '../lib/scoring.ts';
import { shareText } from '../lib/share.ts';
import { getPrompt } from '../prompts.ts';
import { Countdown } from './Countdown.tsx';
import { CrowdPlot } from './CrowdPlot.tsx';
import { InkStamp } from './InkStamp.tsx';
import { Circled, Scribble } from './Marks.tsx';
import { basedOn } from './Reveal.tsx';

interface Props {
  results: DayResults;
  backend: Backend;
  navigate: (to: string) => void;
  /** Practice rounds: no share, no countdown, a button to go again. */
  onAgain?: () => void;
  /** The paper was just finished (not reloaded): celebrate a good day. */
  fresh?: boolean;
}

/** A ruled line from 0 to 700 with your score, today's average and the top-10% mark. */
function NumberLine({ total, average, top10 }: { total: number; average: number | null; top10: number | null }) {
  // Drawn at its real pixel width so the labels stay a readable size on a phone.
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(520);
  useLayoutEffect(() => {
    const measure = () => setW(Math.max(240, Math.round(ref.current?.getBoundingClientRect().width ?? 520)));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const x = (score: number) => 8 + (score / MAX_TOTAL) * (w - 16);
  const labels: { at: number; text: string }[] = [];
  if (average !== null) labels.push({ at: average, text: `avg ${average}` });
  if (top10 !== null) labels.push({ at: top10, text: `top 10% ${top10}` });
  // Drop the second label a line if the two would collide.
  const clash = labels.length === 2 && Math.abs(x(labels[0]!.at) - x(labels[1]!.at)) < 130;
  const description =
    `Your score: ${total} out of ${MAX_TOTAL}.` +
    (average !== null ? ` Today's average: ${average}.` : '') +
    (top10 !== null ? ` Top 10% score: ${top10}.` : '');
  return (
    <svg ref={ref} className="number-line" height="118" viewBox={`0 0 ${w} 118`} role="img" aria-label={description}>
      <path d={`M8 52 L${w - 8} 52`} stroke="var(--ink)" strokeWidth="1.6" />
      {[0, 100, 200, 300, 400, 500, 600, 700].map((n) => (
        <path key={n} d={`M${x(n)} 46 L${x(n)} 58`} stroke="var(--ink)" strokeWidth="1.4" />
      ))}
      <text x={x(0)} y="76" className="number-line__end" textAnchor="start">
        0
      </text>
      <text x={x(700)} y="76" className="number-line__end" textAnchor="end">
        700
      </text>
      {labels.map((l, i) => {
        const drop = clash && i === 1 ? 17 : 0;
        const anchor = x(l.at) > w - 70 ? 'end' : x(l.at) < 60 ? 'start' : 'middle';
        return (
          <g key={l.text}>
            <path
              d={`M${x(l.at)} 44 L${x(l.at)} ${80 + drop}`}
              stroke="var(--pencil)"
              strokeWidth="1.4"
              strokeDasharray="3 3"
            />
            <text x={x(l.at)} y={93 + drop} className="number-line__label" textAnchor={anchor}>
              {l.text}
            </text>
          </g>
        );
      })}
      {/* Your score: a red-pen cross and arrow, drawn a little off true. */}
      <g transform={`translate(${x(total)} 52)`} stroke="var(--redpen)" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M-6 -7 L6 6" />
        <path d="M6 -7 L-5 7" />
        <path d="M1 -14 C2 -22, -1 -27, 0 -31" />
      </g>
      <text
        x={Math.min(Math.max(x(total), 22), w - 22)}
        y="15"
        className="number-line__you"
        textAnchor="middle"
      >
        you
      </text>
    </svg>
  );
}

/** Top answers as hatched pencil bars. Your own answer gets the highlighter. */
function BarChart({ dist, row }: { dist: Distribution; row: DayRow }) {
  const bars = dist.values.slice(0, 5);
  if (row.value !== null && row.share !== null && !bars.some((b) => b.value === row.value)) {
    bars.push({ value: row.value, share: row.share });
  }
  const max = Math.max(...bars.map((b) => b.share), 0.01);
  return (
    <div className="bars">
      <table>
        <caption className="sr-only">Most common answers</caption>
        <tbody>
          {bars.map((b) => {
            const mine = b.value === row.value;
            return (
              <tr key={b.value} className={mine ? 'is-mine' : ''}>
                <th scope="row" className="bars__value">
                  <span className={mine ? 'hl' : ''}>{b.value.toLocaleString('en-GB')}</span>
                </th>
                <td className="bars__bar">
                  <svg width="100%" height="16" aria-hidden="true">
                    <rect
                      x="0.75"
                      y="1.75"
                      width={`${Math.max(2, (b.share / max) * 98)}%`}
                      height="12.5"
                      fill={mine ? 'url(#hatch-ink)' : 'url(#hatch)'}
                      stroke={mine ? 'var(--ink)' : 'var(--pencil)'}
                      strokeWidth="1.2"
                    />
                  </svg>
                </td>
                <td className="bars__pct">
                  {formatShare(b.share)}
                  {mine && <span className="sr-only"> (your answer)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({ row, results, backend }: { row: DayRow; results: DayResults; backend: Backend }) {
  const [open, setOpen] = useState(false);
  const [dist, setDist] = useState<Distribution | 'loading' | 'error'>('loading');
  const tier = TIERS[row.tier];
  const prompt = getPrompt(row.promptId);
  const panelId = `dist-${row.position}`;

  const load = () => {
    setDist('loading');
    backend
      .getDistribution(results.date, row.position)
      .then(setDist)
      .catch(() => setDist('error'));
  };
  useEffect(load, [backend, results.date, row.position]);

  const toggle = () => {
    setOpen(!open);
    if (!open && dist === 'error') load();
  };

  return (
    <li className="result">
      <span className="margin-note" aria-hidden="true">
        Q{row.position}.
      </span>
      <button type="button" className="result__head" onClick={toggle} aria-expanded={open} aria-controls={panelId}>
        <span className="sr-only">Question {row.position}: </span>
        <span className="result__prompt">{prompt.text}</span>
        <span className="result__line">
          <span className="result__value mono">
            {row.value === null ? '—' : row.value.toLocaleString('en-GB')}
          </span>
          {row.tier === 'none' ? (
            <span className="hand result__missed">out of time</span>
          ) : (
            <span className={`hl tier-${row.tier} result__tier`}>{tier.name}</span>
          )}
          <span className="hand result__points">{row.tier === 'none' ? '0' : `+${row.points}`}</span>
        </span>
        {!open && typeof dist === 'object' && (
          <span className="result__strip" aria-hidden="true">
            <CrowdPlot prompt={prompt} values={dist.values} mine={row.value} compact />
          </span>
        )}
        <span className="result__meta pencil">
          {row.share !== null &&
            (row.tier === 'lone' ? 'nobody else said this' : `${formatShare(row.share)} said this`)}
          <span className="result__chev" aria-hidden="true">
            {open ? 'hide the crowd' : 'see the crowd'}
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="result__panel">
          {dist === 'loading' && <Scribble label="Fetching the class answers" />}
          {dist === 'error' && <p className="pencil">Can't reach the staffroom. Tap again in a moment.</p>}
          {typeof dist === 'object' && (
            <>
              <CrowdPlot
                prompt={prompt}
                values={dist.values}
                mine={row.value}
                lone={row.tier === 'lone'}
                animate
                caption={`${basedOn(dist.players, dist.simulated)}.`}
              />
              <BarChart dist={dist} row={row} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ResultsView({ results, backend, navigate, onAgain, fresh = false }: Props) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const practice = backend.kind === 'practice';
  const text = shareText(results, window.location.host);
  const reduce = useReducedMotion();
  const award = awardFor(results.total);
  const totalRef = useRef<HTMLDivElement>(null);

  // A good day: the award stamp slams down and the confetti goes up.
  useEffect(() => {
    if (!fresh || !award || reduce) return;
    const id = setTimeout(() => {
      const rect = totalRef.current?.getBoundingClientRect();
      if (rect) burst({ x: rect.left + rect.width * 0.35, y: rect.top + rect.height / 2, chads: award.chads, stars: award.stars, colour: '#ffe97a' });
      shakePage(award.chads > 100 ? 0.8 : 0.4);
      buzz(award.chads > 100 ? [30, 50, 30, 50, 120] : [25]);
    }, 1050);
    return () => clearTimeout(id);
    // Once per finished paper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied('idle'), 2500);
  };

  return (
    <section className="results" aria-labelledby="results-title">
      <h1 id="results-title">{practice ? 'Practice paper, marked' : "Today's worksheet, marked"}</h1>
      {!practice && !results.final && <span className="provisional">provisional</span>}

      <div className="results__total" ref={totalRef}>
        {award && (
          <InkStamp
            text={award.text}
            ink={award.ink}
            delay={fresh ? 0.95 : 0}
            scale={award.chads > 100 ? 1.1 : 0.95}
            className="results__award"
          />
        )}
        <Circled className="results__circle" delay={0.2}>
          <span className="results__score">{results.total}</span>
          <span className="results__outof"> / {MAX_TOTAL}</span>
        </Circled>
        <p className="hand results__comment">{teacherComment(results.rows, results.total)}</p>
      </div>

      <p className="pencil results__basis">
        {practice
          ? 'Practice marks use simulated answers only. Nothing is saved.'
          : results.final
            ? `Final marks. ${basedOn(results.players, results.simulated)}.`
            : `Marks can still change until midnight. ${basedOn(results.players, results.simulated)}.`}
      </p>

      <NumberLine total={results.total} average={results.average} top10={results.top10} />

      <ol className="results__list">
        {results.rows.map((row) => (
          <ResultRow key={row.position} row={row} results={results} backend={backend} />
        ))}
      </ol>

      <div className="results__actions">
        {practice ? (
          <>
            <button type="button" className="stamp stamp--small" onClick={onAgain}>
              Another paper
            </button>
            <a href="/" onClick={linkHandler(navigate, '/')}>
              Back to today's worksheet
            </a>
          </>
        ) : (
          <>
            <button type="button" className="stamp stamp--small" onClick={copy}>
              Copy result
            </button>
            <a href="/practice" onClick={linkHandler(navigate, '/practice')}>
              Practice
            </a>
          </>
        )}
      </div>
      {!practice && (
        <>
          <p className="pencil results__copied" role="status">
            {copied === 'done' && 'Copied.'}
            {copied === 'failed' && "Couldn't copy. Select the text below instead."}
          </p>
          <pre className="results__share" aria-label="Share text">{text}</pre>
          <Countdown />
        </>
      )}
    </section>
  );
}
