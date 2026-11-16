import { useEffect, useRef } from 'react';
import type { Backend, DayResults } from '../lib/backend/types.ts';
import { PROMPTS_PER_DAY } from '../lib/daily.ts';
import { linkHandler } from '../lib/router.ts';
import { formatShortDate } from '../lib/ukDate.ts';
import { useGame } from '../lib/useGame.ts';
import { getPrompt } from '../prompts.ts';
import { AnswerInput } from '../components/AnswerInput.tsx';
import { Oddie } from '../components/Oddie.tsx';
import { PointsLadder } from '../components/PointsLadder.tsx';
import { worksheetNumber } from '../lib/launch.ts';
import { Scribble } from '../components/Marks.tsx';
import { ProgressBoxes } from '../components/ProgressBoxes.tsx';
import { ResultsView } from '../components/ResultsView.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { TimerLine } from '../components/TimerLine.tsx';
import { YesterdayCrowd } from '../components/YesterdayCrowd.tsx';

interface Props {
  backend: Backend;
  /** The game date. */
  date: string;
  navigate: (to: string) => void;
  onFinished?: (r: DayResults) => void;
  /** A past worksheet from the archive, marked against that day's finished crowd. */
  archive?: boolean;
}

export function PlayPage({ backend, date, navigate, onFinished, archive = false }: Props) {
  const game = useGame(backend, date, onFinished);
  const { phase, results } = game;
  // Did the player finish the paper just now (rather than reload the results)?
  const playedNow = useRef(false);
  if (phase.name === 'reveal') playedNow.current = true;

  // Each new question (and the results) starts at the top of the page.
  const screen = phase.name === 'prompt' ? `q${phase.position}` : phase.name === 'reveal' ? 'reveal' : phase.name;
  useEffect(() => {
    if (screen !== 'reveal') window.scrollTo(0, 0);
  }, [screen]);

  const live = (
    <div className="sr-only" aria-live="assertive" aria-atomic="true">
      {game.announcement}
    </div>
  );

  if (phase.name === 'loading') return <Scribble />;

  if (phase.name === 'error' || !results) {
    return (
      <div className="notice" role="alert">
        <span className="hand">Can't reach the staffroom.</span>
        <p>Your answers so far are saved. Check your connection and have another go.</p>
        <p style={{ marginTop: 16 }}>
          <button type="button" className="stamp stamp--small" onClick={() => void game.reload()}>
            Try again
          </button>
        </p>
      </div>
    );
  }

  if (phase.name === 'results') {
    return (
      <ResultsView results={results} backend={backend} navigate={navigate} fresh={playedNow.current} archive={archive} />
    );
  }

  if (phase.name === 'start') {
    const resuming = phase.position > 1;
    return (
      <section className="start" aria-labelledby="start-title">
        <div className="start__hero">
          <Oddie mood="hello" size={88} className="start__oddie" />
          <p className="start__kicker">
            {archive ? 'From the archive' : 'No.'} {archive ? `· ${formatShortDate(date)}` : `${worksheetNumber(date)} · ${formatShortDate(date)}`}
          </p>
          <h1 id="start-title">
            Say the number <span className="hl hl--swipe tier-fair start__nobody">nobody else</span> will.
          </h1>
        </div>
        <p className="pencil start__lede">
          7 questions, 40 seconds each. Any right answer scores, and the rarer it is, the more it's worth.
        </p>
        <PointsLadder />
        <div className="start__actions">
          <button type="button" className="stamp" onClick={game.start}>
            {resuming ? 'Carry on' : 'Start'}
          </button>
          {archive ? (
            <a className="btn-line" href="/archive" onClick={linkHandler(navigate, '/archive')}>
              Back to the archive
            </a>
          ) : (
            <a className="btn-line" href="/versus" onClick={linkHandler(navigate, '/versus')}>
              Play people live
            </a>
          )}
        </div>
        {resuming && (
          <p className="pencil start__resume">
            You left at question {phase.position - 1}. Picking up at question {phase.position} of{' '}
            {PROMPTS_PER_DAY}.
          </p>
        )}
        {!resuming && !archive && <YesterdayCrowd backend={backend} today={date} />}
      </section>
    );
  }

  const position = phase.name === 'prompt' ? phase.position : phase.data.position;
  const prompt = getPrompt(results.rows[position - 1]!.promptId);

  return (
    <section className="question" aria-labelledby="prompt-text">
      {live}
      <ProgressBoxes rows={results.rows} current={position} currentMarked={phase.name === 'reveal'} />
      <div className="question__body">
        <span className="margin-note" aria-hidden="true">
          Q{position}.
        </span>
        <h2 id="prompt-text" className="question__prompt">
          <span className="sr-only">Question {position}: </span>
          {prompt.text}
        </h2>

        {phase.name === 'prompt' ? (
          <>
            <TimerLine deadline={phase.deadline} stopped={phase.locked !== null} onExpire={game.expire} />
            <AnswerInput key={position} locked={phase.locked} onSubmit={game.submit} />
            {game.offline && (
              <p className="question__offline" role="alert">
                <span className="hand">Can't reach the staffroom.</span> Your answer is saved. Trying again.
              </p>
            )}
          </>
        ) : (
          <Reveal
            key={position}
            prompt={prompt}
            data={phase.data}
            isLast={position === PROMPTS_PER_DAY}
            onNext={() => void game.next()}
          />
        )}
      </div>
    </section>
  );
}
