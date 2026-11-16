// Oddie: the "o" from the logo, come to life.
//
// A bold ink ring for a body, big shiny eyes, rosy cheeks, mitten hands, little
// shoes and a curl on top. It drops in with a squash, breathes, blinks, follows
// your pointer with its eyes, and acts out how you did. Tap it and it boings
// and says something. Never shown while a question is on screen.
//
// Movement uses Framer Motion; with reduced motion it just stands there.

import { animate, motion, useMotionValue, useReducedMotion, useSpring, type TargetAndTransition } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { TierId } from '../lib/scoring.ts';

export type Mood = 'hello' | 'meh' | 'happy' | 'wow' | 'sad';

/** How Oddie feels about each tier. */
export function moodFor(tier: TierId): Mood {
  if (tier === 'none') return 'sad';
  if (tier === 'obvious' || tier === 'clever') return 'meh';
  if (tier === 'outlier' || tier === 'lone') return 'wow';
  return 'happy';
}

const INK = '#1f2a44';
const PAPER = '#fbf8f0';
const BLUSH = '#ff8fa0';

/** Things Oddie says when you tap it. */
const LINES: Record<Mood, string[]> = {
  hello: ['Go weird.', 'Everyone says 7.', 'Be the odd one out!', "Don't be obvious.", 'Nobody says 683.', 'Rare is good!'],
  meh: ['Everyone said that.', 'Yawn.', 'Go odder!', 'Bit obvious…'],
  happy: ['Nice one!', 'Ooh, rare-ish!', 'Getting odd!', 'Yes!'],
  wow: ['NOBODY said that!', 'Legend.', 'So odd!', 'Wow wow wow'],
  sad: ['Next one!', "It's fine. It's fine.", 'Too slow!', 'Shake it off.'],
};

/** The body's loop for each mood, after it has landed. */
const IDLE: Record<Mood, TargetAndTransition> = {
  hello: {
    rotate: 0,
    y: [0, -2.5, 0],
    scaleY: [1, 1.03, 1],
    scaleX: [1, 0.985, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
  },
  happy: {
    scaleX: 1,
    scaleY: 1,
    rotate: [-4, 4, -4],
    y: [0, -3, 0, -3, 0],
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
  },
  wow: {
    rotate: 0,
    y: [0, -16, 0, 0, -10, 0, 0],
    scaleY: [1, 1.08, 0.86, 1, 1.05, 0.9, 1],
    scaleX: [1, 0.94, 1.12, 1, 0.96, 1.08, 1],
    transition: { duration: 1.5, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' },
  },
  meh: {
    y: 0,
    scaleX: 1,
    rotate: [0, -3, 0],
    scaleY: [1, 0.97, 1],
    transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
  },
  sad: {
    rotate: 0,
    scaleX: 1,
    scaleY: [0.96, 0.94, 0.96],
    y: [2, 3, 2],
    transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
  },
};

function Eyes({ mood, px, py }: { mood: Mood; px: ReturnType<typeof useSpring>; py: ReturnType<typeof useSpring> }) {
  if (mood === 'happy') {
    return (
      <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M42 60 q6 -8 12 0" />
        <path d="M66 60 q6 -8 12 0" />
      </g>
    );
  }
  if (mood === 'wow') {
    const star = (cx: number, cy: number, r: number) => {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
      }
      return pts.join(' ');
    };
    return (
      <g>
        {[48, 72].map((cx, i) => (
          <motion.polygon
            key={cx}
            points={star(cx, 58, 9)}
            fill="#ffc83d"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
            style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
            animate={{ rotate: [0, i ? -360 : 360], scale: [1, 1.15, 1] }}
            transition={{ rotate: { duration: 3, repeat: Infinity, ease: 'linear' }, scale: { duration: 0.8, repeat: Infinity } }}
          />
        ))}
      </g>
    );
  }
  // Open eyes: the pupils follow the pointer; meh and sad get heavy lids.
  const lid = mood === 'meh' ? 'M41 55 h14 M65 55 h14' : mood === 'sad' ? 'M41 53 l13 -5 M79 53 l-13 -5' : null;
  return (
    <g>
      <g className="oddie__blink">
        <motion.g style={{ x: px, y: py }}>
          <ellipse cx="48" cy="59" rx="6.5" ry={mood === 'meh' ? 4.5 : 8} fill={INK} />
          <ellipse cx="72" cy="59" rx="6.5" ry={mood === 'meh' ? 4.5 : 8} fill={INK} />
          <circle cx="50.4" cy={mood === 'meh' ? 57.6 : 55.8} r="2.4" fill="#fff" />
          <circle cx="74.4" cy={mood === 'meh' ? 57.6 : 55.8} r="2.4" fill="#fff" />
          <circle cx="46.2" cy={mood === 'meh' ? 60.6 : 62.4} r="1.1" fill="#fff" />
          <circle cx="70.2" cy={mood === 'meh' ? 60.6 : 62.4} r="1.1" fill="#fff" />
        </motion.g>
      </g>
      {lid && <path d={lid} stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'wow':
      return (
        <motion.g
          style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
          animate={{ scaleY: [1, 1.25, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        >
          <ellipse cx="60" cy="75" rx="7" ry="8" fill="#b3232f" stroke={INK} strokeWidth="3" />
          <ellipse cx="60" cy="79" rx="4" ry="2.6" fill="#ff8a95" />
        </motion.g>
      );
    case 'happy':
      return (
        <g>
          <path d="M49 70 q11 14 22 0 z" fill="#b3232f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M55 77 q5 3 10 0" fill="#ff8a95" />
        </g>
      );
    case 'meh':
      return <path d="M52 75 q8 -2 16 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    case 'sad':
      return <path d="M51 79 q9 -8 18 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
    default:
      return (
        <g>
          <path d="M51 71 q9 10 18 0" fill="#b3232f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
  }
}

/** A stick arm ending in a round mitten. */
function Arm({ d, hand }: { d: string; hand: [number, number] }) {
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx={hand[0]} cy={hand[1]} r="6" fill={INK} />
      <circle cx={hand[0] - 1.8} cy={hand[1] - 1.8} r="1.6" fill="#4a5677" />
    </g>
  );
}

function Arms({ mood }: { mood: Mood }) {
  const left = { transformBox: 'view-box' as const, originX: '27px', originY: '66px' };
  const right = { transformBox: 'view-box' as const, originX: '93px', originY: '66px' };
  if (mood === 'wow') {
    return (
      <>
        <motion.g style={left} animate={{ rotate: [0, -14, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>
          <Arm d="M27 62 L13 40" hand={[12, 37]} />
        </motion.g>
        <motion.g style={right} animate={{ rotate: [0, 14, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>
          <Arm d="M93 62 L107 40" hand={[108, 37]} />
        </motion.g>
      </>
    );
  }
  if (mood === 'sad' || mood === 'meh') {
    return (
      <>
        <Arm d="M27 70 L18 84" hand={[17, 86]} />
        <Arm d="M93 70 L102 84" hand={[103, 86]} />
      </>
    );
  }
  if (mood === 'happy') {
    return (
      <>
        <Arm d="M27 68 L14 62" hand={[11, 60]} />
        <Arm d="M93 68 L106 62" hand={[109, 60]} />
      </>
    );
  }
  // hello: one arm down, the other waving.
  return (
    <>
      <Arm d="M27 70 L16 82" hand={[14, 84]} />
      <motion.g
        style={right}
        initial={{ rotate: 0 }}
        animate={{ rotate: [0, -22, 18, -22, 18, -10, 0] }}
        transition={{ duration: 1.6, delay: 0.6, repeat: Infinity, repeatDelay: 4 }}
      >
        <Arm d="M93 62 L106 42" hand={[107, 39]} />
      </motion.g>
    </>
  );
}

interface Props {
  mood?: Mood;
  size?: number;
  className?: string;
}

export function Oddie({ mood = 'hello', size = 72, className = '' }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const body = useRef<SVGGElement>(null);
  const [line, setLine] = useState<string | null>(null);
  const [landed, setLanded] = useState(!!reduce);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Pupils follow the pointer, smoothly.
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const px = useSpring(tx, { stiffness: 220, damping: 18 });
  const py = useSpring(ty, { stiffness: 220, damping: 18 });
  useEffect(() => {
    if (reduce) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.45);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 160);
        tx.set((dx / d) * 2.6 * reach);
        ty.set((dy / d) * 2.6 * reach);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduce, tx, ty]);

  useEffect(() => () => clearTimeout(lineTimer.current), []);

  // After the drop-in, settle into the mood's loop.
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => setLanded(true), 650);
    return () => clearTimeout(id);
  }, [reduce]);

  /** A tap: a squashy boing and something to say. */
  const poke = () => {
    const options = LINES[mood];
    setLine((prev) => {
      let next = options[Math.floor(Math.random() * options.length)]!;
      if (next === prev && options.length > 1) next = options[(options.indexOf(next) + 1) % options.length]!;
      return next;
    });
    clearTimeout(lineTimer.current);
    lineTimer.current = setTimeout(() => setLine(null), 2200);
    if (!reduce && body.current) {
      void animate(
        body.current,
        { scaleY: [1, 0.78, 1.18, 0.95, 1], scaleX: [1, 1.18, 0.88, 1.04, 1], y: [0, 4, -14, 0, 0], rotate: [0, -6, 6, 0, 0] },
        { duration: 0.65, ease: 'easeOut' },
      );
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`oddie oddie--${mood} ${className}`}
      style={{ width: size, height: size }}
      onClick={poke}
      aria-label="Oddie"
    >
      {line && (
        <motion.span
          key={line}
          className="oddie__says"
          role="status"
          initial={reduce ? false : { opacity: 0, y: 6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        >
          {line}
        </motion.span>
      )}
      <svg viewBox="0 0 120 120" aria-hidden="true" overflow="visible">
        {/* the shadow on the ground: shrinks as Oddie leaves it */}
        <motion.ellipse
          cx="60"
          cy="113"
          rx="26"
          ry="4.5"
          fill="rgba(31,42,68,0.16)"
          initial={reduce ? false : { scaleX: 0.3, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          style={{ transformBox: 'fill-box', originX: 0.5, originY: 0.5 }}
        />
        {/* drop in, squash on landing, then the mood's loop */}
        <motion.g
          initial={reduce ? false : { y: -46, scaleY: 1.12, scaleX: 0.9 }}
          animate={
            landed
              ? reduce
                ? {}
                : IDLE[mood]
              : { y: [-46, 0, 0, 0], scaleY: [1.12, 0.82, 1.06, 1], scaleX: [0.9, 1.16, 0.97, 1] }
          }
          transition={landed ? undefined : { duration: 0.6, times: [0, 0.45, 0.7, 1], ease: 'easeOut' }}
          style={{ transformBox: 'view-box', originX: '60px', originY: '112px' }}
        >
          <g ref={body} style={{ transformBox: 'view-box', transformOrigin: '60px 112px' }}>
            {/* shoes */}
            <path d="M50 96 v8" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <path d="M70 96 v8" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="46" cy="107" rx="10" ry="5.5" fill={INK} />
            <ellipse cx="74" cy="107" rx="10" ry="5.5" fill={INK} />
            <ellipse cx="43" cy="105" rx="3.5" ry="1.6" fill="#4a5677" />
            <ellipse cx="71" cy="105" rx="3.5" ry="1.6" fill="#4a5677" />
            <Arms mood={mood} />
            {/* the body: a bold "o" */}
            <circle cx="60" cy="62" r="35" fill={PAPER} stroke={INK} strokeWidth="10" />
            {/* a shine on the ring */}
            <path d="M33 47 a31 31 0 0 1 16 -15" fill="none" stroke="#4a5677" strokeWidth="3.5" strokeLinecap="round" />
            {/* the curl on top */}
            <path d="M59 25 c-4 -10 10 -16 12 -7 c1.4 5 -6 7 -6.5 2" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
            {/* cheeks */}
            <ellipse cx="38" cy="70" rx="6" ry="3.6" fill={BLUSH} opacity="0.6" />
            <ellipse cx="82" cy="70" rx="6" ry="3.6" fill={BLUSH} opacity="0.6" />
            <Eyes mood={mood} px={px} py={py} />
            <Mouth mood={mood} />
            {mood === 'sad' && (
              <motion.path
                d="M88 44 q5 8 0 11 q-5 -3 0 -11 z"
                fill="#9fd0f5"
                stroke={INK}
                strokeWidth="2"
                animate={reduce ? {} : { y: [0, 10], opacity: [1, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.8, ease: 'easeIn' }}
              />
            )}
          </g>
        </motion.g>
      </svg>
    </button>
  );
}
