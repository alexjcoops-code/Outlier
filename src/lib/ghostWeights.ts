// Every knob for the rule-based ghost players lives here.
//
// A ghost picks one valid answer at random, weighted by how likely a real
// person under time pressure is to think of it. Each rule below multiplies the
// weight of the answers it matches. 1 means "no effect". Tune these against the
// /admin page, which compares ghost and real answer distributions.

export const GHOST_WEIGHTS = {
  /**
   * Position among the valid answers. People start from the bottom of the list:
   * the k-th smallest valid answer gets weight 1 + strength ÷ (1 + k ÷ halfLife).
   */
  rank: { strength: 9, halfLife: 4 },

  /** Extra boost for the first few valid answers: the ones everybody blurts out. */
  firstFew: { count: 5, boost: 2.2 },

  /** Small numbers feel safe whatever the question. */
  small: { upTo12: 1.8, upTo20: 1.4, upTo100: 1.2 },

  /** Each digit beyond three makes a number less likely to be typed. */
  perExtraDigit: 0.7,

  /** Round-looking numbers. */
  endsIn0: 1.7,
  endsIn5: 1.4,

  /** Products from the 2–12 times tables, up to 144. */
  timesTable: 1.5,

  /** Numbers people know by name. */
  famous: { boost: 2.6, numbers: [7, 13, 37, 42, 69, 100, 101, 1729] },

  /** Anything on the prompt's own "Predictably Clever" list. */
  cleverList: 1.8,

  /** Plausible ages: your own, your mum's. */
  age: { min: 11, max: 60, boost: 1.25 },

  /** Plausible birth years. */
  birthYear: { min: 1950, max: 2012, boost: 2.4 },

  /** 111, 777, 4444 … */
  repeatedDigits: 2.2,
} as const;

export type GhostWeights = typeof GHOST_WEIGHTS;
