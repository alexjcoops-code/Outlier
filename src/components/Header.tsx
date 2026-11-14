import { linkHandler } from '../lib/router.ts';
import { formatShortDate } from '../lib/ukDate.ts';
import { Tally } from './Marks.tsx';

interface Props {
  date: string;
  streak: number;
  navigate: (to: string) => void;
  onHelp: () => void;
}

export function Header({ date, streak, navigate, onHelp }: Props) {
  return (
    <header className="header">
      <a className="wordmark" href="/" onClick={linkHandler(navigate, '/')} aria-label="Outlier, home">
        <span aria-hidden="true">
          outl
          <span className="wordmark__i">
            ı<span className="wordmark__dot" />
          </span>
          er
        </span>
      </a>
      <div className="header__right">
        <span className="header__date">
          <span className="header__weekday">{formatShortDate(date).slice(0, 4)}</span>
          {formatShortDate(date).slice(4)}
        </span>
        {/* No streak, nothing to show. One tally stroke on its own looks like a divider, so tallies start at two. */}
        {streak > 0 && (
          <a
            className="header__streak"
            href="/book"
            onClick={linkHandler(navigate, '/book')}
            aria-label={`My book. Streak: ${streak} ${streak === 1 ? 'day' : 'days'}`}
          >
            {streak > 1 && <Tally count={Math.min(streak, 5)} />}
            <span aria-hidden="true">{streak === 1 ? 'day 1' : `${streak} days`}</span>
          </a>
        )}
        <button type="button" className="header__help" onClick={onHelp} aria-label="How to play">
          ?
        </button>
      </div>
    </header>
  );
}
