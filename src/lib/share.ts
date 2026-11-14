import type { DayResults } from './backend/types.ts';
import { MAX_TOTAL, TIERS } from './scoring.ts';
import { formatSlashDate } from './ukDate.ts';

/**
 * Outlier 13/11/26: 415/700
 * ●◐○★●·✦
 * outlier.example
 */
export function shareText(results: DayResults, host: string): string {
  const symbols = results.rows.map((r) => TIERS[r.tier].symbol).join('');
  return `Outlier ${formatSlashDate(results.date)}: ${results.total}/${MAX_TOTAL}\n${symbols}\n${host}`;
}
