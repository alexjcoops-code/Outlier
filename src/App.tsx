import { MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header.tsx';
import { HowToPlay } from './components/HowToPlay.tsx';
import { DeskLeft, DeskRight } from './components/Desk.tsx';
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
import { ArchivePage, inArchive } from './pages/ArchivePage.tsx';
import { createArchiveBackend, recordArchiveScore } from './lib/backend/archive.ts';
import { memoryStorage } from './lib/backend/local.ts';
import { createVersusBackend } from './lib/versusOnline.ts';

const HELP_SEEN = 'outlier:help-seen';

export function App() {
  const [path, navigate] = useRoute();
  const backend = useMemo(() => createBackend(), []);
  const versus = useMemo(() => createVersusBackend(), []);
  const archive = useMemo(() => {
    let storage: Storage | ReturnType<typeof memoryStorage>;
    try {
      storage = window.localStorage;
    } catch {
      storage = memoryStorage();
    }
    return createArchiveBackend(backend, storage);
  }, [backend]);
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
  const offline = backend.kind === 'local';
  const archiveDate = page.startsWith('/archive/') ? page.slice('/archive/'.length) : null;
  const known = ['/', '/versus', '/book', '/archive', '/admin'].includes(page) || archiveDate !== null;

  return (
    <MotionConfig reducedMotion="user">
      <SvgDefs />
      <div className="desk">
      <DeskLeft />
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
            {page === '/archive' && <ArchivePage history={history} today={today} offline={offline} navigate={navigate} />}
            {archiveDate !== null &&
              (history[archiveDate] ? (
                <div className="notice">
                  <span className="hand">You did this one on the day.</span>
                  <p>
                    It's in{' '}
                    <a href="/book" onClick={linkHandler(navigate, '/book')}>
                      My book
                    </a>
                    . Pick another from{' '}
                    <a href="/archive" onClick={linkHandler(navigate, '/archive')}>
                      the archive
                    </a>
                    .
                  </p>
                </div>
              ) : inArchive(archiveDate, today, offline) ? (
                <PlayPage
                  key={`archive-${archiveDate}`}
                  backend={archive}
                  date={archiveDate}
                  navigate={navigate}
                  onFinished={recordArchiveScore}
                  archive
                />
              ) : (
                <div className="notice">
                  <span className="hand">Not in the archive.</span>
                  <p>
                    There's no past worksheet for that date.{' '}
                    <a href="/archive" onClick={linkHandler(navigate, '/archive')}>
                      See the archive
                    </a>
                    .
                  </p>
                </div>
              ))}
            {!known && (
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
            <a href="/archive" onClick={linkHandler(navigate, '/archive')}>
              Archive
            </a>
            <button type="button" className="linklike" onClick={() => setHelp(true)}>
              How to play
            </button>
          </footer>
        </div>
      </div>
      <DeskRight history={history} today={today} streak={days} navigate={navigate} onHelp={() => setHelp(true)} />
      </div>
      {help && <HowToPlay onClose={closeHelp} />}
      <ConfettiLayer />
    </MotionConfig>
  );
}
