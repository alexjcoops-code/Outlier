import type { DayResults } from './backend/types.ts';
import { MAX_TOTAL, TIERS } from './scoring.ts';
import { formatSlashDate } from './ukDate.ts';

/**
 * Oddle 13/11/26: 415/700
 * ●◐○★●·✦
 * oddle.example
 */
export function shareText(results: DayResults, host: string): string {
  const symbols = results.rows.map((r) => TIERS[r.tier].symbol).join('');
  return `Oddle ${formatSlashDate(results.date)}: ${results.total}/${MAX_TOTAL}\n${symbols}\n${host}`;
}
