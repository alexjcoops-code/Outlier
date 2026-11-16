import { MOTION } from '../lib/motion.ts';
import { CONFETTI_COLOURS, TIER_HEX, formatAnswer } from '../lib/format.ts';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { burst, buzz, FANFARE, shakePage } from '../lib/celebrate.ts';
import type { Prompt } from '../prompts.ts';
import { formatShare, TIERS } from '../lib/scoring.ts';
import type { RevealData } from '../lib/useGame.ts';
import { CountUp } from './CountUp.tsx';
import { CrowdPlot } from './CrowdPlot.tsx';
import { InkStamp } from './InkStamp.tsx';
import { Circled, Emphasis, RedDash, RedTick } from './Marks.tsx';

interface Props {
  prompt: Prompt;
  data: RevealData;
  isLast: boolean;
  onNext: () => void;
}

/** Auto-advance delay: long enough to watch the crowd land and read the mark. */
const ADVANCE_MS = MOTION.advanceMs;
/** When the mark lands, just after the red ball. */
const MARK_AT = MOTION.markAt;

const TIER_INK = TIER_HEX;

/** "1 player + simulated answers." for under the rack: the short form of basedOn(). */
function crowdNote(players: number, simulated: boolean): string {
  const who = `${players.toLocaleString('en-GB')} ${players === 1 ? 'player' : 'players'}`;
  return simulated ? `${who} + simulated answers.` : `${who}.`;
}

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
  const fan = FANFARE[data.tier];
  const markRef = useRef<HTMLSpanElement>(null);

  // The fuss, timed with the mark: confetti from the tier, a page shake, a buzz.
  useEffect(() => {
    if (reduce || (!fan.chads && !fan.shake && !fan.vibrate)) return;
    const id = setTimeout(() => {
      const rect = markRef.current?.getBoundingClientRect();
      if (rect && fan.chads + fan.stars > 0) {
        burst({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          chads: fan.chads,
          stars: fan.stars,
          colour: TIER_INK[data.tier] ?? '#ffe97a',
          palette: fan.coloured ? CONFETTI_COLOURS : undefined,
          shower: fan.coloured ? 70 : 0,
        });
      }
      shakePage(fan.shake);
      buzz(fan.vibrate);
    }, MARK_AT * 1000 + 80);
    return () => clearTimeout(id);
  }, [reduce, fan, data.tier]);

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

  // Everything has to fit on a phone screen without scrolling: shorter rack on short screens.
  const rackHeight = typeof window === 'undefined' ? 240 : window.innerHeight < 620 ? 150 : window.innerHeight < 760 ? 180 : 240;

  return (
    <div className="reveal">
      <div className="reveal__answer">
        {missed ? (
          <RedDash />
        ) : (
          <>
            <span className="reveal__value">{formatAnswer(data.value!)}</span>
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
          <span
            ref={markRef}
            className={`reveal__tier hl hl--swipe tier-${data.tier} ${fan.shake > 0 ? 'reveal__tier--loud' : ''}`}
            style={{ animationDelay: reduce ? '0ms' : `${MARK_AT}s` }}
          >
            {tier.name}
          </span>
        )}
        <motion.span className="reveal__score" data-points={data.points} {...fade(MARK_AT + 0.2)}>
          <Circled className="reveal__points" delay={reduce ? 0 : MARK_AT + 0.3}>
            {missed ? '0' : fan.countUp ? <CountUp to={data.points} prefix="+" delay={MARK_AT + 0.2} /> : `+${data.points}`}
          </Circled>
          {fan.emphasis && !missed && <Emphasis delay={reduce ? 0 : MARK_AT + 0.55} className="reveal__emphasis" />}
          {/* the teacher's ticks, scribbled on the corner of the circle */}
          {fan.ticks > 0 && (
            <span className="reveal__ticks" aria-hidden="true">
              {Array.from({ length: fan.ticks }, (_, i) => (
                <RedTick key={i} size={24} delay={reduce ? 0 : MARK_AT + 0.75 + i * 0.18} />
              ))}
            </span>
          )}
        </motion.span>
      </div>

      {!missed && (
        <motion.p className="pencil reveal__share" {...fade(MARK_AT + 0.4)}>
          {data.tier === 'lone'
            ? `Nobody else said ${formatAnswer(data.value!)}`
            : `${formatShare(data.share!)} of answers were ${formatAnswer(data.value!)}`}
          {data.tier === 'clever' && <span className="hand reveal__aside"> everyone thinks of that</span>}
        </motion.p>
      )}

      {/* The stamp lands beside the result it's about, never over the rack. */}
      {fan.stamp && !missed && (
        <InkStamp
          text={fan.stamp.text}
          ink={fan.stamp.ink}
          delay={MARK_AT + 0.15}
          scale={data.tier === 'lone' ? 1.05 : 0.9}
          className="reveal__stamp"
        />
      )}

      <div className="reveal__crowd">
        <p className="reveal__crowd-title">{missed ? 'Where the crowd went' : 'Where you landed'}</p>
        {data.crowd ? (
          <CrowdPlot
            prompt={prompt}
            values={data.crowd.values}
            mine={data.value}
            animate
            height={rackHeight}
            lone={data.tier === 'lone'}
            shockwave={fan.shockwave}
            caption={crowdNote(data.crowd.players, data.crowd.simulated)}
          />
        ) : (
          <div className="reveal__crowd-wait" style={{ height: rackHeight }}>
            {data.crowd === undefined ? 'Counting the class…' : "Can't reach the staffroom for the class answers."}
          </div>
        )}
      </div>

      <div className="reveal__next">
        <button ref={nextRef} type="button" className="stamp stamp--small" onClick={onNext}>
          {isLast ? 'See marks' : 'Next question'}
        </button>
        {!reduce && <span className="reveal__auto" style={{ animationDuration: `${ADVANCE_MS}ms` }} aria-hidden="true" />}
      </div>
    </div>
  );
}
