// Launch day: worksheet No. 1, and where the archive starts.
import { dayNumber } from './ukDate.ts';

export const LAUNCH_DATE = ((): string => {
  const env = import.meta.env.VITE_LAUNCH_DATE as string | undefined;
  return env && /^\d{4}-\d{2}-\d{2}$/.test(env) ? env : '2026-11-16';
})();

/** The worksheet's number: 1 on launch day. */
export function worksheetNumber(date: string): number {
  return dayNumber(date) - dayNumber(LAUNCH_DATE) + 1;
}
