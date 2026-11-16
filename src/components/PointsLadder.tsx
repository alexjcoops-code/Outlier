import { TIERS, TIER_ORDER, type TierId } from '../lib/scoring.ts';

const SHORT: Partial<Record<TierId, string>> = { clever: 'Clever' };

/**
 * The mark scheme as a staircase: one highlighter bar per tier, taller the more
 * it's worth. Replaces the old six-row table on the start page.
 */
export function PointsLadder() {
  return (
    <ol className="ladder" aria-label="Mark scheme">
      {TIER_ORDER.map((id, i) => {
        const t = TIERS[id];
        return (
          <li key={id} className="ladder__step" style={{ ['--i' as string]: i }} title={`${t.name}: ${t.rule}`}>
            <span className="ladder__points">{t.points}</span>
            <span
              className={`ladder__bar tier-${id}`}
              style={{ height: `${18 + (t.points / 100) * 70}px` }}
              aria-hidden="true"
            />
            <span className="ladder__name">
              {SHORT[id] ?? t.name}
              <span className="sr-only">: {t.rule}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
