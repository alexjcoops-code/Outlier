import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Prompt } from '../prompts.ts';
import { formatShare, TIERS } from '../lib/scoring.ts';
import type { RevealData } from '../lib/useGame.ts';
import { CrowdPlot } from './CrowdPlot.tsx';
import { Circled, RedDash, RedTick, StarStamp } from './Marks.tsx';

interface Props {
  prompt: Prompt;
  data: RevealData;
  isLast: boolean;
  onNext: () => void;
}

/** Auto-advance delay: long enough to watch the crowd land and read the mark. */
const ADVANCE_MS = 4800;

export function basedOn(players: number, simulated: boolean): string {
  const who = `${players.toLocaleString('en-GB')} ${players === 1 ? 'player' : 'players'}`;
  return simulated ? `Based on ${who} + simulated answers` : `Based on ${who}`;
}

/** The teacher marks the answer, and the crowd shows where you landed. */
export function Reveal({ prompt, data, isLast, onNext }: Props) {
  const reduce = useReducedMotion();
  const nextRef = useRef<HTMLButtonElement>(null);
  const tier = TIERS[data.tier];
  const missed = data.tier === 'none';

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
    // People who have asked for less motion also get to take their time.
    if (reduce) return;
    const id = setTimeout(onNext, ADVANCE_MS);
    return () => clearTimeout(id);
  }, [onNext, reduce]);

  const fade = (delay: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 4 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.25, delay: reduce ? 0 : delay },
  });

  return (
    <div className="reveal">
      <div className="reveal__answer">
        {missed ? (
          <RedDash />
        ) : (
          <>
            <span className="reveal__value">{data.value!.toLocaleString('en-GB')}</span>
            <RedTick />
          </>
        )}
      </div>

      <div className="reveal__crowd">
        <p className="reveal__crowd-title">{missed ? 'Where the crowd went' : 'Where you landed'}</p>
        {data.crowd ? (
          <CrowdPlot
            prompt={prompt}
            values={data.crowd.values}
            mine={data.value}
            animate
            caption={`Each dot is 1% of answers. ${basedOn(data.crowd.players, data.crowd.simulated)}.`}
          />
        ) : (
          <div className="reveal__crowd-wait" aria-hidden={data.crowd === undefined ? undefined : true}>
            {data.crowd === undefined ? 'Counting the class…' : "Can't reach the staffroom for the class answers."}
          </div>
        )}
      </div>

      <div className="reveal__mark">
        {missed ? (
          <span className="hand reveal__scribble" style={{ fontSize: 34 }}>
            out of time
          </span>
        ) : (
          <span className={`reveal__tier hl hl--swipe tier-${data.tier}`} style={{ animationDelay: reduce ? '0ms' : '1.3s' }}>
            {tier.name}
          </span>
        )}
        <motion.span {...fade(1.5)}>
          <Circled className="reveal__points" delay={reduce ? 0 : 1.6}>
            {missed ? '0' : `+${data.points}`}
          </Circled>
        </motion.span>
        {data.tier === 'lone' && <StarStamp />}
      </div>

      {!missed && (
        <motion.p className="pencil reveal__share" {...fade(1.6)}>
          {data.tier === 'lone'
            ? `Nobody else said ${data.value!.toLocaleString('en-GB')}`
            : `${formatShare(data.share!)} of answers were ${data.value!.toLocaleString('en-GB')}`}
        </motion.p>
      )}

      {data.tier === 'lone' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -2 }} {...fade(1.8)}>
          well spotted!!
        </motion.p>
      )}
      {data.tier === 'clever' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -1.5 }} {...fade(1.8)}>
          everyone thinks of that
        </motion.p>
      )}
      {data.tier === 'outlier' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -1.5 }} {...fade(1.8)}>
          bold.
        </motion.p>
      )}

      <div className="reveal__next">
        <button ref={nextRef} type="button" className="stamp stamp--small" onClick={onNext}>
          {isLast ? 'See marks' : 'Next question'}
        </button>
        {!reduce && <span className="reveal__auto" style={{ animationDuration: `${ADVANCE_MS}ms` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
