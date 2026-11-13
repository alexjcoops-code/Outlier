import { TIERS, TIER_ORDER } from '../lib/scoring.ts';

/** The tier table, drawn as the mark scheme at the bottom of a worksheet. */
export function MarkScheme() {
  return (
    <table className="mark-scheme">
      <caption>Mark scheme</caption>
      <tbody>
        {TIER_ORDER.map((id) => {
          const t = TIERS[id];
          return (
            <tr key={id}>
              <td className="mark-scheme__swatch">
                <span className={`swatch tier-${id}`} aria-hidden="true" />
              </td>
              <th scope="row">
                {t.name}
                <span className="mark-scheme__rule">{t.rule}</span>
              </th>
              <td className="mark-scheme__points">{t.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
