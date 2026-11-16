// Oddie: the "o" from the logo, come to life. A bold ink ring for a body, two
// dot eyes, a mouth and stick arms. It blinks now and then and pulls a face to
// match how you did. Never shown while a question is on screen.

import type { TierId } from '../lib/scoring.ts';

export type Mood = 'hello' | 'meh' | 'happy' | 'wow' | 'sad';

/** How Oddie feels about each tier. */
export function moodFor(tier: TierId): Mood {
  if (tier === 'none') return 'sad';
  if (tier === 'obvious' || tier === 'clever') return 'meh';
  if (tier === 'outlier' || tier === 'lone') return 'wow';
  return 'happy';
}

const INK = 'var(--ink)';

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'happy') {
    // Smiling eyes: two little arches.
    return (
      <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M35 44 q4 -5 8 0" />
        <path d="M53 44 q4 -5 8 0" />
      </g>
    );
  }
  if (mood === 'wow') {
    // Star-struck: two small stars.
    const star = (cx: number) =>
      `M${cx} 37 L${cx + 2.4} 42 L${cx + 7.6} 42.4 L${cx + 3.6} 45.8 L${cx + 4.9} 51 L${cx} 48.1 L${cx - 4.9} 51 L${cx - 3.6} 45.8 L${cx - 7.6} 42.4 L${cx - 2.4} 42 Z`;
    return (
      <g fill="var(--gold)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round">
        <path d={star(39)} />
        <path d={star(57)} />
      </g>
    );
  }
  if (mood === 'meh') {
    // Half asleep: lids drawn across.
    return (
      <g stroke={INK} strokeWidth="3" strokeLinecap="round">
        <path d="M34 44 h9" />
        <path d="M53 44 h9" />
        <circle cx="39" cy="46.5" r="2.2" fill={INK} stroke="none" />
        <circle cx="57" cy="46.5" r="2.2" fill={INK} stroke="none" />
      </g>
    );
  }
  return (
    <g className="oddie__eyes" fill={INK}>
      <ellipse cx="39" cy="44" rx="3.4" ry="4.2" />
      <ellipse cx="57" cy="44" rx="3.4" ry="4.2" />
      <circle cx="40.2" cy="42.6" r="1.1" fill="#fff" />
      <circle cx="58.2" cy="42.6" r="1.1" fill="#fff" />
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const common = { fill: 'none', stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const };
  switch (mood) {
    case 'wow':
      return <ellipse cx="48" cy="58" rx="4.5" ry="5.5" fill="var(--redpen)" stroke={INK} strokeWidth="2.5" />;
    case 'happy':
      return <path d="M40 55 q8 9 16 0" {...common} />;
    case 'meh':
      return <path d="M42 58 h12" {...common} />;
    case 'sad':
      return <path d="M41 61 q7 -7 14 0" {...common} />;
    default:
      return <path d="M42 56 q6 6 12 0" {...common} />;
  }
}

function Arms({ mood }: { mood: Mood }) {
  const common = { fill: 'none', stroke: INK, strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (mood === 'wow') {
    // Both arms up.
    return (
      <>
        <path d="M17 44 L7 26" {...common} />
        <path d="M79 44 L89 26" {...common} />
      </>
    );
  }
  if (mood === 'sad' || mood === 'meh') {
    return (
      <>
        <path d="M17 56 L9 66" {...common} />
        <path d="M79 56 L87 66" {...common} />
      </>
    );
  }
  return (
    <>
      <path d="M17 56 L8 64" {...common} />
      {/* the waving arm */}
      <g className="oddie__wave">
        <path d="M79 48 L90 32" {...common} />
      </g>
    </>
  );
}

interface Props {
  mood?: Mood;
  size?: number;
  className?: string;
}

export function Oddie({ mood = 'hello', size = 72, className = '' }: Props) {
  return (
    <svg
      className={`oddie oddie--${mood} ${className}`}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <Arms mood={mood} />
      {/* legs */}
      <g fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round">
        <path d="M40 80 L37 91 h-5" />
        <path d="M56 80 L59 91 h5" />
      </g>
      {/* the body: a bold "o" */}
      <circle cx="48" cy="49" r="29" fill="var(--paper)" stroke={INK} strokeWidth="7" />
      {/* cheeks */}
      <ellipse cx="31" cy="54" rx="4.5" ry="3" fill="var(--tier-outlier)" opacity="0.55" />
      <ellipse cx="65" cy="54" rx="4.5" ry="3" fill="var(--tier-outlier)" opacity="0.55" />
      <Eyes mood={mood} />
      <Mouth mood={mood} />
      {mood === 'sad' && <path d="M71 30 q4 6 0 9 q-4 -3 0 -9 Z" fill="var(--tier-clever)" stroke={INK} strokeWidth="1.6" />}
    </svg>
  );
}
