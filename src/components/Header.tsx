import { linkHandler } from '../lib/router.ts';
import { formatShortDate } from '../lib/ukDate.ts';
import { Tally } from './Marks.tsx';
import { MenuButton } from './Menu.tsx';

interface Props {
  date: string;
  streak: number;
  navigate: (to: string) => void;
  onMenu: () => void;
}

export function Header({ date, streak, navigate, onMenu }: Props) {
  return (
    <header className="header">
      <a className="wordmark" href="/" onClick={linkHandler(navigate, '/')} aria-label="Oddle, home">
        {/* The teacher has circled the "o": the odd one out. */}
        <span aria-hidden="true">
          <span className="wordmark__o">o</span>ddle
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
        <MenuButton onClick={onMenu} />
      </div>
    </header>
  );
}
