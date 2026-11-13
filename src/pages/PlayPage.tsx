import type { Backend, DayResults } from '../lib/backend/types.ts';
import { PROMPTS_PER_DAY } from '../lib/daily.ts';
import { linkHandler } from '../lib/router.ts';
import { useGame } from '../lib/useGame.ts';
import { getPrompt } from '../prompts.ts';
import { AnswerInput } from '../components/AnswerInput.tsx';
import { MarkScheme } from '../components/MarkScheme.tsx';
import { Scribble } from '../components/Marks.tsx';
import { ProgressBoxes } from '../components/ProgressBoxes.tsx';
import { ResultsView } from '../components/ResultsView.tsx';
import { Reveal } from '../components/Reveal.tsx';
import { TimerLine } from '../components/TimerLine.tsx';

interface Props {
  backend: Backend;
  /** The game date, or a round id in practice mode. */
  date: string;
  navigate: (to: string) => void;
  onFinished?: (r: DayResults) => void;
  /** Practice only: deal a fresh round. */
  onAgain?: () => void;
}

export function PlayPage({ backend, date, navigate, onFinished, onAgain }: Props) {
  const game = useGame(backend, date, onFinished);
  const { phase, results } = game;
  const practice = backend.kind === 'practice';

  const live = (
    <div className="sr-only" aria-live="assertive" role="status">
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
    return <ResultsView results={results} backend={backend} navigate={navigate} onAgain={onAgain} />;
  }

  if (phase.name === 'start') {
    const resuming = phase.position > 1;
    return (
      <section className="start" aria-labelledby="start-title">
        <p className="start__fields pencil mono" aria-hidden="true">
          Name <span className="start__blank" /> Class <span className="start__blank start__blank--short" />
        </p>
        <h1 id="start-title">
          {practice ? 'Practice worksheet' : "Today's worksheet"} <span className="start__dash">—</span>{' '}
          <span className="start__count">7 questions</span>
        </h1>
        <p className="pencil start__lede">
          Any right answer counts. Rare right answers count more. 25 seconds each.
        </p>
        <MarkScheme />
        <div className="start__actions">
          <button type="button" className="stamp" onClick={game.start}>
            {resuming ? 'Carry on' : 'Start'}
          </button>
          {practice ? (
            <a href="/" onClick={linkHandler(navigate, '/')}>
              Back to today's worksheet
            </a>
          ) : (
            <a href="/practice" onClick={linkHandler(navigate, '/practice')}>
              Practice instead
            </a>
          )}
        </div>
        {resuming && (
          <p className="pencil start__resume">
            You left at question {phase.position - 1}. Picking up at question {phase.position} of{' '}
            {PROMPTS_PER_DAY}.
          </p>
        )}
        {practice && <p className="pencil start__resume">Random questions, simulated marks, nothing saved.</p>}
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
            data={phase.data}
            isLast={position === PROMPTS_PER_DAY}
            onNext={() => void game.next()}
          />
        )}
      </div>
    </section>
  );
}
