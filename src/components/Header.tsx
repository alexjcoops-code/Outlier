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
        <span className="header__date">{formatShortDate(date)}</span>
        <a
          className="header__streak"
          href="/book"
          onClick={linkHandler(navigate, '/book')}
          aria-label={`My book. Streak: ${streak} ${streak === 1 ? 'day' : 'days'}`}
        >
          {streak > 0 && <Tally count={streak} />}
          <span aria-hidden="true">
            {streak} {streak === 1 ? 'day' : 'days'}
          </span>
        </a>
        <button type="button" className="header__help" onClick={onHelp} aria-label="How to play">
          ?
        </button>
      </div>
    </header>
  );
}
