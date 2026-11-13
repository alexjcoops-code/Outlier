import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatShare, TIERS } from '../lib/scoring.ts';
import type { RevealData } from '../lib/useGame.ts';
import { Circled, RedDash, RedTick, StarStamp } from './Marks.tsx';

interface Props {
  data: RevealData;
  isLast: boolean;
  onNext: () => void;
}

/** Auto-advance delay. Long enough to read the mark. */
const ADVANCE_MS = 3200;

export function basedOn(players: number, simulated: boolean): string {
  const who = `${players.toLocaleString('en-GB')} ${players === 1 ? 'player' : 'players'}`;
  return simulated ? `Based on ${who} + simulated answers` : `Based on ${who}`;
}

/** The teacher marks the answer: tier, points, how many said the same. */
export function Reveal({ data, isLast, onNext }: Props) {
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

      <div className="reveal__mark">
        {missed ? (
          <span className="hand reveal__scribble" style={{ fontSize: 34 }}>
            out of time
          </span>
        ) : (
          <span className={`reveal__tier hl hl--swipe tier-${data.tier}`}>{tier.name}</span>
        )}
        <motion.span {...fade(0.35)}>
          <Circled className="reveal__points" delay={0.45}>
            {missed ? '0' : `+${data.points}`}
          </Circled>
        </motion.span>
        {data.tier === 'lone' && <StarStamp />}
      </div>

      {!missed && (
        <motion.p className="pencil reveal__share" {...fade(0.5)}>
          {data.tier === 'lone'
            ? `Nobody else said ${data.value!.toLocaleString('en-GB')}`
            : `${formatShare(data.share!)} of players said ${data.value!.toLocaleString('en-GB')}`}
        </motion.p>
      )}

      {data.tier === 'lone' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -2 }} {...fade(0.7)}>
          well spotted!!
        </motion.p>
      )}
      {data.tier === 'clever' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -1.5 }} {...fade(0.7)}>
          everyone thinks of that
        </motion.p>
      )}
      {data.tier === 'outlier' && (
        <motion.p className="hand reveal__scribble" style={{ rotate: -1.5 }} {...fade(0.7)}>
          bold.
        </motion.p>
      )}

      {!missed && <p className="pencil reveal__basis">{basedOn(data.players, data.simulated)}</p>}

      <div className="reveal__next">
        <button ref={nextRef} type="button" className="stamp stamp--small" onClick={onNext}>
          {isLast ? 'See marks' : 'Next question'}
        </button>
        {!reduce && <span className="reveal__auto" style={{ animationDuration: `${ADVANCE_MS}ms` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
