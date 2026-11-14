import { MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header.tsx';
import { HowToPlay } from './components/HowToPlay.tsx';
import { ConfettiLayer } from './components/Confetti.tsx';
import { SvgDefs } from './components/Marks.tsx';
import { createBackend } from './lib/backend/index.ts';
import type { DayResults } from './lib/backend/types.ts';
import { loadHistory, recordDay, streak } from './lib/history.ts';
import { linkHandler, useRoute } from './lib/router.ts';
import { ukDateString } from './lib/ukDate.ts';
import { AdminPage } from './pages/AdminPage.tsx';
import { BookPage } from './pages/BookPage.tsx';
import { PlayPage } from './pages/PlayPage.tsx';
import { VersusPage } from './pages/VersusPage.tsx';
import { createVersusBackend } from './lib/versusOnline.ts';

const HELP_SEEN = 'outlier:help-seen';

export function App() {
  const [path, navigate] = useRoute();
  const backend = useMemo(() => createBackend(), []);
  const versus = useMemo(() => createVersusBackend(), []);
  const [today, setToday] = useState(() => ukDateString());
  const [history, setHistory] = useState(loadHistory);
  const [help, setHelp] = useState(false);

  // Roll over to the new worksheet at midnight in London, even if the tab stays open.
  useEffect(() => {
    const id = setInterval(() => setToday(ukDateString()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Past days still marked provisional in "My book" get their final marks once the day is locked.
  useEffect(() => {
    const pending = Object.entries(loadHistory()).filter(([date, entry]) => !entry.final && date < today);
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const [date] of pending.slice(-14)) {
        try {
          const r = await backend.getResults(date);
          if (cancelled) return;
          if (r.final) setHistory(recordDay(r));
        } catch {
          return; // offline: try again next visit
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, today]);

  const onFinished = useCallback((r: DayResults) => setHistory(recordDay(r)), []);
  const closeHelp = useCallback(() => {
    setHelp(false);
    try {
      localStorage.setItem(HELP_SEEN, '1');
    } catch {
      /* fine */
    }
  }, []);

  const page = path.replace(/\/+$/, '') || '/';
  const days = streak(history, today);

  return (
    <MotionConfig reducedMotion="user">
      <SvgDefs />
      <div className="page">
        <div className="column">
          <Header date={today} streak={days} navigate={navigate} onHelp={() => setHelp(true)} />
          <main>
            {page === '/' && (
              <PlayPage key={today} backend={backend} date={today} navigate={navigate} onFinished={onFinished} />
            )}
            {page === '/versus' && <VersusPage backend={versus} navigate={navigate} />}
            {page === '/book' && <BookPage history={history} today={today} streak={days} navigate={navigate} />}
            {page === '/admin' && <AdminPage backend={backend} today={today} />}
            {!['/', '/versus', '/book', '/admin'].includes(page) && (
              <div className="notice">
                <span className="hand">Wrong classroom.</span>
                <p>
                  There's nothing on this page.{' '}
                  <a href="/" onClick={linkHandler(navigate, '/')}>
                    Back to today's worksheet
                  </a>
                  .
                </p>
              </div>
            )}
          </main>
          <footer className="footer">
            <a href="/" onClick={linkHandler(navigate, '/')}>
              Today
            </a>
            <a href="/versus" onClick={linkHandler(navigate, '/versus')}>
              Versus
            </a>
            <a href="/book" onClick={linkHandler(navigate, '/book')}>
              My book
            </a>
            <button type="button" className="linklike" onClick={() => setHelp(true)}>
              How to play
            </button>
          </footer>
        </div>
      </div>
      {help && <HowToPlay onClose={closeHelp} />}
      <ConfettiLayer />
    </MotionConfig>
  );
}
