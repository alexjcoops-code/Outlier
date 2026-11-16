// What lies on the desk round the sheet, on a wide screen: stationery on the
// left, sticky notes on the right. The notes carry real information (the rule
// in brief, your recent days, when the next sheet comes out); the stationery is
// only there to make the desk feel like a desk.
//
// Everything is drawn as a cartoon: a 2 px ink outline, flat fills, one flat
// highlight, and a flat shadow cast down and to the right (in desk.css).

import { useEffect, useState } from 'react';
import type { History } from '../lib/history.ts';
import { linkHandler } from '../lib/router.ts';
import { formatShortDate, msUntilUkMidnight } from '../lib/ukDate.ts';

const INK = 'var(--ink)';

/** A yellow HB pencil, top-down, pointing right. */
function Pencil() {
  // The sharpened cone runs from x 262 to the point at x 334; the lead starts at x 310.
  const coneY = (x: number, top: boolean) => (top ? 7 + ((x - 262) * 13) / 72 : 33 - ((x - 262) * 13) / 72);
  return (
    <svg className="desk__pencil" viewBox="0 0 340 40" width="340" height="40" aria-hidden="true">
      <g stroke={INK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        {/* rubber */}
        <path d="M36 7 H17 Q4 7 4 20 Q4 33 17 33 H36 Z" fill="#f59aa3" />
        <path d="M12 12.5 Q15 11 26 11" fill="none" stroke="#fcd0d4" strokeWidth="3" />
        {/* metal ferrule with two crimps */}
        <rect x="34" y="5.5" width="30" height="29" rx="2" fill="#c9ced6" />
        <rect x="40" y="5.5" width="5" height="29" fill="#a3aab5" strokeWidth="1.5" />
        <rect x="53" y="5.5" width="5" height="29" fill="#a3aab5" strokeWidth="1.5" />
        <path d="M36 10 H62" fill="none" stroke="#eef1f4" strokeWidth="2.5" />
        {/* the painted body: three flat facets */}
        <rect x="64" y="7" width="200" height="26" fill="#f7b51d" />
        <rect x="64" y="7" width="200" height="8" fill="#ffd54d" stroke="none" />
        <rect x="64" y="25" width="200" height="8" fill="#de9410" stroke="none" />
        <path d="M64 15 H264 M64 25 H264" fill="none" stroke="#b9770a" strokeWidth="1.2" />
        <rect x="64" y="7" width="200" height="26" fill="none" />
        <text x="232" y="23.5" fontFamily="var(--mono)" fontSize="9" fontWeight="600" fill="#7a4d00" stroke="none">
          HB
        </text>
        {/* sharpened wood, with the scalloped edge where the paint stops */}
        <path
          d={`M264 7 Q271 9.5 266 13.5 Q273 16.5 266 20 Q273 23.5 266 26.5 Q271 30.5 264 33 L310 ${coneY(310, false)} L310 ${coneY(310, true)} Z`}
          fill="#f3d6a6"
        />
        <path d="M276 15.5 Q290 17 300 17.5" fill="none" stroke="#dcb57e" strokeWidth="1.5" />
        {/* the lead */}
        <path d={`M310 ${coneY(310, true)} L334 20 L310 ${coneY(310, false)} Q306.5 20 310 ${coneY(310, true)} Z`} fill="#3b404c" />
        <path d="M314 18.6 L324 19.6" fill="none" stroke="#8b93a3" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** A clear plastic 15 cm ruler, lying upright. */
function Ruler() {
  const cm = 22;
  const top = 14;
  const length = 30 + 15 * cm;
  const ticks = [];
  for (let mm = 0; mm <= 150; mm++) {
    const y = top + (mm * cm) / 10;
    const len = mm % 10 === 0 ? 17 : mm % 5 === 0 ? 12 : 7;
    ticks.push(<line key={mm} x1="2" x2={2 + len} y1={y} y2={y} strokeWidth={mm % 10 === 0 ? 1.4 : 1} />);
  }
  const numbers = [];
  for (let n = 0; n <= 15; n++) {
    numbers.push(
      <text key={n} x="24" y={top + n * cm + 3.6}>
        {n}
      </text>,
    );
  }
  return (
    <svg className="desk__ruler" viewBox={`0 0 56 ${length}`} width="56" height={length} aria-hidden="true">
      <rect x="1" y="1" width="54" height={length - 2} rx="4" fill="#d3e9f3" stroke={INK} strokeWidth="2" />
      {/* a tinted strip down the far edge, like the bevel on a real ruler */}
      <rect x="44" y="2" width="10" height={length - 4} rx="3" fill="#b4d5e8" />
      <g stroke={INK}>{ticks}</g>
      <g className="desk__ruler-numbers">{numbers}</g>
      <text className="desk__ruler-cm" x="28" y={length - 10}>
        cm
      </text>
      {/* two flat gleams */}
      <path d={`M40 ${length * 0.18} L48 ${length * 0.13} M40 ${length * 0.24} L48 ${length * 0.19}`} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}



/** A paperclip: an ink line with a silver wire inside it. */
function Paperclip() {
  const d = 'M15 15 V42 a5.5 5.5 0 0 1 -11 0 V10 a8.5 8.5 0 0 1 17 0 V38';
  return (
    <svg className="desk-note__clip" viewBox="0 0 26 56" width="26" height="56" aria-hidden="true">
      <path d={d} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#d3d9e0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The note itself: a square of coloured paper with a slightly uneven edge and
 * the bottom-right corner curling up. Stretched to fit whatever is written on it.
 */
function NotePaper() {
  return (
    <svg className="desk-note__paper" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M1.2 2.4 L50 1.4 L98.8 1 L98.6 50 L98.3 84 L83 98.8 L40 98.4 L1.6 98.2 L1 50 Z"
        fill="var(--note)"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* the glue strip along the top, a shade darker */}
      <path d="M1.4 2.4 L50 1.4 L98.7 1.1 L98.7 13 L1.3 13.4 Z" fill="var(--note-fold)" opacity="0.35" />
      {/* the curl: the back of the paper showing */}
      <path
        d="M98.3 84 L86 85.5 L83 98.8 Z"
        fill="var(--note-fold)"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Hours and minutes to midnight in London. Minutes only: nothing on the desk ticks by the second. */
function useUntilMidnight(): string {
  const [ms, setMs] = useState(() => msUntilUkMidnight());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilUkMidnight()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface Props {
  history: History;
  today: string;
  streak: number;
  navigate: (to: string) => void;
}

export function DeskLeft() {
  return (
    <div className="desk__side desk__side--left" aria-hidden="true">
      <div className="desk__props">
        <Ruler />
        <Pencil />
      </div>
    </div>
  );
}

export function DeskRight({ history, today, streak, navigate }: Props) {
  const until = useUntilMidnight();
  const days = Object.entries(history)
    .filter(([date]) => date <= today)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const recent = days.slice(0, 4);
  const best = days.reduce((m, [, e]) => Math.max(m, e.total), 0);

  return (
    <aside className="desk__side desk__side--right" aria-label="Notes on the desk">
      <div className="desk__notes">
        <section className="desk-note desk-note--pink">
          <NotePaper />
          <Paperclip />
          <h2>Recent days</h2>
          {recent.length === 0 ? (
            <p>Nothing in your book yet. Finish today's sheet and it goes in.</p>
          ) : (
            <>
              <ul className="desk-note__days">
                {recent.map(([date, e]) => (
                  <li key={date}>
                    <span>{date === today ? 'Today' : formatShortDate(date).slice(0, 10)}</span>
                    <span className="mono">{e.total}</span>
                  </li>
                ))}
              </ul>
              <p className="desk-note__small">
                {streak > 1 ? `${streak} days running. ` : ''}Best: <span className="mono">{best}</span>
              </p>
            </>
          )}
          <a href="/book" onClick={linkHandler(navigate, '/book')}>
            Open my book
          </a>
        </section>

        <section className="desk-note desk-note--blue">
          <NotePaper />
          <span className="desk-note__tape" aria-hidden="true" />
          <h2>Next sheet</h2>
          <p>
            New questions in <span className="mono">{until}</span>, at midnight UK time.
          </p>
          <a href="/versus" onClick={linkHandler(navigate, '/versus')}>
            Play people live
          </a>
        </section>
      </div>
    </aside>
  );
}
