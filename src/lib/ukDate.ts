// The game day runs midnight to midnight in Europe/London (GMT in winter, BST in summer).
// Everything here goes through Intl so the daylight-saving rules are never hand-rolled.

const ZONE = 'Europe/London';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface UkParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function ukParts(now: Date = new Date()): UkParts {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(now)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's game date in London as YYYY-MM-DD. */
export function ukDateString(now: Date = new Date()): string {
  const p = ukParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD date. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dateFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** London's offset from UTC, in ms, at a given instant (0 in winter, 3,600,000 in summer). */
function ukOffsetMs(at: Date): number {
  const p = ukParts(at);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the given London date begins. */
export function ukMidnight(date: string): Date {
  const utcMidnight = dayNumber(date) * 86_400_000;
  let guess = utcMidnight - ukOffsetMs(new Date(utcMidnight));
  // One correction pass covers days where the clocks change.
  guess = utcMidnight - ukOffsetMs(new Date(guess));
  return new Date(guess);
}

/** Milliseconds until the next London midnight. */
export function msUntilUkMidnight(now: Date = new Date()): number {
  return ukMidnight(addDays(ukDateString(now), 1)).getTime() - now.getTime();
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 13 Nov" */
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}

/** "13/11/26" */
export function formatSlashDate(date: string): string {
  const [y, m, d] = date.split('-') as [string, string, string];
  return `${d}/${m}/${y.slice(2)}`;
}

/** "07:12:44" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
