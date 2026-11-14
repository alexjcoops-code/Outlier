// Motion timings for script-driven animation. The CSS equivalents are the --t-*
// variables in tokens.css; the rules behind them are in docs/art-direction.md.

export const MOTION = {
  /** Small confirmations: a key, a hand-in, a tick box. */
  confirmMs: 120,
  /** The wrong-answer shake. */
  shakeMs: 200,
  /** Page and panel changes. */
  panelMs: 240,
  /** When the mark lands on a reveal, just after your ball settles (seconds). */
  markAt: 2.3,
  /** A reveal moves on by itself after this long, unless you press Next first. */
  advanceMs: 6200,
} as const;
