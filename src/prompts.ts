// The prompt bank: 100 question types ("families"), ten questions each.
//
// Questions in a family share an idea ("a prime with a twist", "a time on a
// 24-hour clock") but have different right answers, so a good answer from last
// week is no use today: you have to do the maths again. The daily picker (see
// lib/daily.ts) never uses the same family twice within FAMILY_GAP_DAYS.
//
// Every question has many right answers; the game is picking a rare one.
//
// This file is shared with the Edge Functions (see scripts/sync-shared.mjs), so it
// must stay dependency-free and use explicit .ts import paths.

import {
  additivePersistence,
  binaryOnes,
  collatzSteps,
  countFactors,
  digitProduct,
  digitSquareSum,
  digitSum,
  digitsOf,
  digitsStrictlyAscending,
  fewestCoins,
  gcd,
  goldbachWays,
  isAbundant,
  isCube,
  isHappy,
  isHarshad,
  isLeapYear,
  isPalindrome,
  isPalindromeInBase,
  isPrime,
  isProductOfDistinctPrimes,
  isSquare,
  isSquareFree,
  isSumOfTwoCubes,
  isSumOfTwoSquares,
  isTriangular,
  largestPrimeFactor,
  letterCount,
  multiplicativePersistence,
  nextPrime,
  numberName,
  primeFactors,
  reachable,
  reverseDigits,
  romanNumeral,
  smallestPrimeFactor,
  sumFactors,
  sumProperFactors,
  weekday,
} from './lib/maths.ts';

export type Difficulty = 1 | 2 | 3;

export interface Prompt {
  id: string;
  /** The question type. Two prompts of one family never appear within a few days of each other. */
  family: string;
  /** Shown to the player. Proper notation only: n², ×, ÷, ≤ — never ^ or *. */
  text: string;
  difficulty: Difficulty;
  /** Smallest and largest number worth checking; anything outside is invalid. */
  min: number;
  max: number;
  /** The mathematical property. Use isValidAnswer() to include the range check. */
  validator: (n: number) => boolean;
  /** "Predictably Clever": valid answers that feel clever but everyone thinks of. */
  cleverList: number[];
  /** For sparse answers over a huge range: the candidates, so validAnswers needn't scan. */
  candidates?: () => number[];
}

export interface Family {
  id: string;
  name: string;
  prompts: Prompt[];
}

/** Numbers people reach for when they want to look clever, whatever the question. */
export const FAMOUS_NUMBERS: readonly number[] = [
  7, 13, 37, 42, 69, 100, 101, 111, 420, 666, 777, 999, 1000, 1001, 1024, 1089, 1729, 2024, 2025,
  2026, 6174, 8128,
];

export function isValidAnswer(prompt: Prompt, n: number): boolean {
  return Number.isSafeInteger(n) && n >= prompt.min && n <= prompt.max && prompt.validator(n);
}

const validCache = new Map<string, number[]>();

/** Every valid answer for a prompt, ascending. Cached; computed on first use. */
export function validAnswers(prompt: Prompt): number[] {
  let list = validCache.get(prompt.id);
  if (!list) {
    if (prompt.candidates) {
      list = [...new Set(prompt.candidates())].filter((n) => isValidAnswer(prompt, n)).sort((a, b) => a - b);
    } else {
      list = [];
      for (let n = prompt.min; n <= prompt.max; n++) if (prompt.validator(n)) list.push(n);
    }
    validCache.set(prompt.id, list);
  }
  return list;
}

// ───────────────────────────── Building blocks ─────────────────────────────

/** 1234 → "1,234"; small numbers unchanged. */
function f(n: number): string {
  return Math.abs(n) >= 1000 ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(n);
}

/** "under 200" when the range starts at 1 (or 0), otherwise "between 150 and 250". */
function span(lo: number, hi: number): string {
  return lo <= 1 ? `under ${f(hi + 1)}` : `between ${f(lo)} and ${f(hi)}`;
}

/** "2n + 1" / "2n − 1" */
function lin(a: number, b: number, v = 'n'): string {
  const head = a === 1 ? v : `${a}${v}`;
  return b === 0 ? head : `${head} ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
}

/** "1, 2, 3 and 4" */
function list(xs: readonly (number | string)[]): string {
  const s = xs.map((x) => (typeof x === 'number' ? f(x) : x));
  return s.length < 2 ? s.join('') : `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Variant {
  d: number;
  text: string;
  min: number;
  max: number;
  ok: (n: number) => boolean;
  /** Extra "predictably clever" answers on top of the famous numbers. */
  clever?: number[];
  candidates?: () => number[];
}

const v = (
  d: number,
  text: string,
  min: number,
  max: number,
  ok: (n: number) => boolean,
  clever?: number[],
  candidates?: () => number[],
): Variant => ({ d, text, min, max, ok, clever, candidates });

/**
 * The clever list: famous numbers and hand-picked extras that are valid, plus the
 * biggest answer when there are plenty (going for the top is the obvious "clever" move).
 * Worked out on first use so loading the bank stays cheap.
 */
function cleverFor(prompt: Prompt, extras: readonly number[]): number[] {
  const out = new Set<number>();
  for (const n of [...FAMOUS_NUMBERS, ...extras]) if (isValidAnswer(prompt, n)) out.add(n);
  const all = validAnswers(prompt);
  if (all.length >= 12) out.add(all[all.length - 1]!);
  return [...out].sort((a, b) => a - b);
}

const FAMILY_LIST: Family[] = [];

type Tier = 'easy' | 'medium' | 'hard';

/**
 * How a family's ten questions spread over the three difficulty slots. Each day
 * needs three easy, three medium and one hard question, so the bank as a whole
 * leans easy-and-medium. Within a family the `d` written on each row only ranks
 * the questions; the tier decides which ones land in which slot.
 */
const TIER_PATTERN: Record<Tier, readonly Difficulty[]> = {
  easy: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3],
  medium: [1, 1, 2, 2, 2, 2, 2, 2, 3, 3],
  hard: [2, 2, 2, 2, 3, 3, 3, 3, 3, 3],
};

function family<R>(id: string, name: string, tier: Tier, rows: readonly R[], make: (row: R) => Variant): void {
  const made = rows.map(make);
  // Rank by the row's own difficulty, keeping the written order for ties.
  const ranked = made.map((_, i) => i).sort((a, b) => made[a]!.d - made[b]!.d || a - b);
  const difficulty = new Array<Difficulty>(made.length);
  const pattern = TIER_PATTERN[tier];
  ranked.forEach((index, rank) => {
    difficulty[index] = pattern[Math.floor((rank * pattern.length) / made.length)]!;
  });
  const prompts = made.map((x, i): Prompt => {
    const prompt = {
      id: `${id}-${String(i + 1).padStart(2, '0')}`,
      family: id,
      text: x.text,
      difficulty: difficulty[i]!,
      min: x.min,
      max: x.max,
      validator: x.ok,
      candidates: x.candidates,
    } as Prompt;
    let clever: number[] | null = null;
    Object.defineProperty(prompt, 'cleverList', {
      enumerable: true,
      get: () => (clever ??= cleverFor(prompt, x.clever ?? [])),
    });
    return prompt;
  });
  FAMILY_LIST.push({ id, name, prompts });
}

/** Memoise a set-valued computation so a validator can use it cheaply. */
function lazySet(build: () => Iterable<number>): (n: number) => boolean {
  let set: Set<number> | null = null;
  return (n) => (set ??= new Set(build())).has(n);
}

/** Every term of a sequence below `max`, given a step function. */
function termsBelow(start: number[], next: (terms: number[]) => number, max: number): number[] {
  const terms = [...start];
  for (;;) {
    const t = next(terms);
    if (t > max || terms.length > 10_000) break;
    terms.push(t);
  }
  return terms.filter((t) => t <= max);
}

function primesBelow(n: number): number[] {
  const out: number[] = [];
  for (let i = 2; i < n; i++) if (isPrime(i)) out.push(i);
  return out;
}

/** a × r^k for k ≥ 0, up to max. */
function geometric(a: number, r: number, max: number): number[] {
  const out: number[] = [];
  for (let t = a; t <= max; t *= r) out.push(t);
  return out;
}

const isTime = (n: number) => {
  const h = Math.floor(n / 100);
  const m = n % 100;
  return h >= 10 && h <= 23 && m <= 59;
};
const minutesOf = (n: number) => Math.floor(n / 100) * 60 + (n % 100);
const multipleOf = (k: number) => (n: number) => n % k === 0;
const sameDigits = (digits: readonly number[]) => {
  const want = [...digits].sort().join('');
  return (n: number) => String(n).split('').sort().join('') === want;
};

// ───────────────────────────────── Primes ─────────────────────────────────

family('prime-between', 'Primes in a range', 'easy', [
  [1, 1, 49], [1, 50, 99], [1, 100, 149], [2, 150, 249], [2, 250, 399],
  [2, 400, 549], [2, 550, 699], [3, 700, 849], [3, 850, 999], [3, 1000, 1149],
] as const, ([d, lo, hi]) => v(d, `Name a prime ${span(lo, hi)}`, lo, hi, isPrime, [2, 3, 5, 11, 17, 97, 997]));

family('prime-ending', 'Primes by last digit', 'easy', [
  [1, 1, 1, 299], [1, 3, 1, 199], [1, 7, 1, 199], [1, 9, 1, 199], [2, 1, 300, 599],
  [2, 3, 200, 499], [2, 7, 200, 499], [2, 9, 200, 499], [2, 3, 500, 899], [2, 7, 500, 899],
] as const, ([d, end, lo, hi]) =>
  v(d, `Name a prime ${span(lo, hi)} that ends in ${end}`, lo, hi, (n) => n % 10 === end && isPrime(n)));

family('prime-digit-sum', 'Primes by digit sum', 'medium', [
  [2, 7], [2, 8], [2, 10], [2, 11], [2, 13], [3, 14], [3, 16], [3, 17], [3, 19], [3, 20],
] as const, ([d, s]) =>
  v(d, `Name a prime under 1,000 whose digits add up to ${s}`, 2, 999, (n) => digitSum(n) === s && isPrime(n)));

family('prime-remainder', 'Primes with a remainder', 'medium', [
  [2, 4, 1, 1, 99], [2, 4, 3, 100, 199], [2, 6, 5, 200, 299], [2, 6, 1, 300, 449], [2, 5, 1, 450, 649],
  [3, 5, 4, 650, 849], [3, 7, 3, 1, 199], [3, 8, 7, 200, 399], [3, 9, 4, 400, 999], [3, 12, 7, 600, 999],
] as const, ([d, m, r, lo, hi]) =>
  v(d, `Name a prime ${span(lo, hi)} that leaves remainder ${r} when divided by ${m}`, lo, hi, (n) => n % m === r && isPrime(n)));

family('prime-pairs', 'Prime pairs', 'medium', [
  [2, 2, 1, 149], [2, 4, 150, 399], [2, 6, 400, 599], [3, 8, 600, 949], [3, 10, 950, 1199],
  [2, 6, 1, 149], [2, 4, 1, 149], [3, 12, 150, 399], [3, 14, 1200, 1499], [3, 18, 1, 199],
] as const, ([d, k, lo, hi]) =>
  v(d, `Name a prime p ${span(lo, hi)} where p + ${k} is also prime`, lo, hi, (n) => isPrime(n) && isPrime(n + k)));

family('prime-linked', 'Primes that make primes', 'hard', [
  [2, 2, 1, 1, 199], [2, 4, 1, 1, 199], [2, 6, -1, 1, 199], [3, 2, -1, 200, 499], [3, 4, -1, 200, 599],
  [3, 3, 2, 500, 799], [3, 3, -2, 500, 799], [3, 6, 1, 800, 1099], [3, 2, 3, 800, 1099], [3, 10, 1, 1100, 1499],
] as const, ([d, a, b, lo, hi]) =>
  v(d, `Name a prime p ${span(lo, hi)} where ${lin(a, b, 'p')} is also prime`, lo, hi, (n) => isPrime(n) && isPrime(a * n + b)));

family('prime-reversed', 'Primes back to front', 'medium', [
  [2, 'emirp', 1, 199], [3, 'emirp', 300, 999], [2, 'bigger', 1, 99], [2, 'smaller', 100, 499], [3, 'square', 1, 9999],
  [3, 'seven', 1, 999], [2, 'even', 600, 999], [2, 'five', 1, 999], [2, 'same', 10, 999], [3, 'emirp', 1000, 1999],
] as const, ([d, kind, lo, hi]) => {
  const r = reverseDigits;
  const rules = {
    emirp: ['whose digits reversed make a different prime', (n: number) => r(n) !== n && isPrime(r(n))],
    bigger: ['that gets bigger when you reverse its digits', (n: number) => r(n) > n],
    smaller: ['that gets smaller when you reverse its digits', (n: number) => r(n) < n],
    square: ['whose digits reversed make a square number', (n: number) => n % 10 !== 0 && isSquare(r(n))],
    seven: ['whose digits reversed make a multiple of 7', (n: number) => r(n) % 7 === 0],
    even: ['whose digits reversed make an even number', (n: number) => r(n) % 2 === 0],
    five: ['whose digits reversed make a multiple of 5', (n: number) => r(n) % 5 === 0],
    same: ['that reads the same backwards', (n: number) => r(n) === n],
  } as const;
  const [words, test] = rules[kind];
  return v(d, `Name a prime ${span(lo, hi)} ${words}`, lo, hi, (n) => isPrime(n) && test(n));
});

family('prime-near-square', 'Primes next to squares', 'medium', [
  [2, 1, 1999], [3, 2, 4999], [2, 4, 999], [2, -2, 999], [3, 6, 9999],
  [3, -6, 9999], [3, 10, 4999], [3, -8, 1999], [3, 12, 4999], [3, -12, 2999],
] as const, ([d, k, hi]) =>
  v(
    d,
    `Name a prime under ${f(hi + 1)} that is ${Math.abs(k)} ${k > 0 ? 'more' : 'less'} than a square number`,
    2,
    hi,
    (n) => isPrime(n) && n - k >= 1 && isSquare(n - k),
  ));

family('prime-times', 'Multiples of a prime', 'medium', [
  [1, 2, 1, 99], [2, 3, 100, 299], [2, 5, 1, 499], [2, 4, 100, 399], [2, 6, 300, 599],
  [2, 7, 100, 699], [2, 10, 1, 999], [3, 11, 1, 999], [3, 9, 1, 499], [3, 13, 1000, 1999],
] as const, ([d, k, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} that is ${k} times a prime`, lo, hi, (n) => n % k === 0 && isPrime(n / k)));

family('largest-factor', 'Largest prime factor', 'medium', [
  [2, 3, 1, 199], [2, 5, 1, 199], [2, 7, 200, 499], [2, 11, 1, 499], [2, 13, 1, 499],
  [3, 17, 1, 999], [3, 19, 1, 999], [3, 23, 1, 999], [3, 29, 1, 999], [3, 31, 1000, 2999],
] as const, ([d, p, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} whose largest prime factor is ${p}`, lo, hi, (n) => n > 1 && largestPrimeFactor(n) === p));

family('smallest-factor', 'Smallest prime factor', 'medium', [
  [2, 3, 1, 99], [2, 5, 100, 299], [2, 7, 1, 499], [3, 11, 1, 999], [3, 13, 1, 1999],
  [3, 17, 1, 2999], [3, 19, 1, 3999], [2, 3, 500, 599], [2, 5, 600, 999], [2, 7, 1000, 1499],
] as const, ([d, p, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} whose smallest prime factor is ${p}`, lo, hi, (n) => n > 1 && smallestPrimeFactor(n) === p));

family('semiprimes', 'Products of primes', 'medium', [
  [2, 'two', 1, 49], [2, 'two', 100, 149], [3, 'two-big', 1, 999], [3, 'twins', 1, 5999], [2, 'two-odd', 1, 99],
  [3, 'three', 1, 299], [3, 'three', 300, 599], [3, 'four', 1, 1999], [2, 'two', 500, 549], [3, 'square-prime', 1, 199],
] as const, ([d, kind, lo, hi]) => {
  const rules = {
    two: ['that is the product of two different primes', (n: number) => isProductOfDistinctPrimes(n, 2)],
    'two-big': ['that is the product of two different primes, both bigger than 10', (n: number) => isProductOfDistinctPrimes(n, 2) && smallestPrimeFactor(n) > 10],
    twins: ['that is the product of two primes that differ by 2 (like 3 × 5)', (n: number) => {
      const fs = primeFactors(n);
      return fs.length === 2 && fs[1]! - fs[0]! === 2;
    }],
    'two-odd': ['that is the product of two different odd primes', (n: number) => n % 2 === 1 && isProductOfDistinctPrimes(n, 2)],
    three: ['that is the product of three different primes', (n: number) => isProductOfDistinctPrimes(n, 3)],
    four: ['that is the product of four different primes', (n: number) => isProductOfDistinctPrimes(n, 4)],
    'square-prime': ['that is a prime squared times a different prime (like 2² × 3)', (n: number) => {
      const fs = primeFactors(n);
      return fs.length === 3 && new Set(fs).size === 2;
    }],
  } as const;
  const [words, test] = rules[kind];
  return v(d, `Name a number ${span(lo, hi)} ${words}`, lo, hi, test);
});

family('goldbach', 'Sums of two primes', 'hard', [
  [2, 2, 99], [2, 3, 129], [3, 4, 159], [3, 5, 199], [3, 6, 399],
  [3, 7, 399], [3, 8, 399], [3, 9, 499], [3, 10, 699], [3, 11, 699],
] as const, ([d, k, hi]) =>
  v(
    d,
    `Name an even number under ${f(hi + 1)} that splits into two primes in exactly ${k} ways (order doesn’t matter)`,
    4,
    hi,
    (n) => n % 2 === 0 && goldbachWays(n) === k,
  ));

const consecutivePrimeSums = (k: number, max: number) =>
  lazySet(() => {
    const ps = primesBelow(max);
    const out: number[] = [];
    for (let i = 0; i + k <= ps.length; i++) out.push(ps.slice(i, i + k).reduce((a, b) => a + b, 0));
    return out;
  });

family('prime-runs', 'Runs of primes', 'hard', [
  [2, 2, 1, 199], [2, 3, 1, 299], [3, 4, 1, 499], [3, 5, 1, 699], [3, 6, 1, 999],
  [3, 2, 400, 999], [3, 3, 500, 1199], [3, 7, 1, 1499], [3, 10, 1, 1999], [3, 4, 1000, 1999],
] as const, ([d, k, lo, hi]) =>
  v(
    d,
    `Name a number ${span(lo, hi)} that is the sum of ${k} primes in a row (2, 3, 5, 7, 11, …)`,
    lo,
    hi,
    consecutivePrimeSums(k, hi + 1),
  ));

family('prime-gaps', 'Gaps between primes', 'hard', [
  [2, 2, 1, 199], [2, 4, 1, 299], [2, 6, 1, 499], [3, 8, 1, 1499], [3, 10, 1, 1999],
  [3, 12, 1, 2999], [3, 14, 1, 4999], [3, 2, 200, 999], [3, 4, 300, 999], [3, 6, 500, 999],
] as const, ([d, g, lo, hi]) =>
  v(d, `Name a prime p ${span(lo, hi)} where the next prime is p + ${g}`, lo, hi, (n) => isPrime(n) && nextPrime(n) === n + g));

family('reverse-sums', 'Adding the reverse', 'easy', [
  [1, 99], [1, 110], [1, 121], [2, 909], [2, 1010],
  [2, 1110], [3, 1171], [3, 1211], [3, 1291], [3, 1089],
] as const, ([d, total]) =>
  v(
    d,
    `Name a number, not ending in 0, that makes ${f(total)} when added to its own reverse (like 23 + 32 = 55)`,
    10,
    999,
    (n) => n % 10 !== 0 && n + reverseDigits(n) === total,
  ));

// ─────────────────────────── Multiples and factors ───────────────────────────

family('multiples', 'Multiples in a range', 'easy', [
  [1, 6, 1, 99], [1, 8, 100, 249], [1, 9, 250, 399], [1, 11, 400, 599], [1, 12, 600, 799],
  [2, 13, 100, 299], [2, 17, 300, 599], [2, 19, 600, 899], [2, 23, 1, 399], [1, 15, 1000, 1299],
] as const, ([d, k, lo, hi]) => v(d, `Name a multiple of ${k} ${span(lo, hi)}`, lo, hi, multipleOf(k)));

family('common-multiples', 'Common multiples', 'easy', [
  [1, 4, 6, 1, 149], [1, 6, 8, 150, 399], [2, 6, 9, 400, 599], [2, 9, 12, 1, 499], [2, 6, 10, 600, 899],
  [2, 8, 10, 100, 499], [2, 9, 15, 500, 999], [2, 8, 14, 1, 599], [2, 12, 15, 1000, 1499], [2, 7, 11, 1, 999],
] as const, ([d, a, b, lo, hi]) => {
  const l = (a * b) / gcd(a, b);
  return v(d, `Name a number ${span(lo, hi)} that is a multiple of both ${a} and ${b}`, lo, hi, multipleOf(l));
});

family('multiple-but-not', 'Multiples with a catch', 'easy', [
  [1, 5, 2, 1, 99], [2, 6, 4, 1, 199], [2, 4, 8, 200, 399], [2, 9, 6, 1, 299], [2, 10, 4, 400, 699],
  [2, 12, 8, 300, 699], [1, 7, 2, 100, 299], [2, 15, 10, 700, 999], [2, 8, 3, 1, 299], [2, 14, 4, 1, 499],
] as const, ([d, a, b, lo, hi]) =>
  v(d, `Name a multiple of ${a} ${span(lo, hi)} that is not a multiple of ${b}`, lo, hi, (n) => n % a === 0 && n % b !== 0));

family('remainders', 'Remainders', 'easy', [
  [1, 5, 2, 1, 99], [1, 8, 3, 100, 199], [1, 6, 5, 200, 299], [2, 9, 4, 300, 499], [2, 11, 7, 1, 299],
  [2, 12, 1, 500, 799], [2, 7, 6, 800, 999], [2, 13, 5, 1, 399], [2, 15, 8, 1000, 1299], [2, 4, 3, 1300, 1399],
] as const, ([d, m, r, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} that leaves remainder ${r} when divided by ${m}`, lo, hi, (n) => n % m === r));

family('double-remainders', 'Two remainders at once', 'medium', [
  [2, [[3, 1], [5, 2]], 199], [2, [[4, 3], [5, 1]], 299], [2, [[2, 1], [7, 3]], 199], [2, [[3, 2], [4, 1]], 149],
  [3, [[5, 4], [6, 5]], 399], [3, [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1]], 999], [3, [[7, 2], [9, 5]], 999],
  [3, [[3, 2], [5, 3], [7, 2]], 999], [3, [[4, 1], [9, 2]], 999], [3, [[6, 5], [8, 7]], 499],
] as const, ([d, rules, hi]) => {
  const same = rules.every(([, r]) => r === rules[0]![1]);
  const text = same
    ? `Name a number under ${f(hi + 1)} that leaves remainder ${rules[0]![1]} when divided by each of ${list(rules.map(([m]) => m))}`
    : `Name a number under ${f(hi + 1)} that leaves remainder ${list(rules.map(([m, r]) => `${r} when divided by ${m}`))}`;
  return v(d, text, 1, hi, (n) => rules.every(([m, r]) => n % m === r));
});

family('factors', 'Factors', 'easy', [
  [1, 96], [1, 200], [1, 225], [1, 162], [2, 1001], [2, 1225], [2, 406], [2, 874], [3, 935], [3, 4199],
] as const, ([d, n]) => v(d, `Name a factor of ${f(n)}`, 1, n, (x) => n % x === 0, [1, n]));

family('factor-count', 'How many factors', 'medium', [
  [2, 3, 999], [2, 4, 49], [2, 6, 99], [3, 8, 149], [3, 9, 999],
  [3, 10, 499], [3, 12, 199], [3, 16, 499], [3, 18, 999], [3, 20, 1999],
] as const, ([d, k, hi]) =>
  v(d, `Name a number under ${f(hi + 1)} with exactly ${k} factors`, 1, hi, (n) => countFactors(n) === k));

family('hcf', 'Highest common factors', 'medium', [
  [2, 24, 4, 1, 99], [2, 30, 6, 1, 199], [2, 36, 9, 1, 299], [2, 42, 7, 100, 299], [3, 60, 12, 300, 599],
  [3, 100, 25, 1, 999], [3, 45, 15, 600, 999], [3, 56, 8, 100, 399], [3, 90, 10, 1000, 1299], [3, 84, 14, 500, 999],
] as const, ([d, m, g, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} whose highest common factor with ${m} is exactly ${g}`, lo, hi, (n) => gcd(n, m) === g));

family('coprime', 'Sharing no factors', 'medium', [
  [2, 30, 100, 150], [2, 42, 151, 200], [2, 60, 201, 260], [2, 66, 261, 320], [2, 70, 321, 380],
  [2, 210, 381, 480], [2, 78, 481, 540], [3, 105, 541, 600], [3, 330, 601, 700], [3, 2310, 701, 900],
] as const, ([d, m, lo, hi]) =>
  v(d, `Name a number ${span(lo, hi)} that shares no factor bigger than 1 with ${f(m)}`, lo, hi, (n) => gcd(n, m) === 1));

family('abundant', 'Abundant numbers', 'medium', [
  [2, 'abundant', 1, 49], [2, 'abundant', 50, 99], [3, 'abundant', 100, 149], [3, 'abundant', 150, 199], [3, 'abundant', 200, 299],
  [3, 'abundant', 300, 399], [3, 'abundant', 500, 599], [3, 'abundant', 900, 999], [3, 'odd', 1, 5999], [3, 'deficient-even', 100, 199],
] as const, ([d, kind, lo, hi]) => {
  if (kind === 'odd') {
    return v(d, `Name an odd abundant number ${span(lo, hi)} (its other factors add up to more than it)`, lo, hi, (n) => n % 2 === 1 && isAbundant(n));
  }
  if (kind === 'deficient-even') {
    return v(d, `Name an even number ${span(lo, hi)} whose other factors add up to less than it`, lo, hi, (n) => n % 2 === 0 && sumProperFactors(n) < n);
  }
  return v(d, `Name an abundant number ${span(lo, hi)} (its other factors add up to more than it)`, lo, hi, isAbundant);
});

family('divides-leaving', 'Division with a remainder', 'medium', [
  [2, 100, 4], [2, 130, 4], [3, 500, 20], [2, 365, 5], [3, 1000, 10],
  [3, 2000, 8], [3, 2024, 24], [3, 999, 15], [3, 1500, 12], [3, 1111, 11],
] as const, ([d, n, r]) =>
  v(d, `Name a number that leaves remainder ${r} when you divide ${f(n)} by it`, r + 1, n - r, (x) => x > r && (n - r) % x === 0));

family('linear-multiple', 'Expressions that divide', 'medium', [
  [2, 3, 2, 7, 99], [2, 2, 5, 9, 149], [2, 5, 1, 8, 199], [3, 4, 3, 11, 299], [3, 7, 4, 10, 299],
  [3, 3, -1, 13, 299], [3, 6, 1, 17, 499], [3, 9, 2, 14, 399], [3, 5, -2, 12, 299], [3, 8, 5, 19, 499],
] as const, ([d, a, b, m, hi]) =>
  v(d, `Name a whole number n under ${f(hi + 1)} where ${lin(a, b)} is a multiple of ${m}`, 1, hi, (n) => (((a * n + b) % m) + m) % m === 0));

family('mean-whole', 'Averages', 'easy', [
  [2, [7, 12], 99], [2, [3, 8, 11], 99], [2, [2, 6, 13, 21], 199], [3, [5, 9, 14, 20, 31], 199], [3, [1, 4, 9, 16, 25, 36], 299],
  [3, [2, 3, 5, 7, 11, 13, 17], 299], [3, [10, 20, 30, 40, 50, 60, 70, 81], 399], [3, [1, 2, 4, 8, 16, 32, 64, 128, 256], 499],
  [2, [4, 10, 15], 199], [3, [6, 6, 7, 9], 299],
] as const, ([d, xs, hi]) => {
  const sum = xs.reduce((a, b) => a + b, 0);
  const k = xs.length + 1;
  return v(d, `Name a number under ${f(hi + 1)} that makes the mean of ${list([...xs, 'your number'])} a whole number`, 1, hi, (n) => (sum + n) % k === 0);
});

family('ratios', 'Sharing in a ratio', 'easy', [
  [1, [2, 3], 1, 99], [1, [3, 4], 100, 199], [2, [3, 5], 200, 399], [2, [4, 5], 400, 599], [2, [5, 6], 1, 299],
  [2, [2, 3, 5], 300, 599], [2, [5, 8], 600, 899], [3, [1, 2, 3, 4], 900, 1199], [3, [7, 9], 1200, 1499], [3, [3, 5, 9], 1500, 1999],
] as const, ([d, parts, lo, hi]) => {
  const total = parts.reduce((a, b) => a + b, 0);
  return v(
    d,
    `Name a sum of money in pounds ${span(lo, hi)} that can be shared in the ratio ${parts.join(' : ')} in whole pounds`,
    lo,
    hi,
    multipleOf(total),
  );
});

family('percentages', 'Percentages', 'easy', [
  [1, '15%', 20, 1, 399], [1, '12.5%', 8, 100, 299], [2, '35%', 20, 400, 799], [2, '2.5%', 40, 800, 1999], [2, '37.5%', 8, 300, 499],
  [2, '64%', 25, 1, 999], [2, '6.25%', 16, 500, 799], [2, '45%', 20, 2000, 2999], [3, '0.5%', 200, 3000, 9999], [3, '1.2%', 250, 10000, 14999],
] as const, ([d, pct, k, lo, hi]) => v(d, `Name a number ${span(lo, hi)} where ${pct} of it is a whole number`, lo, hi, multipleOf(k)));

// ───────────────────────────── Squares and powers ─────────────────────────────

family('squares', 'Squares in a range', 'easy', [
  [1, 1, 99], [1, 100, 400], [1, 401, 999], [2, 1000, 1999], [2, 2000, 3499],
  [2, 3500, 4999], [3, 5000, 7499], [3, 7500, 9999], [3, 10000, 14999], [3, 15000, 19999],
] as const, ([d, lo, hi]) => v(d, `Name a square number ${span(lo, hi)}`, lo, hi, isSquare, [144, 169, 961]));

family('square-endings', 'How squares and cubes end', 'easy', [
  [1, 2, '1', 1, 99], [2, 2, '4', 100, 199], [2, 2, '6', 200, 299], [2, 2, '9', 300, 399], [2, 3, '7', 1, 199],
  [2, 3, '8', 200, 399], [3, 2, '21', 400, 599], [3, 2, '44', 600, 999], [3, 2, '76', 1, 999], [3, 3, '1', 400, 699],
] as const, ([d, power, end, lo, hi]) =>
  v(
    d,
    `Name a number ${span(lo, hi)} whose ${power === 2 ? 'square' : 'cube'} ends in ${end}`,
    lo,
    hi,
    (n) => String(BigInt(n) ** BigInt(power)).endsWith(end),
  ));

family('near-squares', 'Next to a square', 'easy', [
  [1, -1, 1, 499], [1, 1, 1, 499], [2, 2, 500, 999], [2, -2, 500, 999], [2, 3, 1, 999],
  [2, -3, 1000, 1999], [2, 5, 1000, 1999], [2, -5, 1, 999], [3, 10, 2000, 4999], [3, -10, 2000, 4999],
] as const, ([d, k, lo, hi]) =>
  v(
    d,
    `Name a number ${span(lo, hi)} that is ${Math.abs(k)} ${k > 0 ? 'more' : 'less'} than a square number`,
    lo,
    hi,
    (n) => n - k >= 1 && isSquare(n - k),
  ));

family('powers', 'Powers', 'easy', [
  [1, 2, 1, 999], [2, 3, 1, 99999], [2, 5, 1, 999999], [3, 6, 1, 9999999], [3, 7, 1, 9999999],
  [3, 11, 1, 999999999], [3, 12, 1, 999999999], [2, 2, 1000, 999999], [3, 13, 1, 999999999], [1, 10, 1, 999999999],
] as const, ([d, b, lo, hi]) =>
  v(
    d,
    `Name a power of ${b} ${span(lo, hi)} (${list([b, b * b, b ** 3]).replace(' and', ',')}, …)`,
    lo,
    hi,
    (n) => {
      let m = n;
      while (m % b === 0 && m > 1) m /= b;
      return m === 1 && n >= b;
    },
    [],
    () => geometric(b, b, hi),
  ));

family('square-starts', 'How squares begin', 'easy', [
  [2, 2, 1], [2, 2, 2], [2, 2, 3], [2, 2, 4], [2, 2, 5], [2, 2, 6], [2, 2, 7], [2, 2, 8], [2, 2, 9], [3, 3, 3],
] as const, ([d, power, start]) =>
  v(
    d,
    `Name a whole number under 1,000 whose ${power === 2 ? 'square' : 'cube'} starts with ${start}`,
    1,
    999,
    (n) => String(n ** power).startsWith(String(start)),
  ));

family('cubes', 'Cubes', 'easy', [
  [1, 'cube', 1, 999], [2, 'cube', 1000, 9999], [3, 'cube', 10000, 99999], [2, 'plus1', 1, 1999], [2, 'minus1', 1, 1999],
  [3, 'odd', 100000, 999999], [3, 'ends7', 1, 999999], [3, 'twoconsec', 1, 1999], [3, 'plus2', 2000, 19999], [3, 'even', 100000, 999999],
] as const, ([d, kind, lo, hi]) => {
  const rules = {
    cube: ['a cube number', '', isCube],
    plus1: ['a number', ' that is 1 more than a cube number', (n: number) => n >= 2 && isCube(n - 1)],
    minus1: ['a number', ' that is 1 less than a cube number', (n: number) => isCube(n + 1)],
    odd: ['an odd cube number', '', (n: number) => n % 2 === 1 && isCube(n)],
    ends7: ['a cube number', ' that ends in 7', (n: number) => n % 10 === 7 && isCube(n)],
    twoconsec: ['a number', ' that is the sum of two cubes next to each other (like 2³ + 3³)', (n: number) => {
      const a = Math.floor(Math.cbrt(n / 2));
      return [a - 1, a, a + 1].some((x) => x >= 1 && x ** 3 + (x + 1) ** 3 === n);
    }],
    plus2: ['a number', ' that is 2 more than a cube number', (n: number) => isCube(n - 2)],
    even: ['an even cube number', '', (n: number) => n % 2 === 0 && isCube(n)],
  } as const;
  const [what, rest, test] = rules[kind];
  return v(d, `Name ${what} ${span(lo, hi)}${rest}`, lo, hi, test, [], () => {
    const out: number[] = [];
    for (let x = 1; x ** 3 <= hi + 2; x++) out.push(x ** 3, x ** 3 + 1, x ** 3 - 1, x ** 3 + 2, x ** 3 + (x + 1) ** 3);
    return out;
  });
});

family('linear-square', 'Expressions that make squares', 'medium', [
  [2, 2, 1, 199], [2, 3, 1, 299], [2, 8, 1, 499], [2, 1, 20, 999], [2, 4, 1, 499],
  [3, 5, 4, 499], [3, 6, 1, 499], [3, 24, 1, 999], [3, 7, 2, 999], [3, 10, 6, 999],
] as const, ([d, a, b, hi]) =>
  v(d, `Name a whole number n under ${f(hi + 1)} where ${lin(a, b)} is a square number`, 1, hi, (n) => isSquare(a * n + b)));

family('roots', 'Roots between whole numbers', 'easy', [
  [1, 2, 7, 8], [1, 3, 4, 5], [1, 2, 12, 13], [2, 2, 15.5, 16], [2, 3, 6.5, 7],
  [1, 2, 20, 21], [2, 3, 9, 10], [2, 2, 40, 41], [2, 2, 44, 45], [3, 4, 7, 8],
] as const, ([d, k, a, b]) => {
  const root = k === 2 ? 'square root' : k === 3 ? 'cube root' : 'fourth root';
  const lo = Math.floor(a ** k) + 1;
  const hi = Math.ceil(b ** k) - 1;
  // Compare powers rather than roots: no floating-point surprises at the ends.
  return v(d, `Name a number whose ${root} is between ${a} and ${b}`, lo, hi, (n) => n > a ** k && n < b ** k);
});

family('power-sums', 'Sums of powers', 'medium', [
  [2, 'two-squares', 1, 99], [2, 'two-squares', 500, 600], [2, 'two-cubes', 1, 1999], [3, 'two-cubes', 2000, 9999], [3, 'square-cube', 100, 200],
  [3, 'squares-twice', 1, 499], [3, 'cube-diff', 1, 999], [3, 'prime-squares', 1, 999], [3, 'three-squares', 1, 99], [3, 'two-squares', 1000, 1100],
] as const, ([d, kind, lo, hi]) => {
  const squaresWays = (n: number) => {
    let ways = 0;
    for (let a = 1; 2 * a * a <= n; a++) if (isSquare(n - a * a)) ways++;
    return ways;
  };
  const rules = {
    'two-squares': ['that is the sum of two square numbers (0 not allowed)', isSumOfTwoSquares],
    'two-cubes': ['that is the sum of two cube numbers (0 not allowed)', isSumOfTwoCubes],
    'square-cube': ['that is a square number plus a cube number (0 not allowed)', (n: number) => {
      for (let c = 1; c ** 3 < n; c++) if (isSquare(n - c ** 3)) return true;
      return false;
    }],
    'squares-twice': ['that is the sum of two square numbers in two different ways (0 not allowed)', (n: number) => squaresWays(n) >= 2],
    'cube-diff': ['that is the difference of two cube numbers (0 not allowed)', (n: number) => {
      for (let b = 1; (b + 1) ** 3 - b ** 3 <= n; b++) if (isCube(n + b ** 3)) return true;
      return false;
    }],
    'prime-squares': ['that is the sum of the squares of two primes', (n: number) => {
      for (let p = 2; 2 * p * p <= n; p++) if (isPrime(p) && isSquare(n - p * p) && isPrime(Math.round(Math.sqrt(n - p * p)))) return true;
      return false;
    }],
    'three-squares': ['that is the sum of three different square numbers (0 not allowed)', (n: number) => {
      for (let a = 1; a * a < n; a++) for (let b = a + 1; a * a + b * b < n; b++) {
        const c2 = n - a * a - b * b;
        if (c2 > b * b && isSquare(c2)) return true;
      }
      return false;
    }],
  } as const;
  const [words, test] = rules[kind];
  return v(d, `Name a number ${span(lo, hi)} ${words}`, lo, hi, test);
});

family('special-squares', 'Squares with a twist', 'medium', [
  [2, 'mult7', 1, 9999], [3, 'sum9', 1, 4999], [3, 'distinct', 1000, 9999], [3, 'even-digits', 1, 99999], [2, 'mult6', 5000, 19999],
  [3, 'has7', 10000, 29999], [3, 'odd-sum', 3000, 6999], [2, 'ends6', 1, 9999], [2, 'mult10', 10000, 99999], [3, 'sum-square', 10000, 19999],
] as const, ([d, kind, lo, hi]) => {
  const rules = {
    mult7: ['that is a multiple of 7', (n: number) => n % 7 === 0],
    sum9: ['whose digits add up to 9', (n: number) => digitSum(n) === 9],
    distinct: ['with four different digits', (n: number) => new Set(String(n)).size === 4],
    'even-digits': ['whose digits are all even', (n: number) => digitsOf(n).every((x) => x % 2 === 0)],
    mult6: ['that is a multiple of 6', (n: number) => n % 6 === 0],
    has7: ['that contains the digit 7', (n: number) => String(n).includes('7')],
    'odd-sum': ['whose digits add up to an odd number', (n: number) => digitSum(n) % 2 === 1],
    ends6: ['that ends in 6', (n: number) => n % 10 === 6],
    mult10: ['that is a multiple of 10', (n: number) => n % 10 === 0],
    'sum-square': ['whose digits add up to a square number', (n: number) => isSquare(digitSum(n))],
  } as const;
  const [words, test] = rules[kind];
  return v(d, `Name a square number ${span(lo, hi)} ${words}`, lo, hi, (n) => isSquare(n) && test(n), [], () => {
    const out: number[] = [];
    for (let x = 1; x * x <= hi; x++) out.push(x * x);
    return out;
  });
});

family('times-window', 'Multiplying into a window', 'easy', [
  [1, 6, 100, 200], [1, 13, 400, 520], [1, 7, 300, 400], [1, 9, 500, 600], [1, 12, 1000, 1200],
  [2, 17, 600, 800], [2, 25, 6000, 7500], [2, 8, 1500, 1700], [1, 15, 6000, 7000], [2, 19, 2500, 3000],
] as const, ([d, k, lo, hi]) =>
  v(d, `Name a whole number n where ${k} × n is between ${f(lo)} and ${f(hi)}`, Math.ceil(lo / k), Math.floor(hi / k), (n) => k * n >= lo && k * n <= hi));

// ───────────────────────────── Sequences ─────────────────────────────

const FIGURATE = {
  pronic: ['a rectangular number n × (n + 1)', [2, 6, 12, 20], (k: number) => k * (k + 1)],
  pentagonal: ['a pentagonal number', [1, 5, 12, 22], (k: number) => (k * (3 * k - 1)) / 2],
  hexagonal: ['a hexagonal number', [1, 6, 15, 28], (k: number) => k * (2 * k - 1)],
  'centred-square': ['a centred square number', [1, 5, 13, 25], (k: number) => k * k + (k - 1) * (k - 1)],
  star: ['a star number', [1, 13, 37, 73], (k: number) => 6 * k * (k - 1) + 1],
  tetrahedral: ['a tetrahedral number', [1, 4, 10, 20], (k: number) => (k * (k + 1) * (k + 2)) / 6],
  'square-pyramid': ['a square pyramidal number', [1, 5, 14, 30], (k: number) => (k * (k + 1) * (2 * k + 1)) / 6],
  octagonal: ['an octagonal number', [1, 8, 21, 40], (k: number) => k * (3 * k - 2)],
  heptagonal: ['a heptagonal number', [1, 7, 18, 34], (k: number) => (k * (5 * k - 3)) / 2],
  'centred-hex': ['a centred hexagonal number', [1, 7, 19, 37], (k: number) => 3 * k * (k - 1) + 1],
} as const;

family('figurate', 'Shape numbers', 'medium', [
  [2, 'pronic', 999], [2, 'pentagonal', 999], [3, 'hexagonal', 1999], [3, 'centred-square', 999], [3, 'star', 2999],
  [3, 'tetrahedral', 2999], [3, 'square-pyramid', 4999], [3, 'octagonal', 1999], [3, 'heptagonal', 1999], [3, 'centred-hex', 1999],
] as const, ([d, kind, hi]) => {
  const [name, first, gen] = FIGURATE[kind];
  const terms = () => {
    const out: number[] = [];
    for (let k = 1; gen(k) <= hi; k++) out.push(gen(k));
    return out;
  };
  return v(d, `Name ${name} under ${f(hi + 1)} (${first.join(', ')}, …)`, 1, hi, lazySet(terms), [], terms);
});

family('triangular', 'Triangular numbers', 'easy', [
  [1, 1, 49], [1, 50, 199], [2, 200, 499], [2, 500, 999], [2, 1000, 1999],
  [3, 2000, 2999], [3, 3000, 4999], [3, 5000, 6999], [3, 7000, 9999], [3, 10000, 14999],
] as const, ([d, lo, hi]) => v(d, `Name a triangular number ${span(lo, hi)} (1, 3, 6, 10, 15, …)`, lo, hi, isTriangular, [28, 55, 153, 666]));

family('consecutive-products', 'Products in a row', 'medium', [
  [2, 'two', 999], [2, 'three', 9999], [3, 'four', 99999], [2, 'odd-pair', 999], [2, 'even-pair', 999],
  [3, 'primes', 9999], [3, 'gap3', 999], [3, 'gap5', 1999], [3, 'gap10', 2999], [3, 'odd-three', 9999],
] as const, ([d, kind, hi]) => {
  const rules: Record<string, [string, (k: number) => number, number]> = {
    two: ['that is two whole numbers in a row multiplied together (like 4 × 5)', (k) => k * (k + 1), 1],
    three: ['that is three whole numbers in a row multiplied together (like 4 × 5 × 6)', (k) => k * (k + 1) * (k + 2), 1],
    four: ['that is four whole numbers in a row multiplied together', (k) => k * (k + 1) * (k + 2) * (k + 3), 1],
    'odd-pair': ['that is two odd numbers in a row multiplied together (like 5 × 7)', (k) => (2 * k - 1) * (2 * k + 1), 1],
    'even-pair': ['that is two even numbers in a row multiplied together (like 4 × 6)', (k) => 2 * k * (2 * k + 2), 1],
    primes: ['that is two primes in a row multiplied together (like 5 × 7)', (k) => {
      const p = primesBelow(200);
      return p[k - 1]! * p[k]!;
    }, 1],
    gap3: ['that is n × (n + 3) for a whole number n', (k) => k * (k + 3), 1],
    gap5: ['that is n × (n + 5) for a whole number n', (k) => k * (k + 5), 1],
    gap10: ['that is n × (n + 10) for a whole number n', (k) => k * (k + 10), 1],
    'odd-three': ['that is three odd numbers in a row multiplied together (like 3 × 5 × 7)', (k) => (2 * k - 1) * (2 * k + 1) * (2 * k + 3), 1],
  };
  const [words, gen, start] = rules[kind]!;
  const terms = () => {
    const out: number[] = [];
    for (let k = start; gen(k) <= hi && k < 150; k++) out.push(gen(k));
    return out;
  };
  return v(d, `Name a number under ${f(hi + 1)} ${words}`, 1, hi, lazySet(terms), [], terms);
});

family('fib-like', 'Add the last two', 'easy', [
  [1, 1, 2, 9999], [2, 2, 1, 9999], [2, 1, 4, 9999], [2, 2, 5, 9999], [2, 4, 3, 9999],
  [2, 1, 6, 9999], [3, 2, 7, 9999], [3, 3, 8, 9999], [3, 4, 9, 9999], [3, 5, 11, 9999],
] as const, ([d, a, b, hi]) => {
  const terms = () => termsBelow([a, b], (t) => t[t.length - 1]! + t[t.length - 2]!, hi);
  const shown = termsBelow([a, b], (t) => t[t.length - 1]! + t[t.length - 2]!, 1e9).slice(0, 5);
  return v(
    d,
    `Name a number under ${f(hi + 1)} in the sequence ${shown.join(', ')}, … (each term is the two before added together)`,
    1,
    hi,
    lazySet(terms),
    [],
    terms,
  );
});

family('arith-sequences', 'Counting in steps', 'easy', [
  [1, 7, 11, 499], [1, 4, 9, 499], [1, 13, 6, 299], [2, 5, 13, 699], [2, 2, 17, 999],
  [2, 9, 8, 399], [2, 20, 14, 799], [2, 3, 19, 999], [3, 11, 23, 1499], [2, 100, -7, 100],
] as const, ([d, a, step, hi]) => {
  const shown = [0, 1, 2, 3].map((i) => a + i * step);
  if (step < 0) {
    return v(d, `Name a positive number in the sequence ${shown.join(', ')}, …`, 1, a, (n) => n <= a && (a - n) % -step === 0);
  }
  return v(d, `Name a number under ${f(hi + 1)} in the sequence ${shown.join(', ')}, …`, a, hi, (n) => n >= a && (n - a) % step === 0);
});

family('geom-sequences', 'Multiplying sequences', 'easy', [
  [1, 3, 2], [2, 5, 2], [2, 7, 2], [2, 9, 2], [2, 2, 3],
  [3, 4, 3], [3, 5, 3], [3, 2, 5], [3, 3, 5], [3, 2, 7],
] as const, ([d, a, r]) => {
  const hi = 9_999_999;
  const verb = r === 2 ? 'keep doubling' : `keep multiplying by ${r}`;
  const terms = () => geometric(a, r, hi);
  return v(d, `Name a number under 10,000,000 in the sequence ${geometric(a, r, 1e9).slice(0, 4).join(', ')}, … (${verb})`, a, hi, lazySet(terms), [], terms);
});

family('consecutive-sums', 'Sums in a row', 'easy', [
  [1, 2, 1, 99], [1, 3, 100, 199], [2, 4, 200, 299], [2, 5, 300, 399], [2, 6, 400, 499],
  [2, 7, 500, 699], [3, 8, 700, 899], [3, 9, 900, 1099], [3, 10, 1100, 1299], [3, 11, 1300, 1599],
] as const, ([d, k, lo, hi]) => {
  const base = (k * (k - 1)) / 2;
  return v(
    d,
    `Name a number ${span(lo, hi)} that is the sum of ${k} whole numbers in a row (like ${k <= 3 ? Array.from({ length: k }, (_, i) => i + 4).join(' + ') : `4 + 5 + … + ${k + 3}`})`,
    lo,
    hi,
    (n) => n >= base + k && (n - base) % k === 0,
  );
});

family('collatz', 'Halve or treble', 'hard', [
  [3, 12], [3, 14], [3, 15], [3, 17], [3, 20], [3, 23], [3, 28], [3, 33], [3, 41], [3, 46],
] as const, ([d, k]) =>
  v(
    d,
    `Name a starting number under 1,000 that takes exactly ${k} steps to reach 1 (if even, halve it; if odd, treble it and add 1)`,
    1,
    999,
    (n) => collatzSteps(n) === k,
  ));

family('digit-chains', 'Digit chains', 'hard', [
  [2, 'mult', 2, 1, 99], [3, 'mult', 3, 100, 999], [3, 'mult', 4, 1, 9999], [2, 'add', 2, 100, 199], [3, 'add', 3, 1, 9999],
  [2, 'happy', 0, 1, 99], [3, 'happy', 0, 200, 299], [2, 'mult', 1, 10, 99], [3, 'unhappy-square', 0, 1, 999], [3, 'happy', 0, 300, 499],
] as const, ([d, kind, k, lo, hi]) => {
  if (kind === 'mult') {
    return v(d, `Name a number ${span(lo, hi)} where multiplying its digits together reaches a single digit in exactly ${k} step${k === 1 ? '' : 's'}`, lo, hi, (n) => multiplicativePersistence(n) === k);
  }
  if (kind === 'add') {
    return v(d, `Name a number ${span(lo, hi)} where adding its digits together reaches a single digit in exactly ${k} steps`, lo, hi, (n) => additivePersistence(n) === k);
  }
  if (kind === 'unhappy-square') {
    return v(d, `Name a square number ${span(lo, hi)} that is not happy (adding the squares of its digits over and over never reaches 1)`, lo, hi, (n) => isSquare(n) && !isHappy(n));
  }
  return v(d, `Name a happy number ${span(lo, hi)} (adding the squares of its digits over and over reaches 1)`, lo, hi, isHappy);
});

// ───────────────────────────────── Digits ─────────────────────────────────

family('digit-sum', 'Digit sums', 'easy', [
  [1, 5, 1, 999], [1, 12, 100, 999], [2, 15, 1, 999], [2, 7, 1000, 9999], [2, 21, 1, 999],
  [2, 25, 1000, 9999], [2, 3, 1, 9999], [3, 30, 1000, 9999], [1, 11, 100, 299], [2, 18, 1000, 1999],
] as const, ([d, s, lo, hi]) => v(d, `Name a number ${span(lo, hi)} whose digits add up to ${s}`, lo, hi, (n) => digitSum(n) === s));

family('digit-product', 'Digit products', 'easy', [
  [1, 12], [1, 18], [2, 20], [2, 24], [2, 30], [2, 36], [2, 40], [2, 42], [3, 48], [3, 72],
] as const, ([d, p]) => v(d, `Name a number under 1,000 whose digits multiply to make ${p}`, 1, 999, (n) => digitProduct(n) === p));

family('digit-squares', 'Squared digits', 'medium', [
  [2, 25], [2, 50], [2, 65], [3, 41], [3, 29], [3, 74], [3, 90], [3, 99], [3, 34], [3, 77],
] as const, ([d, s]) =>
  v(d, `Name a number under 1,000 where the squares of its digits add up to ${s}`, 1, 999, (n) => digitSquareSum(n) === s));

family('palindromes', 'Palindromes', 'easy', [
  [1, 100, 299], [1, 300, 599], [1, 600, 999], [1, 1000, 1999], [2, 2000, 3999],
  [2, 4000, 6999], [2, 7000, 9999], [3, 10000, 10999], [3, 20000, 29999], [3, 100000, 119999],
] as const, ([d, lo, hi]) => v(d, `Name a palindrome ${span(lo, hi)} (it reads the same backwards)`, lo, hi, isPalindrome));

family('palindrome-multiples', 'Palindromes that divide', 'medium', [
  [2, 3, 100, 999], [2, 4, 1000, 9999], [3, 6, 10000, 29999], [2, 7, 1, 999], [3, 8, 30000, 59999],
  [3, 9, 60000, 99999], [3, 12, 200000, 299999], [3, 13, 1, 9999], [3, 15, 10000, 99999], [3, 17, 1, 9999],
] as const, ([d, k, lo, hi]) =>
  v(d, `Name a palindrome ${span(lo, hi)} that is a multiple of ${k}`, lo, hi, (n) => n % k === 0 && isPalindrome(n)));

family('digit-perms', 'Shuffling digits', 'easy', [
  [1, [1, 2, 3, 4]], [1, [5, 6, 7, 8]], [1, [2, 4, 6, 9]], [1, [1, 3, 5, 7]], [1, [0, 1, 2, 3]],
  [1, [1, 1, 2, 3]], [1, [6, 7, 8, 9]], [1, [0, 4, 5, 9]], [2, [1, 2, 3, 4, 5]], [1, [2, 3, 5, 8]],
] as const, ([d, digits]) => {
  const lo = 10 ** (digits.length - 1);
  return v(d, `Name a number that uses each of the digits ${list(digits)} exactly once`, lo, 10 ** digits.length - 1, sameDigits(digits));
});

family('digit-perms-plus', 'Shuffling digits with a twist', 'medium', [
  [2, [1, 2, 3, 6, 7], 'multiple of 4'], [2, [2, 4, 5, 8, 9], 'even'], [3, [1, 3, 4, 6, 8], 'multiple of 8'], [3, [1, 2, 3, 5, 7], 'multiple of 11'], [2, [0, 2, 5, 7, 9], 'multiple of 5'],
  [3, [1, 2, 3, 7], 'prime'], [3, [1, 3, 4, 5, 6], 'multiple of 7'], [2, [3, 4, 7, 9], 'odd'], [2, [1, 3, 6, 8, 9], 'multiple of 9'], [3, [1, 2, 4, 6, 8], 'multiple of 12'],
] as const, ([d, digits, rule]) => {
  const tests: Record<string, (n: number) => boolean> = {
    'multiple of 4': multipleOf(4), even: multipleOf(2), 'multiple of 8': multipleOf(8), 'multiple of 11': multipleOf(11),
    'multiple of 5': multipleOf(5), prime: isPrime, 'multiple of 7': multipleOf(7), odd: (n) => n % 2 === 1,
    'multiple of 9': multipleOf(9), 'multiple of 12': multipleOf(12),
  };
  const word = rule === 'even' || rule === 'odd' ? `an ${rule} number` : rule === 'prime' ? 'a prime' : `a ${rule}`;
  const same = sameDigits(digits);
  return v(
    d,
    `Name ${word} that uses each of the digits ${list(digits)} exactly once`,
    10 ** (digits.length - 1),
    10 ** digits.length - 1,
    (n) => same(n) && tests[rule]!(n),
  );
});

family('only-digits', 'Limited digits', 'easy', [
  [1, [0, 1], 1, 9999], [1, [2, 5], 1, 999], [1, [3, 7], 1, 999], [1, [4, 9], 1000, 9999], [1, [6, 8], 1000, 9999],
  [1, [1, 7], 1000, 9999], [2, [2, 3, 5, 7], 1000, 9999], [2, [1, 4, 9], 1, 999], [2, [0, 6, 8, 9], 1, 999], [1, [0, 5], 1, 99999],
] as const, ([d, digits, lo, hi]) => {
  const allowed = new Set<number>(digits);
  const what = digits.length === 2 ? `only the digits ${digits[0]} and ${digits[1]}` : `only the digits ${list(digits)}`;
  return v(d, `Name a number ${span(lo, hi)} written with ${what}`, lo, hi, (n) => digitsOf(n).every((x) => allowed.has(x)));
});

family('digit-order', 'Digits in order', 'easy', [
  [1, 'up', 3], [1, 'down', 3], [2, 'up', 4], [2, 'down', 4], [2, 'up', 5],
  [2, 'down', 5], [1, 'peak', 3], [1, 'valley', 3], [2, 'zigzag', 4], [1, 'up', 2],
] as const, ([d, kind, len]) => {
  const lo = 10 ** (len - 1);
  const hi = 10 ** len - 1;
  const words = ['', '', 'two', 'three', 'four', 'five'][len];
  const rules = {
    up: [`whose digits go up from left to right (like ${'123456789'.slice(1, 1 + len)})`, digitsStrictlyAscending],
    down: [`whose digits go down from left to right (like ${'987654321'.slice(1, 1 + len)})`, strictlyDown],
    peak: ['whose middle digit is bigger than both of the others', (n: number) => {
      const [a, b, c] = digitsOf(n) as [number, number, number];
      return b > a && b > c;
    }],
    valley: ['whose middle digit is smaller than both of the others', (n: number) => {
      const [a, b, c] = digitsOf(n) as [number, number, number];
      return b < a && b < c;
    }],
    zigzag: ['whose digits go up, down, up (like 1527)', (n: number) => {
      const [a, b, c, e] = digitsOf(n) as [number, number, number, number];
      return a < b && b > c && c < e;
    }],
  } as const;
  const [rule, test] = rules[kind];
  return v(d, `Name a ${words}-digit number ${rule}`, lo, hi, test);
});

function strictlyDown(n: number): boolean {
  const ds = digitsOf(n);
  return ds.every((x, i) => i === 0 || x < ds[i - 1]!);
}

family('digit-rules', 'Three-digit puzzles', 'easy', [
  [2, 'first-sum'], [2, 'last-product'], [2, 'middle-mean'], [2, 'all-even'], [2, 'all-odd'],
  [2, 'last-sum'], [3, 'first-product'], [2, 'middle-sum'], [3, 'two-same'], [3, 'prime-digits'],
] as const, ([d, kind]) => {
  const rules: Record<string, [string, (a: number, b: number, c: number) => boolean]> = {
    'first-sum': ['whose first digit is the sum of the other two', (a, b, c) => a === b + c],
    'last-product': ['whose last digit is the first two digits multiplied together', (a, b, c) => c === a * b],
    'middle-mean': ['whose middle digit is the average of the other two', (a, b, c) => 2 * b === a + c],
    'all-even': ['whose digits are all even and all different', (a, b, c) => [a, b, c].every((x) => x % 2 === 0) && new Set([a, b, c]).size === 3],
    'all-odd': ['whose digits are all odd and all different', (a, b, c) => [a, b, c].every((x) => x % 2 === 1) && new Set([a, b, c]).size === 3],
    'last-sum': ['whose last digit is the sum of the other two', (a, b, c) => c === a + b],
    'first-product': ['whose first digit is the other two multiplied together', (a, b, c) => a === b * c],
    'middle-sum': ['whose middle digit is the sum of the other two', (a, b, c) => b === a + c],
    'two-same': ['with exactly two digits the same, adding up to 10', (a, b, c) => new Set([a, b, c]).size === 2 && a + b + c === 10],
    'prime-digits': ['whose digits are all different primes (2, 3, 5 or 7)', (a, b, c) => [a, b, c].every((x) => [2, 3, 5, 7].includes(x)) && new Set([a, b, c]).size === 3],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a three-digit number ${words}`, 100, 999, (n) => test(Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10));
});

family('reversal', 'Reversing digits', 'easy', [
  [2, 99], [2, 198], [2, 297], [2, 396], [3, 495],
  [3, 594], [2, -99], [2, -198], [3, -297], [3, -396],
] as const, ([d, diff]) =>
  v(
    d,
    `Name a three-digit number, not ending in 0, that ${diff > 0 ? 'goes up' : 'goes down'} by ${Math.abs(diff)} when you reverse its digits`,
    100,
    999,
    (n) => n % 10 !== 0 && reverseDigits(n) - n === diff,
  ));

family('self-divisible', 'Divisible by its own digits', 'medium', [
  [2, 'each', 10, 99], [3, 'each', 100, 299], [3, 'each', 300, 599], [3, 'product', 1000, 9999], [2, 'sum', 100, 199],
  [3, 'sum', 200, 299], [3, 'sum', 1000, 1199], [3, 'first-last', 600, 999], [3, 'sum', 2000, 2199], [3, 'last-two', 1000, 9999],
] as const, ([d, kind, lo, hi]) => {
  const rules = {
    each: ['that is divisible by each of its digits (no zeros)', (n: number) => digitsOf(n).every((x) => x !== 0 && n % x === 0)],
    sum: ['that is divisible by the sum of its digits', isHarshad],
    product: ['that is divisible by the product of its digits (no zeros)', (n: number) => digitProduct(n) > 0 && n % digitProduct(n) === 0],
    'first-last': ['that is divisible by its first digit and its last digit, which are different', (n: number) => {
      const ds = digitsOf(n);
      const a = ds[0]!;
      const z = ds[ds.length - 1]!;
      return z !== 0 && a !== z && n % a === 0 && n % z === 0;
    }],
    'last-two': ['that is divisible by the number made by its last two digits (not 00)', (n: number) => n % 100 >= 1 && n % (n % 100) === 0],
  } as const;
  const [words, test] = rules[kind];
  return v(d, `Name a number ${span(lo, hi)} ${words}`, lo, hi, test);
});

family('multiple-digit-sum', 'Multiples with a digit sum', 'medium', [
  [2, 7, 10], [2, 6, 15], [2, 8, 12], [3, 11, 16], [2, 9, 18],
  [2, 12, 9], [3, 7, 13], [3, 8, 14], [2, 15, 6], [3, 7, 17],
] as const, ([d, k, s]) =>
  v(d, `Name a multiple of ${k} under 1,000 whose digits add up to ${s}`, 1, 999, (n) => n % k === 0 && digitSum(n) === s));

family('sum-vs-product', 'Adding versus multiplying digits', 'hard', [
  [3, 'equal', 0, 1, 9999], [3, 'double', 0, 100, 999], [3, 'triple', 0, 1000, 9999], [3, 'quad', 0, 1, 999], [3, 'plus', 10, 1, 999],
  [3, 'square', 0, 1, 9999], [3, 'minus', 5, 1, 999], [3, 'plus', 1, 1000, 9999], [3, 'plus', 20, 1, 999], [3, 'half', 0, 1, 99999],
] as const, ([d, kind, k, lo, hi]) => {
  const rules: Record<string, [string, (s: number, p: number) => boolean]> = {
    equal: ['whose digits multiply to the same number as they add up to', (s, p) => s === p],
    double: ['whose digits multiply to exactly twice what they add up to', (s, p) => p === 2 * s],
    triple: ['whose digits multiply to exactly three times what they add up to', (s, p) => p === 3 * s],
    quad: ['whose digits multiply to exactly four times what they add up to', (s, p) => p === 4 * s],
    half: ['whose digits add up to exactly twice what they multiply to', (s, p) => p > 0 && s === 2 * p],
    plus: [`whose digits multiply to exactly ${k} more than they add up to`, (s, p) => p === s + k],
    minus: [`whose digits multiply to exactly ${k} less than they add up to`, (s, p) => p === s - k],
    square: ['whose digits multiply to the square of what they add up to', (s, p) => p === s * s],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a number ${span(Math.max(lo, 1), hi)}, with at least two digits, ${words}`, Math.max(lo, 10), hi, (n) => test(digitSum(n), digitProduct(n)));
});

// ───────────────────────────── Ways of writing numbers ─────────────────────────────

family('number-words', 'Numbers as words', 'easy', [
  [2, 'letters', 8, 99], [2, 'letters', 9, 99], [2, 'letters', 10, 99], [2, 'letters', 11, 99], [3, 'letters', 16, 999],
  [2, 'no-e', 0, 99], [2, 'has-x', 0, 99], [2, 'has-v', 0, 99], [3, 'letters', 20, 999], [3, 'letters', 24, 999],
] as const, ([d, kind, k, hi]) => {
  const tail = ' (in British English, like “one hundred and two”)';
  if (kind === 'letters') {
    return v(d, `Name a number under ${f(hi + 1)} whose name in words has exactly ${k} letters${hi > 99 ? tail : ''}`, 1, hi, (n) => letterCount(n) === k);
  }
  const letter = kind === 'no-e' ? 'e' : kind === 'has-x' ? 'x' : 'v';
  const has = kind !== 'no-e';
  return v(d, `Name a number under ${f(hi + 1)} whose name in words ${has ? 'contains' : 'has no'} letter “${letter}”`, 1, hi, (n) => numberName(n).includes(letter) === has);
});

family('roman', 'Roman numerals', 'easy', [
  [2, 'len', 3, 1, 99], [2, 'len', 4, 1, 99], [2, 'len', 5, 1, 99], [2, 'len', 6, 1, 99], [3, 'len', 8, 100, 999],
  [3, 'len', 10, 100, 1999], [2, 'palin', 0, 1, 999], [2, 'ixv', 0, 1, 99], [3, 'len', 12, 1000, 3999], [3, 'shorter', 0, 1, 3999],
] as const, ([d, kind, k, lo, hi]) => {
  if (kind === 'len') {
    return v(d, `Name a number ${span(lo, hi)} whose Roman numeral has exactly ${k} letters (XIV has 3)`, lo, hi, (n) => romanNumeral(n).length === k);
  }
  if (kind === 'palin') {
    return v(d, `Name a number ${span(lo, hi)}, bigger than 10, whose Roman numeral reads the same backwards (like XIX)`, 11, hi, (n) => {
      const r = romanNumeral(n);
      return r.split('').reverse().join('') === r;
    });
  }
  if (kind === 'ixv') {
    return v(d, `Name a number ${span(lo, hi)}, bigger than 10, whose Roman numeral uses only I, V and X`, 11, hi, (n) => /^[IVX]+$/.test(romanNumeral(n)));
  }
  return v(d, `Name a number ${span(lo, hi)} whose Roman numeral is shorter than its ordinary digits (like M for 1000)`, lo, hi, (n) => romanNumeral(n).length < String(n).length);
});

family('binary', 'Binary', 'hard', [
  [3, 'ones', 2, 1, 999], [3, 'ones', 3, 1, 199], [3, 'palin', 0, 1, 299], [3, 'no-adjacent', 0, 1, 99], [3, 'ends101', 0, 200, 399],
  [3, 'one-zero', 0, 1, 999], [3, 'ones', 4, 300, 599], [2, 'length', 6, 1, 999], [3, 'balanced', 0, 1, 255], [3, 'starts111', 0, 600, 999],
] as const, ([d, kind, k, lo, hi]) => {
  const bin = (n: number) => n.toString(2);
  const rules: Record<string, [string, (n: number) => boolean]> = {
    ones: [`whose binary form has exactly ${k} ones (5 is 101 in binary: two ones)`, (n) => binaryOnes(n) === k],
    palin: ['whose binary form reads the same backwards (5 is 101)', (n) => isPalindromeInBase(n, 2)],
    'no-adjacent': ['whose binary form never has two 1s next to each other (5 is 101)', (n) => !bin(n).includes('11')],
    ends101: ['whose binary form ends in 101', (n) => bin(n).endsWith('101')],
    'one-zero': ['whose binary form has exactly one 0 (5 is 101)', (n) => bin(n).split('').filter((x) => x === '0').length === 1],
    length: [`whose binary form has exactly ${k} digits (5 is 101: three)`, (n) => bin(n).length === k],
    balanced: ['whose binary form has as many 0s as 1s (9 is 1001)', (n) => {
      const b = bin(n);
      return b.split('').filter((x) => x === '1').length * 2 === b.length;
    }],
    starts111: ['whose binary form starts with 111', (n) => bin(n).startsWith('111')],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a number ${span(lo, hi)} ${words}`, lo, hi, test);
});

family('base-palindromes', 'Palindromes in other bases', 'hard', [
  [3, 3, 10, 99], [3, 4, 200, 399], [3, 5, 600, 999], [3, 6, 100, 199], [3, 7, 1000, 1999],
  [3, 8, 400, 599], [3, 9, 2000, 2999], [3, 2, 3000, 4999], [3, 3, 5000, 6999], [3, 4, 7000, 9999],
] as const, ([d, b, lo, hi]) => {
  const example = String(b * b + 1); // "101" in base b
  return v(
    d,
    `Name a number ${span(lo, hi)} that reads the same backwards when written in base ${b} (${example} is 101 in base ${b})`,
    lo,
    hi,
    (n) => isPalindromeInBase(n, b),
  );
});

const gridCount = (size: number) => (n: number) => {
  let c = 0;
  for (let a = 1; a <= size; a++) if (n % a === 0 && n / a <= size) c++;
  return c;
};

family('times-grid', 'The times-table grid', 'medium', [
  [2, 30, 1], [2, 30, 2], [3, 30, 3], [2, 30, 4], [3, 30, 6],
  [3, 30, 8], [2, 10, 2], [2, 12, 1], [3, 13, 4], [3, 60, 12],
] as const, ([d, size, k]) =>
  v(
    d,
    `Name a number that appears exactly ${k === 1 ? 'once' : `${k} times`} in a ${size} × ${size} times-table grid`,
    1,
    size * size,
    (n) => gridCount(size)(n) === k,
  ));

// ───────────────────────────── Everyday numbers ─────────────────────────────

family('calendar', 'Days of the week', 'medium', [
  [3, 12, 25, 1, 1901, 2000], [3, 12, 25, 2, 1901, 2000], [3, 12, 25, 3, 1901, 2000], [3, 12, 25, 4, 1901, 2000], [3, 12, 25, 5, 1901, 2000],
  [3, 12, 25, 6, 1901, 2000], [3, 12, 25, 0, 1901, 2000], [3, 11, 5, 6, 2001, 2100], [3, 1, 1, 3, 2001, 2100], [3, 2, 14, 0, 2001, 2100],
] as const, ([d, month, day, wd, lo, hi]) => {
  const names: Record<string, string> = { '12-25': 'Christmas Day', '1-1': 'New Year’s Day', '11-5': 'Bonfire Night (5 November)', '2-14': 'Valentine’s Day' };
  const past = hi <= 2026;
  return v(
    d,
    `Name a year from ${lo} to ${hi} when ${names[`${month}-${day}`]} ${past ? 'fell' : 'falls'} on a ${DAY_NAMES[wd]}`,
    lo,
    hi,
    (y) => weekday(y, month, day) === wd,
  );
});

family('clock', 'Clock times', 'easy', [
  [2, 'palin'], [2, 'prime-parts'], [2, 'double'], [2, 'sum20'], [2, 'ascending'],
  [3, 'forty-five'], [2, 'sixty'], [3, 'square'], [3, 'prime'], [2, 'same3'],
] as const, ([d, kind]) => {
  const rules: Record<string, [string, (h: number, m: number, n: number) => boolean]> = {
    palin: ['that reads the same backwards', (_h, _m, n) => isPalindrome(n)],
    'prime-parts': ['where the hours and the minutes are both prime', (h, m) => isPrime(h) && isPrime(m)],
    double: ['where the minutes are exactly double the hours', (h, m) => m === 2 * h],
    sum20: ['whose four digits add up to 20', (_h, _m, n) => digitSum(n) === 20],
    ascending: ['whose four digits go up from left to right', (_h, _m, n) => digitsStrictlyAscending(n)],
    'forty-five': ['where the hours and minutes add up to 45', (h, m) => h + m === 45],
    sixty: ['where the hours and minutes add up to 60', (h, m) => h + m === 60],
    square: ['that, as a four-digit number, is a square number', (_h, _m, n) => isSquare(n)],
    prime: ['that, as a four-digit number, is prime', (_h, _m, n) => isPrime(n)],
    same3: ['with three digits the same', (_h, _m, n) => [...new Set(String(n))].some((c) => String(n).split(c).length - 1 === 3)],
  };
  const [words, test] = rules[kind]!;
  return v(
    d,
    `Name a time from 10:00 to 23:59 (write 13:25 as 1325) ${words}`,
    1000,
    2359,
    (n) => isTime(n) && test(Math.floor(n / 100), n % 100, n),
  );
});

family('timetable', 'Timetables', 'easy', [
  [2, 'bus', 10, 5, 35, 24], [2, 'train', 10, 20, 25, 24], [2, 'ferry', 10, 40, 45, 24], [3, 'bus', 11, 7, 17, 22], [3, 'tram', 10, 3, 13, 20],
  [2, 'train', 12, 15, 40, 24], [3, 'bus', 10, 11, 19, 23], [3, 'coach', 13, 30, 55, 24], [2, 'boat', 10, 0, 75, 24], [3, 'train', 10, 9, 23, 21],
] as const, ([d, what, h, m, every, until]) => {
  const start = h * 60 + m;
  const pad = (x: number) => String(x).padStart(2, '0');
  const end = until === 24 ? 'midnight' : `${until}:00`;
  return v(
    d,
    `A ${what} leaves at ${h}:${pad(m)} and then every ${every} minutes. Name a time it leaves before ${end} (write 13:25 as 1325)`,
    h * 100 + m,
    until * 100 - 1,
    (n) => isTime(n) && minutesOf(n) >= start && minutesOf(n) < until * 60 && (minutesOf(n) - start) % every === 0,
  );
});

family('coins', 'Paying with coins', 'easy', [
  [2, 3, 1, 99], [2, 4, 1, 99], [2, 5, 1, 99], [2, 2, 1, 99], [2, 3, 100, 199],
  [2, 4, 100, 199], [3, 5, 100, 199], [3, 6, 200, 499], [3, 7, 200, 499], [3, 8, 300, 999],
] as const, ([d, k, lo, hi]) => {
  const range = lo <= 1 ? `under £1` : `from ${pounds(lo)} to ${pounds(hi)}`;
  return v(d, `Name an amount ${range}, in pence, where the fewest UK coins that make it exactly is ${k}`, lo, hi, (n) => fewestCoins(n) === k);
});

function pounds(p: number): string {
  return p % 100 === 0 ? `£${p / 100}` : `£${(p / 100).toFixed(2)}`;
}

family('years', 'Years', 'easy', [
  [3, 'divides', 1901, 2099], [2, 'distinct', 1950, 2049], [2, 'sum', 1800, 1999], [2, 'prime', 2000, 2099], [2, 'leap', 1700, 1899],
  [3, 'three-digits', 2000, 2099], [3, 'square-end', 1900, 1999], [3, 'mult-age', 2000, 2099], [2, 'mult13', 1900, 2199], [3, 'ascending', 1000, 2099],
] as const, ([d, kind, lo, hi]) => {
  const rules: Record<string, [string, (y: number) => boolean]> = {
    divides: ['that is divisible by its own last two digits (not 00)', (y) => y % 100 !== 0 && y % (y % 100) === 0],
    distinct: ['with four different digits', (y) => new Set(String(y)).size === 4],
    sum: ['whose digits add up to 20', (y) => digitSum(y) === 20],
    prime: ['that is a prime number', isPrime],
    leap: ['that was a leap year', isLeapYear],
    'three-digits': ['that uses exactly three different digits', (y) => new Set(String(y)).size === 3],
    'square-end': ['whose last two digits make a square number (not 00)', (y) => y % 100 > 0 && isSquare(y % 100)],
    'mult-age': ['that is a multiple of the year’s last digit (not 0)', (y) => y % 10 !== 0 && y % (y % 10) === 0],
    mult13: ['that is a multiple of 13', multipleOf(13)],
    ascending: ['whose digits go up from left to right', digitsStrictlyAscending],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a year from ${lo} to ${hi} ${words}`, lo, hi, test);
});

const canMake = (a: number, b: number) => (n: number) => {
  for (let x = 0; x * a <= n; x++) if ((n - x * a) % b === 0) return true;
  return false;
};

family('stamps', 'Stamps', 'medium', [
  [3, 'cant', 5, 7, 1, 99], [3, 'cant', 4, 9, 1, 99], [3, 'cant', 7, 11, 30, 99], [3, 'cant', 8, 13, 40, 199], [3, 'cant', 9, 10, 40, 199],
  [2, 'can', 6, 9, 20, 99], [2, 'can', 12, 20, 100, 299], [3, 'cant', 11, 13, 60, 199], [2, 'can', 15, 25, 300, 499], [3, 'cant', 6, 11, 20, 99],
] as const, ([d, kind, a, b, lo, hi]) => {
  const ok = canMake(a, b);
  const cant = kind === 'cant';
  return v(
    d,
    `With only ${a}p and ${b}p stamps, name an amount ${span(lo, hi)} pence that you ${cant ? 'can’t' : 'can'} make exactly`,
    lo,
    hi,
    (n) => ok(n) !== cant,
  );
});

const roundTo = (n: number, step: number) => Math.floor(n / step + 0.5) * step;
const roundSf = (n: number, sf: number) => {
  const step = 10 ** (String(n).length - sf);
  return roundTo(n, step);
};

family('rounding', 'Rounding', 'easy', [
  [1, 'two', 300, 100, 250, 50], [1, 'two', 700, 100, 650, 50], [2, 'two', 2000, 1000, 1500, 500], [2, 'two', 600, 100, 550, 50], [2, 'two', 400, 100, 375, 25],
  [2, 'sf', 4000, 1, 3600, 2], [2, 'sf', 900, 1, 870, 2], [3, 'sf', 50000, 1, 46000, 2], [3, 'sf', 7000, 1, 7300, 2], [2, 'two', 1000, 1000, 1200, 100],
] as const, ([d, kind, a, x, b, y]) => {
  if (kind === 'sf') {
    const lo = Math.floor(a / 2);
    return v(
      d,
      `Name a whole number that is ${f(a)} to ${x} significant figure and ${f(b)} to ${y} significant figures`,
      lo,
      a * 2,
      (n) => roundSf(n, x) === a && roundSf(n, y) === b,
    );
  }
  return v(
    d,
    `Name a whole number that rounds to ${f(a)} to the nearest ${f(x)} and to ${f(b)} to the nearest ${f(y)} (halves round up)`,
    Math.max(1, a - x),
    a + x,
    (n) => roundTo(n, x) === a && roundTo(n, y) === b,
  );
});

family('stories', 'Everyday puzzles', 'easy', [
  [1, 'sweets'], [1, 'chairs'], [2, 'speed'], [2, 'eggs'], [2, 'tickets'],
  [2, 'ages'], [2, 'biscuits'], [3, 'pens'], [3, 'league'], [1, 'laps'],
] as const, ([d, kind]) => {
  const both = (a: number, b: number) => (n: number) => {
    for (let x = 1; a * x < n; x++) if ((n - a * x) % b === 0) return true;
    return false;
  };
  const rules: Record<string, [string, number, number, (n: number) => boolean]> = {
    sweets: ['Name a number of sweets under 200 that can be shared equally between 6 children, or equally between 8', 1, 199, multipleOf(24)],
    chairs: ['Chairs are set out in at least 2 equal rows of at least 2. Name a number of chairs from 121 to 170 this works for', 121, 170, (n) => !isPrime(n)],
    speed: ['A car drives 360 miles at a steady whole number of mph, taking a whole number of hours. Name a possible speed under 100 mph', 1, 99, (n) => 360 % n === 0],
    eggs: ['Eggs come in boxes of 6 and 10. Name a number of eggs under 60 you can buy exactly, using at least one of each box', 16, 59, both(6, 10)],
    tickets: ['Tickets cost £7 for adults and £4 for children. Name a total from £60 to £120 for a group with at least one of each', 60, 120, both(7, 4)],
    ages: ['My age is a multiple of 3, and next year it will be a multiple of 4. Name an age under 120 I could be', 1, 119, (n) => n % 3 === 0 && (n + 1) % 4 === 0],
    biscuits: ['Biscuits shared between 4 leave 1 over, and shared between 5 leave 1 over. Name a possible number of biscuits from 2 to 300', 2, 300, (n) => n % 4 === 1 && n % 5 === 1],
    pens: ['Pens cost 35p and pencils cost 20p. Name a total under £3, in pence, for buying at least one of each', 55, 299, both(35, 20)],
    league: ['In a league every team plays every other team twice. Name a possible number of matches under 1,000', 2, 999, (n) => {
      const k = Math.round(Math.sqrt(n));
      return k * (k + 1) === n;
    }],
    laps: ['A running track is 400 m. Name a race distance in metres, under 5,000 m, that is a whole number of laps', 1, 4999, multipleOf(400)],
  };
  const [text, lo, hi, test] = rules[kind]!;
  return v(d, text, lo, hi, test);
});

// ───────────────────────────────── Shapes ─────────────────────────────────

family('polygons', 'Polygons', 'easy', [
  [2, 'interior'], [2, 'exterior'], [3, 'diagonals'], [2, 'angle-sum'], [2, 'prism-edges'],
  [3, 'cube-surface'], [3, 'triangle-angle'], [3, 'all-lines'], [2, 'pyramid-edges'], [3, 'prism-total'],
] as const, ([d, kind]) => {
  const rules: Record<string, [string, number, number, (n: number) => boolean]> = {
    interior: ['Name a whole number of degrees that is the interior angle of a regular polygon', 60, 179, (a) => 360 % (180 - a) === 0],
    exterior: ['Name a whole number of degrees that is the exterior angle of a regular polygon', 1, 120, (a) => 360 % a === 0],
    diagonals: ['Name the number of diagonals a polygon with fewer than 40 sides could have', 2, 702, (n) => {
      for (let s = 4; s < 40; s++) if ((s * (s - 3)) / 2 === n) return true;
      return false;
    }],
    'angle-sum': ['Name a number of degrees that the interior angles of a polygon could add up to, under 6,000°', 180, 5999, (n) => n % 180 === 0],
    'prism-edges': ['Name the number of edges a prism with fewer than 40 faces could have', 9, 111, (n) => n % 3 === 0 && n / 3 + 2 < 40],
    'cube-surface': ['Name the surface area in cm² of a cube with whole-number sides, under 10,000 cm²', 6, 9999, (n) => n % 6 === 0 && isSquare(n / 6)],
    'triangle-angle': ['A triangle has whole-number angles and one angle is 40°. Name a possible size for its largest angle', 70, 139, (a) => a >= 70 && a <= 139],
    'all-lines': ['Every corner of a polygon is joined to every other corner. Name a possible number of lines, under 500', 3, 499, (n) => n >= 3 && isTriangular(n)],
    'pyramid-edges': ['Name the number of edges a pyramid with a polygon base could have, from 200 to 300', 200, 300, (n) => n % 2 === 0],
    'prism-total': ['A prism has F faces, V vertices and E edges. Name a possible value of F + V + E under 200', 1, 199, (n) => (n - 2) % 6 === 0 && (n - 2) / 6 >= 3],
  };
  const [text, lo, hi, test] = rules[kind]!;
  return v(d, text, lo, hi, test);
});

const pythagoreanSides = (max: number) => {
  const out: [number, number, number][] = [];
  for (let a = 1; a <= max; a++)
    for (let b = a; b <= max; b++) {
      const c = Math.round(Math.sqrt(a * a + b * b));
      if (c * c === a * a + b * b && c <= max) out.push([a, b, c]);
    }
  return out;
};

family('pythagoras', 'Right-angled triangles', 'medium', [
  [2, 'hyp', 100, 199], [2, 'leg', 50, 150], [3, 'perim', 400, 700], [3, 'area', 1, 999], [3, 'with', 12, 0],
  [3, 'with', 20, 0], [3, 'with', 24, 0], [3, 'hyp', 200, 399], [3, 'with', 30, 0], [3, 'with', 36, 0],
] as const, ([d, kind, a, b]) => {
  const triples = () => pythagoreanSides(400);
  if (kind === 'with') {
    return v(
      d,
      `A right-angled triangle has whole-number sides, and one side is ${a}. Name a possible length for one of the other sides`,
      1,
      400,
      lazySet(() => triples().filter((t) => t.includes(a)).flatMap((t) => {
        const rest = [...t];
        rest.splice(rest.indexOf(a), 1);
        return rest;
      })),
    );
  }
  const pick: Record<string, [string, (t: [number, number, number]) => number[]]> = {
    hyp: ['the longest side of a right-angled triangle with whole-number sides', (t) => [t[2]]],
    leg: ['a shorter side of a right-angled triangle with whole-number sides', (t) => [t[0], t[1]]],
    perim: ['the perimeter of a right-angled triangle with whole-number sides', (t) => [t[0] + t[1] + t[2]]],
    area: ['the area of a right-angled triangle with whole-number sides', (t) => [(t[0] * t[1]) / 2]],
  };
  const [words, take] = pick[kind]!;
  return v(d, `Name ${words}, ${span(a, b)}`, a, b, lazySet(() => triples().flatMap(take)));
});

family('rectangles', 'Rectangles', 'easy', [
  [2, 'area', 44], [2, 'area', 36], [2, 'area', 40], [2, 'area', 50], [3, 'area', 60],
  [3, 'perim', 120], [3, 'perim', 360], [3, 'perim', 240], [3, 'area', 70], [3, 'perim', 900],
] as const, ([d, kind, k]) => {
  if (kind === 'area') {
    const half = k / 2;
    return v(
      d,
      `A rectangle has whole-number sides and a perimeter of ${k} cm. Name a possible area in cm²`,
      half - 1,
      Math.floor((half / 2) ** 2),
      lazySet(() => Array.from({ length: Math.floor(half / 2) }, (_, i) => (i + 1) * (half - i - 1))),
    );
  }
  return v(
    d,
    `A rectangle has whole-number sides and an area of ${k} cm². Name a possible perimeter in cm`,
    4,
    2 * (k + 1),
    lazySet(() => {
      const out: number[] = [];
      for (let a = 1; a * a <= k; a++) if (k % a === 0) out.push(2 * (a + k / a));
      return out;
    }),
  );
});

family('triangle-sides', 'Triangle sides', 'easy', [
  [1, 'third', 5, 9], [1, 'longest', 9, 14], [2, 'third', 8, 30], [2, 'third', 10, 50], [2, 'third', 12, 75],
  [2, 'longest', 11, 90], [2, 'third', 15, 110], [3, 'third', 6, 140], [3, 'shortest', 200, 380], [3, 'longest', 25, 230],
] as const, ([d, kind, a, b]) => {
  const fits = (n: number) => n > b - a && n < a + b;
  if (kind === 'longest') {
    return v(d, `A triangle’s two shorter sides are ${a} cm and ${b} cm. Name a possible whole-number length for its longest side`, b, a + b - 1, (n) => n >= b && fits(n));
  }
  if (kind === 'shortest') {
    return v(d, `A triangle’s two longer sides are ${a} cm and ${b} cm. Name a possible whole-number length for its shortest side`, 1, a, (n) => n <= a && fits(n));
  }
  return v(d, `A triangle has sides of ${a} cm and ${b} cm. Name a possible whole-number length for the third side`, b - a + 1, a + b - 1, fits);
});

family('countdown', 'Make it from four numbers', 'hard', [
  [3, [2, 3, 5, 7], 51, 100], [3, [3, 4, 8, 9], 101, 200], [3, [1, 4, 6, 9], 201, 400], [3, [2, 3, 9, 25], 401, 700], [3, [2, 4, 7, 75], 701, 1000],
  [3, [1, 5, 9, 50], 1001, 3000], [3, [1, 6, 8, 75], 3001, 10000], [3, [4, 5, 6, 7], 101, 200], [3, [2, 6, 9, 50], 401, 700], [3, [1, 3, 8, 100], 701, 1000],
] as const, ([d, nums, lo, hi]) =>
  v(
    d,
    `Using ${list(nums)} once each, with +, −, × and ÷, make a number between ${f(lo)} and ${f(hi)}`,
    lo,
    hi,
    lazySet(() => reachable(nums)),
  ));

// ─────────────────────────── More number puzzles ───────────────────────────

family('factor-sums', 'Adding up factors', 'hard', [
  [3, 'odd', 200, 399], [3, 'prime', 1, 999], [3, 'square', 1, 299], [3, 'power2', 1, 499], [3, 'triple', 1, 999],
  [3, 'mult7', 1, 99], [3, 'odd', 1000, 1999], [3, 'mult10', 100, 199], [3, 'ends9', 1, 1999], [3, 'mult12', 200, 299],
] as const, ([d, kind, lo, hi]) => {
  const rules: Record<string, [string, (s: number, n: number) => boolean]> = {
    odd: ['add up to an odd number', (s) => s % 2 === 1],
    prime: ['add up to a prime', (s) => isPrime(s)],
    square: ['add up to a square number', (s) => isSquare(s)],
    power2: ['add up to a power of 2', (s, n) => n > 1 && (s & (s - 1)) === 0],
    triple: ['add up to more than three times the number', (s, n) => s > 3 * n],
    mult7: ['add up to a multiple of 7', (s) => s % 7 === 0],
    mult10: ['add up to a multiple of 10', (s) => s % 10 === 0],
    ends9: ['add up to a number ending in 9', (s) => s % 10 === 9],
    mult12: ['add up to a multiple of 12', (s) => s % 12 === 0],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a number ${span(lo, hi)} whose factors (including 1 and itself) ${words}`, lo, hi, (n) => test(sumFactors(n), n));
});

family('neighbours', 'Next-door numbers', 'hard', [
  [3, 'both4', 1, 99], [2, 'twin-middle', 1, 199], [3, 'harshad', 1, 199], [3, 'two-squares', 1, 199], [3, 'same-count', 100, 199],
  [3, 'pal-double', 1, 9999], [3, 'rev7', 1, 9999], [3, 'both6', 1, 999], [3, 'no-primes', 1, 999], [3, 'prime-square', 1, 999],
] as const, ([d, kind, lo, hi]) => {
  const rules: Record<string, [string, (n: number) => boolean]> = {
    both4: ['where n and n + 1 both have exactly 4 factors', (n) => countFactors(n) === 4 && countFactors(n + 1) === 4],
    'twin-middle': ['where n − 1 and n + 1 are both prime', (n) => isPrime(n - 1) && isPrime(n + 1)],
    harshad: ['where n and n + 1 are both divisible by the sum of their digits', (n) => isHarshad(n) && isHarshad(n + 1)],
    'two-squares': ['where n and n + 1 are both the sum of two square numbers (0 not allowed)', (n) => isSumOfTwoSquares(n) && isSumOfTwoSquares(n + 1)],
    'same-count': ['where n and n + 1 have the same number of factors', (n) => countFactors(n) === countFactors(n + 1)],
    'pal-double': ['where n and 2n are both palindromes, and n has at least two digits', (n) => n >= 10 && isPalindrome(n) && isPalindrome(2 * n)],
    rev7: ['where n and n with its digits reversed are different and both multiples of 7', (n) => n % 10 !== 0 && reverseDigits(n) !== n && n % 7 === 0 && reverseDigits(n) % 7 === 0],
    both6: ['where n and n + 1 both have exactly 6 factors', (n) => countFactors(n) === 6 && countFactors(n + 1) === 6],
    'no-primes': ['where none of n, n + 1, n + 2 is prime, and none is a multiple of 4', (n) => [n, n + 1, n + 2].every((x) => x > 1 && !isPrime(x) && x % 4 !== 0)],
    'prime-square': ['where n is prime and n + 1 is a multiple of a square bigger than 1', (n) => isPrime(n) && !isSquareFree(n + 1)],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a number n ${span(lo, hi)} ${words}`, lo, hi, test);
});

family('prime-sums', 'Primes made by adding', 'hard', [
  [3, 'three', 1, 499], [3, 'five', 1, 1999], [3, 'two-three', 1, 499], [3, 'two-squares', 300, 599], [3, 'consec-squares', 1, 1999],
  [3, 'cube-diff', 1, 999], [3, 'digits-prime', 100, 199], [3, 'seven', 1, 2999], [3, 'square-cube', 1, 499], [3, 'tri-plus', 1, 999],
] as const, ([d, kind, lo, hi]) => {
  const rules: Record<string, [string, (n: number) => boolean]> = {
    three: ['that is the sum of three primes in a row (like 5 + 7 + 11)', consecutivePrimeSums(3, hi + 1)],
    five: ['that is the sum of five primes in a row', consecutivePrimeSums(5, hi + 1)],
    seven: ['that is the sum of seven primes in a row', consecutivePrimeSums(7, hi + 1)],
    'two-three': ['that is a power of 2 plus a power of 3 (like 4 + 9)', lazySet(() => geometric(2, 2, 1e4).flatMap((a) => geometric(3, 3, 1e4).map((b) => a + b)))],
    'two-squares': ['that is the sum of two square numbers', isSumOfTwoSquares],
    'consec-squares': ['that is the sum of two square numbers next to each other (like 4 + 9)', (n) => isSquare(2 * n - 1)],
    'cube-diff': ['that is the difference of two cube numbers (0 not allowed)', (n) => {
      for (let b = 1; (b + 1) ** 3 - b ** 3 <= n; b++) if (isCube(n + b ** 3)) return true;
      return false;
    }],
    'digits-prime': ['whose digits add up to a prime', (n) => isPrime(digitSum(n))],
    'square-cube': ['that is a square number plus a cube number (0 not allowed)', (n) => {
      for (let c = 1; c ** 3 < n; c++) if (isSquare(n - c ** 3)) return true;
      return false;
    }],
    'tri-plus': ['that is one more than a triangular number', (n) => isTriangular(n - 1)],
  };
  const [words, test] = rules[kind]!;
  return v(d, `Name a prime ${span(lo, hi)} ${words}`, lo, hi, (n) => isPrime(n) && test(n));
});

family('unit-fractions', 'Unit fractions', 'hard', [
  [3, 6], [3, 10], [3, 14], [3, 15], [3, 21], [3, 22], [3, 26], [3, 33], [3, 35], [3, 39],
] as const, ([d, k]) =>
  v(
    d,
    `Name a whole number a for which 1/a + 1/b = 1/${k}, where b is also a whole number`,
    k + 1,
    k + k * k,
    (a) => a > k && (k * k) % (a - k) === 0,
  ));

family('fraction-windows', 'Fractions between fractions', 'medium', [
  [2, 12, 'over', '¼', '⅓', 1 / 4, 1 / 3], [2, 50, 'under', '⅓', '½', 1 / 3, 1 / 2], [3, 7, 'over', '0.01', '0.02', 0.01, 0.02], [2, 100, 'under', '⅝', '¾', 5 / 8, 3 / 4], [2, 20, 'over', '⅕', '¼', 1 / 5, 1 / 4],
  [3, 9, 'over', '0.05', '0.06', 0.05, 0.06], [2, 120, 'under', '⅞', '1', 7 / 8, 1], [3, 1000, 'under', '0.2', '¼', 0.2, 1 / 4], [3, 3, 'over', '0.01', '0.012', 0.01, 0.012], [2, 9, 'under', '3', '4', 3, 4],
] as const, ([d, k, kind, a, b, lo, hi]) => {
  // Compare with whole-number arithmetic where possible: k/n > lo ⇔ k > lo·n.
  const value = (n: number) => (kind === 'over' ? k / n : n / k);
  const range: [number, number] = kind === 'over' ? [Math.floor(k / hi), Math.ceil(k / lo)] : [Math.floor(lo * k), Math.ceil(hi * k)];
  const shown = kind === 'over' ? `${k}/n` : `n/${k}`;
  const eps = 1e-12;
  return v(d, `Name a whole number n where ${shown} is between ${a} and ${b}`, Math.max(1, range[0]), range[1], (n) => value(n) > lo + eps && value(n) < hi - eps);
});

family('sequence-overlaps', 'Where sequences meet', 'medium', [
  [2, [3, 4], [2, 5], 499], [2, [1, 6], [4, 7], 499], [3, [5, 8], [3, 9], 999], [3, [2, 11], [7, 6], 999], [3, [10, 7], [1, 12], 999],
  [3, [4, 9], [1, 10], 999], [3, [6, 13], [5, 4], 999], [3, [1, 3], [2, 7], 299], [3, [3, 14], [6, 15], 1999], [3, [8, 5], [9, 11], 999],
] as const, ([d, [a1, s1], [a2, s2], hi]) => {
  const seq = (a: number, s: number) => `${a}, ${a + s}, ${a + 2 * s}, ${a + 3 * s}, …`;
  return v(
    d,
    `Name a number under ${f(hi + 1)} that is in both ${seq(a1, s1)} and ${seq(a2, s2)}`,
    Math.max(a1, a2),
    hi,
    (n) => n >= a1 && n >= a2 && (n - a1) % s1 === 0 && (n - a2) % s2 === 0,
  );
});

family('inequalities', 'Inequalities', 'easy', [
  [1, '3n − 7', (n: number) => 3 * n - 7, 50, 100], [2, 'n²', (n: number) => n * n, 1500, 3000], [2, 'n² + n', (n: number) => n * n + n, 3000, 6000],
  [1, '2n + 5', (n: number) => 2 * n + 5, 160, 200], [3, 'n³', (n: number) => n ** 3, 1000000, 3000000], [1, '5n + 3', (n: number) => 5 * n + 3, 1000, 1200],
  [2, '500 − 4n', (n: number) => 500 - 4 * n, -300, -200], [3, 'n² − 10n', (n: number) => n * n - 10 * n, 60000, 90000], [1, 'n ÷ 7', (n: number) => n / 7, 20, 25],
  [3, '2n² + 3n', (n: number) => 2 * n * n + 3 * n, 100, 500],
] as const, ([d, expr, fn, lo, hi]) => {
  const ok = (n: number) => fn(n) > lo && fn(n) < hi;
  let min = 1;
  while (min < 20000 && !ok(min)) min++;
  let max = min;
  while (max < 20000 && ok(max + 1)) max++;
  const shown = (x: number) => f(x).replace('-', '−');
  return v(d, `Name a whole number n where ${expr} is between ${shown(lo)} and ${shown(hi)}`, min, max, ok);
});

family('digit-sum-multiple', 'A multiple of its digit sum', 'hard', [
  [3, 19, 999], [3, 28, 999], [3, 37, 999], [3, 46, 999], [3, 55, 999],
  [3, 73, 1999], [3, 82, 1999], [3, 91, 1999], [3, 109, 2999], [3, 118, 2999],
] as const, ([d, k, hi]) =>
  v(d, `Name a number under ${f(hi + 1)} that is exactly ${k} times the sum of its digits`, 1, hi, (n) => n === k * digitSum(n)));

family('power-runs', 'Powers in a row', 'medium', [
  [2, 2, 2, 1, 999], [2, 2, 3, 1, 1999], [3, 2, 4, 1, 2999], [3, 3, 2, 1, 9999], [3, 3, 3, 1, 29999],
  [3, 'even', 2, 1, 1999], [3, 'odd', 2, 1, 1999], [3, 2, 5, 1, 4999], [3, 2, 2, 1000, 4999], [3, 2, 3, 2000, 9999],
] as const, ([d, power, k, lo, hi]) => {
  const terms = () => {
    const out: number[] = [];
    for (let a = 1; a < 300; a++) {
      let s = 0;
      for (let i = 0; i < k; i++) {
        const base = power === 'even' ? 2 * (a + i) : power === 'odd' ? 2 * (a + i) - 1 : a + i;
        s += base ** (typeof power === 'number' ? power : 2);
      }
      if (s <= hi) out.push(s);
    }
    return out;
  };
  const what =
    power === 'even' ? 'the squares of two even numbers in a row (like 4² + 6²)'
    : power === 'odd' ? 'the squares of two odd numbers in a row (like 3² + 5²)'
    : `${k} ${power === 2 ? 'square' : 'cube'} numbers in a row (like ${Array.from({ length: k }, (_, i) => `${i + 2}${power === 2 ? '²' : '³'}`).join(' + ')})`;
  return v(d, `Name a number ${span(lo, hi)} that is the sum of ${what}`, lo, hi, lazySet(terms), [], terms);
});

family('near-powers', 'Next to a power', 'medium', [
  [2, 2, -1, 9999999], [2, 2, 1, 9999999], [3, 3, -1, 9999999], [3, 3, 1, 9999999], [3, 5, -1, 99999999],
  [3, 5, 1, 99999999], [3, 2, -3, 9999999], [3, 2, 3, 9999999], [3, 7, -1, 99999999], [3, 6, 1, 99999999],
] as const, ([d, b, k, hi]) => {
  const terms = () => geometric(b, b, hi + 3).map((x) => x + k).filter((x) => x >= 1 && x <= hi);
  return v(
    d,
    `Name a number under ${f(hi + 1)} that is ${Math.abs(k)} ${k > 0 ? 'more' : 'less'} than a power of ${b} (${b}, ${b * b}, ${b ** 3}, …)`,
    1,
    hi,
    lazySet(terms),
    [],
    terms,
  );
});

family('equations', 'Equations with whole numbers', 'medium', [
  [2, 'lin', 2, 3, 100], [2, 'lin', 5, 3, 200], [2, 'sum-prod', 30, 200, 0], [3, 'lin', 7, 4, 500], [2, 'prod', 360, 0, 0],
  [3, 'lin', 3, 8, 401], [3, 'squares', 945, 0, 0], [3, 'squares', 3465, 0, 0], [3, 'sum-squares', 5525, 0, 0], [2, 'sum-prod', 100, 2400, 0],
] as const, ([d, kind, a, b, c]) => {
  if (kind === 'lin') {
    return v(d, `Name a whole number x ≥ 1 for which ${a}x + ${b}y = ${c}, where y is also a whole number ≥ 1`, 1, Math.floor((c - b) / a), (x) => c - a * x >= b && (c - a * x) % b === 0);
  }
  if (kind === 'sum-prod') {
    return c === 0
      ? v(d, `x and y are whole numbers with x + y = ${a} and x × y more than ${b}. Name a possible x`, 1, a - 1, (x) => x * (a - x) > b)
      : v(d, `x and y are whole numbers ≥ 1 with x + y = ${a} and x × y less than ${b}. Name a possible x`, 1, a - 1, (x) => x * (a - x) < b);
  }
  if (kind === 'prod') {
    return v(d, `x and y are whole numbers with x × y = ${f(a)} and x smaller than y. Name a possible x`, 1, Math.floor(Math.sqrt(a)), (x) => a % x === 0 && x * x < a);
  }
  if (kind === 'sum-squares') {
    return v(d, `x and y are whole numbers ≥ 1 with x² + y² = ${f(a)}. Name a possible x`, 1, Math.floor(Math.sqrt(a)), (x) => x * x < a && isSquare(a - x * x));
  }
  return v(d, `x and y are whole numbers with x² − y² = ${f(a)}. Name a possible x`, 1, a, (x) => x * x > a && isSquare(x * x - a));
});

family('game-scores', 'Scores in games', 'easy', [
  [2, 'dart'], [2, 'no-dart'], [2, 'trebles'], [2, 'boundaries'], [3, 'snooker-black'],
  [3, 'snooker-pink'], [2, 'basketball'], [2, 'golf'], [2, 'rugby'], [3, 'league'],
] as const, ([d, kind]) => {
  const single = new Set<number>([25, 50]);
  for (let s = 1; s <= 20; s++) [s, 2 * s, 3 * s].forEach((x) => single.add(x));
  const alternating = (colour: number) => (n: number) => n % (colour + 1) === 0 || (n + colour) % (colour + 1) === 0;
  const rules: Record<string, [string, number, number, (n: number) => boolean]> = {
    dart: ['Name a score over 20 you can get with a single dart (singles, doubles and trebles of 1–20, 25 or 50)', 21, 60, (n) => single.has(n)],
    'no-dart': ['Name a score from 1 to 60 you can’t get with a single dart (singles, doubles and trebles of 1–20, 25 or 50)', 1, 60, (n) => !single.has(n)],
    trebles: ['Three darts all land in trebles of 1–20. Name a possible total over 60', 61, 180, (n) => n % 3 === 0],
    boundaries: ['A batter hits exactly 15 boundaries in cricket, each a 4 or a 6. Name a number of runs they scored from them', 60, 90, (n) => n % 2 === 0],
    'snooker-black': ['A snooker break goes red (1), black (7), red, black… starting with a red. Name a possible break under 120', 1, 119, alternating(7)],
    'snooker-pink': ['A snooker break goes red (1), pink (6), red, pink… starting with a red. Name a possible break under 120', 1, 119, alternating(6)],
    basketball: ['A basketball team scores 50 baskets, each worth 2 or 3 points. Name a possible total', 100, 150, () => true],
    golf: ['A golfer plays four rounds, each between 65 and 75 shots. Name a possible total', 260, 300, () => true],
    rugby: ['A rugby team scores exactly 4 times, each worth 3, 5 or 7 points. Name a possible total', 12, 28, (n) => n % 2 === 0],
    league: ['A football team played 38 games and drew exactly 10. With 3 points for a win and 1 for a draw, name a possible points total', 10, 94, (n) => (n - 10) % 3 === 0],
  };
  const [text, lo, hi, test] = rules[kind]!;
  return v(d, text, lo, hi, test);
});

family('dice', 'Dice', 'easy', [
  [1, 'two-product'], [3, 'three-product'], [3, 'four-product'], [2, 'not-two-product'], [2, 'side-by-side'],
  [2, 'sum10'], [3, 'three-squares'], [3, 'sum-product'], [2, 'sum5'], [3, 'two-squares'],
] as const, ([d, kind]) => {
  const faces = [1, 2, 3, 4, 5, 6];
  const products = (k: number) => {
    let s = new Set<number>([1]);
    for (let i = 0; i < k; i++) s = new Set([...s].flatMap((x) => faces.map((y) => x * y)));
    return s;
  };
  const two = lazySet(() => products(2));
  const rules: Record<string, [string, number, number, (n: number) => boolean]> = {
    'two-product': ['Name a number you can get by multiplying the scores on two dice', 1, 36, two],
    'three-product': ['Name a number bigger than 36 you can get by multiplying the scores on three dice', 37, 216, lazySet(() => products(3))],
    'four-product': ['Name a number bigger than 216 you can get by multiplying the scores on four dice', 217, 1296, lazySet(() => products(4))],
    'not-two-product': ['Name a number under 25 that you can’t get by multiplying the scores on two dice', 1, 24, (n) => !two(n)],
    'side-by-side': ['Two dice are put side by side to make a two-digit number (3 and 5 make 35). Name one that is prime', 11, 66, (n) => isPrime(n) && digitsOf(n).every((x) => x >= 1 && x <= 6)],
    sum10: ['Ten dice are rolled. Name a total from 40 to 60 they could make', 40, 60, () => true],
    'three-squares': ['Three dice are rolled. Name a number over 72 you could get by squaring each score and adding them', 73, 108, lazySet(() => faces.flatMap((x) => faces.flatMap((y) => faces.map((z) => x * x + y * y + z * z))))],
    'sum-product': ['Two dice are rolled. Name a possible value of their total multiplied by their product', 2, 432, lazySet(() => faces.flatMap((x) => faces.map((y) => (x + y) * x * y)))],
    sum5: ['Five dice are rolled. Name a total from 21 to 30 they could make', 21, 30, () => true],
    'two-squares': ['Two dice are rolled. Name a number you could get by squaring each score and adding them', 2, 72, lazySet(() => faces.flatMap((x) => faces.map((y) => x * x + y * y)))],
  };
  const [text, lo, hi, test] = rules[kind]!;
  return v(d, text, lo, hi, test);
});

family('digit-counting', 'Counting digits', 'easy', [
  [2, 'two-kinds', 1000, 9999], [2, 'two-sevens', 1, 999], [2, 'max3', 10000, 99999], [2, 'odd-distinct', 100, 999], [3, 'distinct-sum10', 100, 999],
  [3, 'one-and-two', 100, 9999], [2, 'all-same-but-one', 1000, 9999], [3, 'zero-count', 10000, 99999], [3, 'pairs', 1000, 9999], [2, 'no-1-2-3', 10000, 99999],
] as const, ([d, kind, lo, hi]) => {
  const count = (n: number, x: string) => String(n).split(x).length - 1;
  const rules: Record<string, [string, (n: number) => boolean]> = {
    'two-kinds': ['that uses exactly three different digits (like 1231)', (n) => new Set(String(n)).size === 3],
    'two-sevens': ['that contains exactly two 7s', (n) => count(n, '7') === 2],
    max3: ['with no digit bigger than 3', (n) => digitsOf(n).every((x) => x <= 3)],
    'odd-distinct': ['whose digits are all odd and all different', (n) => digitsOf(n).every((x) => x % 2 === 1) && new Set(String(n)).size === 3],
    'distinct-sum10': ['whose digits are all different and add up to 10', (n) => new Set(String(n)).size === 3 && digitSum(n) === 10],
    'one-and-two': ['that contains exactly one 1 and exactly one 2', (n) => count(n, '1') === 1 && count(n, '2') === 1],
    'all-same-but-one': ['with three digits the same and one different', (n) => [...new Set(String(n))].some((c) => count(n, c) === 3)],
    'zero-count': ['that contains exactly three 0s', (n) => count(n, '0') === 3],
    pairs: ['made of two pairs of matching digits (like 1221 or 3434)', (n) => {
      const counts = [...new Set(String(n))].map((c) => count(n, c));
      return counts.length === 2 && counts.every((c) => c === 2);
    }],
    'no-1-2-3': ['that doesn’t use the digits 1, 2 or 3', (n) => !/[123]/.test(String(n))],
  };
  const [words, test] = rules[kind]!;
  const what = lo === 1000 && hi === 9999 ? 'four-digit number' : lo === 100 && hi === 999 ? 'three-digit number' : lo === 10000 ? 'five-digit number' : `number ${span(lo, hi)}`;
  return v(d, `Name a ${what} ${words}`, lo, hi, test);
});

family('simplify-fractions', 'Simplifying fractions', 'medium', [
  [2, 60, 5, 1, 299], [2, 100, 4, 1, 599], [3, 48, 3, 1, 399], [3, 126, 9, 300, 799], [2, 72, 8, 1, 199],
  [3, 120, 8, 200, 599], [3, 200, 25, 400, 999], [3, 105, 15, 1, 299], [3, 130, 13, 300, 599], [3, 90, 10, 600, 999],
] as const, ([d, den, target, lo, hi]) =>
  v(
    d,
    `Name a number n ${span(lo, hi)} where the fraction n/${den} simplifies to a fraction with ${target} on the bottom`,
    lo,
    hi,
    (n) => den / gcd(n, den) === target,
  ));

family('surds', 'Simplifying square roots', 'hard', [
  [3, 'coef', 2, 1, 199], [3, 'coef', 3, 1, 499], [3, 'coef', 5, 1, 999], [3, 'root', 2, 1, 999], [3, 'root', 3, 1, 999],
  [3, 'root', 5, 1, 1999], [3, 'root', 6, 1, 1999], [3, 'root', 7, 1, 2999], [3, 'coef', 4, 200, 999], [3, 'root', 10, 1, 4999],
] as const, ([d, kind, k, lo, hi]) => {
  /** √n = a√b with b square-free: returns [a, b]. */
  const simplify = (n: number): [number, number] => {
    let a = 1;
    let b = n;
    for (let p = 2; p * p <= b; p++) while (b % (p * p) === 0) {
      a *= p;
      b /= p * p;
    }
    return [a, b];
  };
  if (kind === 'coef') {
    return v(d, `Name a number n ${span(lo, hi)} where √n simplifies to ${k}√b (b a whole number bigger than 1)`, lo, hi, (n) => {
      const [a, b] = simplify(n);
      return a === k && b > 1;
    });
  }
  return v(d, `Name a number n ${span(lo, hi)} where √n simplifies to a√${k} (a a whole number bigger than 1)`, lo, hi, (n) => {
    const [a, b] = simplify(n);
    return b === k && a > 1;
  });
});

family('power-last-digits', 'Last digits of powers', 'medium', [
  [2, 2, 6, 1, 49], [2, 3, 7, 50, 100], [2, 7, 3, 101, 150], [3, 8, 2, 151, 200], [2, 4, 6, 201, 250],
  [2, 9, 9, 251, 300], [3, 2, 8, 301, 350], [3, 3, 9, 351, 400], [3, 7, 1, 401, 450], [3, 13, 7, 451, 500],
] as const, ([d, b, end, lo, hi]) => {
  const lastDigit = (n: number) => {
    let r = 1;
    for (let i = 0; i < n; i++) r = (r * b) % 10;
    return r;
  };
  return v(d, `Name a whole number n ${span(lo, hi)} where ${b}ⁿ ends in ${end}`, lo, hi, (n) => lastDigit(n) === end);
});

// ───────────────────────────────── The bank ─────────────────────────────────

export const FAMILIES: readonly Family[] = FAMILY_LIST;
export const PROMPTS: readonly Prompt[] = FAMILY_LIST.flatMap((x) => x.prompts);

const BY_ID = new Map(PROMPTS.map((x) => [x.id, x]));

/** True if the id belongs to a question in the current bank. */
export function hasPrompt(id: string): boolean {
  return BY_ID.has(id);
}

const retired = new Map<string, Prompt>();

/**
 * A question by id. Ids from an older version of the bank (still in a database's
 * history) come back as a "retired" stand-in rather than crashing the page.
 */
export function getPrompt(id: string): Prompt {
  const found = BY_ID.get(id);
  if (found) return found;
  let stand = retired.get(id);
  if (!stand) {
    stand = {
      id,
      family: 'retired',
      text: 'A question from an earlier version of the game',
      difficulty: 1,
      min: 0,
      max: 1_000_000,
      validator: () => false,
      cleverList: [],
    };
    retired.set(id, stand);
  }
  return stand;
}
