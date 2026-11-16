// What lies on the desk round the sheet, on a wide screen: stationery on the
// left, sticky notes on the right. The notes carry real information (the rules
// in brief, your recent days, when the next sheet comes out); the stationery is
// only there to make the desk feel like a desk. Hidden below 1180 px wide.

import { useEffect, useState } from 'react';
import type { History } from '../lib/history.ts';
import { linkHandler } from '../lib/router.ts';
import { formatShortDate, msUntilUkMidnight } from '../lib/ukDate.ts';

/** A flat, top-down pencil: ink outline, flat fills, no shading. Drawn pointing right. */
function Pencil() {
  return (
    <svg className="desk__pencil" viewBox="0 0 320 30" width="320" height="30" aria-hidden="true">
      <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
        {/* rubber and ferrule */}
        <path d="M10 4 H30 V26 H10 Q3 26 3 15 Q3 4 10 4 Z" fill="#f2a3a3" />
        <rect x="30" y="3" width="24" height="24" fill="#c9c6bd" />
        <path d="M38 3 V27 M46 3 V27" fill="none" />
        {/* the painted body, with its two flat facets */}
        <rect x="54" y="4" width="196" height="22" fill="#f4c430" />
        <path d="M54 11.5 H250 M54 18.5 H250" fill="none" stroke="#c99a12" strokeWidth="1.2" />
        {/* sharpened wood and the lead */}
        <path d="M250 4 L298 15 L250 26 Z" fill="#ecd3a4" />
        <path d="M284 11.8 L298 15 L284 18.2 Z" fill="var(--ink)" />
      </g>
    </svg>
  );
}

/** A clear plastic 15 cm ruler, lying upright. */
function Ruler() {
  const cm = 22;
  const ticks = [];
  for (let mm = 0; mm <= 150; mm++) {
    const y = 14 + (mm * cm) / 10;
    const long = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks.push(<line key={mm} x1="0" x2={long ? 16 : mid ? 11 : 7} y1={y} y2={y} />);
  }
  const numbers = [];
  for (let n = 0; n <= 15; n++) {
    numbers.push(
      <text key={n} x="20" y={14 + n * cm + 3.5}>
        {n}
      </text>,
    );
  }
  return (
    <svg className="desk__ruler" viewBox={`0 0 48 ${28 + 15 * cm}`} width="48" height={28 + 15 * cm} aria-hidden="true">
      <rect x="0.75" y="0.75" width="46.5" height={26.5 + 15 * cm} rx="3" fill="rgba(255,255,255,0.42)" stroke="var(--ink)" strokeWidth="1.5" />
      <g stroke="var(--ink)" strokeWidth="1">
        {ticks}
      </g>
      <g className="desk__ruler-numbers">{numbers}</g>
    </svg>
  );
}

/** A rubber in a card sleeve. */
function Rubber() {
  return (
    <svg className="desk__rubber" viewBox="0 0 92 44" width="92" height="44" aria-hidden="true">
      <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="1" y="4" width="90" height="36" rx="5" fill="#f7f4ee" />
        <rect x="22" y="2" width="54" height="40" rx="1.5" fill="#3f6fb5" />
      </g>
      <path d="M30 22 H68" stroke="#f7f4ee" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}

/** A clear plastic protractor: half a disc with degree marks every 10. */
function Protractor() {
  const r = 84;
  const cx = 90;
  const cy = 92;
  const marks = [];
  for (let d = 0; d <= 180; d += 5) {
    const a = (d * Math.PI) / 180;
    const len = d % 10 === 0 ? 10 : 5;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy - Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r - len);
    const y2 = cy - Math.sin(a) * (r - len);
    marks.push(<line key={d} x1={x1} y1={y1} x2={x2} y2={y2} />);
  }
  const labels = [0, 30, 60, 90, 120, 150, 180].map((d) => {
    const a = (d * Math.PI) / 180;
    return (
      <text key={d} x={cx + Math.cos(a) * (r - 20)} y={cy - Math.sin(a) * (r - 20) + 3} textAnchor="middle">
        {d}
      </text>
    );
  });
  return (
    <svg className="desk__protractor" viewBox="0 0 180 98" width="180" height="98" aria-hidden="true">
      <path
        d={`M${cx - r - 4} ${cy + 4} A${r + 4} ${r + 4} 0 0 1 ${cx + r + 4} ${cy + 4} Z`}
        fill="rgba(255,255,255,0.42)"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <g stroke="var(--ink)" strokeWidth="1">
        {marks}
      </g>
      {labels}
      <path d={`M${cx - 6} ${cy} H${cx + 6} M${cx} ${cy - 6} V${cy}`} stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}

/** A paperclip, drawn as one bent wire. */
function Paperclip() {
  return (
    <svg className="desk-note__clip" viewBox="0 0 22 52" width="22" height="52" aria-hidden="true">
      <path
        d="M15 14 V40 a5 5 0 0 1 -10 0 V9 a8 8 0 0 1 16 0 V38"
        fill="none"
        stroke="#7d8590"
        strokeWidth="2.2"
        strokeLinecap="round"
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
  onHelp: () => void;
}

export function DeskLeft() {
  return (
    <div className="desk__side desk__side--left" aria-hidden="true">
      <div className="desk__props">
        <Ruler />
        <Pencil />
        <Rubber />
        <Protractor />
      </div>
    </div>
  );
}

export function DeskRight({ history, today, streak, navigate, onHelp }: Props) {
  const until = useUntilMidnight();
  const days = Object.entries(history)
    .filter(([date]) => date <= today)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const recent = days.slice(0, 4);
  const best = days.reduce((m, [, e]) => Math.max(m, e.total), 0);

  return (
    <aside className="desk__side desk__side--right" aria-label="Notes on the desk">
      <div className="desk__notes">
        <section className="desk-note desk-note--yellow">
          <h2>The rule</h2>
          <p>Any right answer scores. The fewer people who said it, the more it's worth.</p>
          <button type="button" className="linklike" onClick={onHelp}>
            How to play
          </button>
        </section>

        <section className="desk-note desk-note--pink">
          <Paperclip />
          <h2>Recent days</h2>
          {recent.length === 0 ? (
            <p>Nothing in it yet. Finish today's sheet and it goes in.</p>
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
