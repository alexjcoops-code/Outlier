import type { DayRow } from '../lib/backend/types.ts';
import { TIERS } from '../lib/scoring.ts';

/** Seven answer boxes, like the grid on an exam cover. Filled with the tier colour once marked. */
export function ProgressBoxes({
  rows,
  current,
  currentMarked,
}: {
  rows: DayRow[];
  current: number | null;
  /** The current question has been marked (the reveal is showing). */
  currentMarked: boolean;
}) {
  return (
    <ol className="progress" aria-label="Progress">
      {rows.map((row) => {
        const done = row.started && (row.position !== current || currentMarked);
        const tier = TIERS[row.tier];
        const label = !row.started
          ? `Question ${row.position}: not yet answered`
          : row.position === current && !currentMarked
            ? `Question ${row.position}: in progress`
            : `Question ${row.position}: ${tier.name}, ${row.points} points`;
        const marked = done;
        return (
          <li
            key={row.position}
            className={`progress__box ${marked ? `tier-${row.tier} is-done` : ''} ${row.position === current ? 'is-current' : ''}`}
            aria-label={label}
            aria-current={row.position === current ? 'step' : undefined}
          >
            <span aria-hidden="true">{marked ? tier.symbol : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}
