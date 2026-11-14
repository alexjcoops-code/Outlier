import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { FAMILIES, PROMPTS, getPrompt, hasPrompt, isValidAnswer, validAnswers } from '../../src/prompts.ts';
import {
  collatzSteps,
  fewestCoins,
  goldbachWays,
  letterCount,
  numberName,
  reachable,
  romanNumeral,
  weekday,
} from '../../src/lib/maths.ts';

// Hand-checked answers for the first question of every family: [valid, invalid].
// Invalid lists include near-misses and numbers outside the allowed range.
const CASES: Record<string, [number[], number[]]> = {
  'prime-between-01': [[2, 3, 29, 47], [1, 9, 27, 49, 53]],
  'prime-ending-01': [[11, 31, 41, 61, 211, 281], [13, 21, 51, 91, 111, 311]],
  'prime-digit-sum-01': [[7, 43, 61, 151, 223, 241, 313, 331, 421, 601], [11, 401, 701, 16, 25, 34, 52, 70, 106, 1033]],
  'prime-remainder-01': [[5, 13, 17, 29, 37, 41, 53, 61, 73, 89, 97], [1, 7, 9, 21, 101]],
  'prime-pairs-01': [[3, 5, 11, 17, 29, 41, 59, 71, 101, 107, 137], [2, 7, 13, 23, 179]],
  'prime-linked-01': [[2, 3, 5, 11, 23, 29, 41, 53, 83, 89, 113, 131, 173, 179, 191], [7, 13, 17, 19, 233]],
  'prime-reversed-01': [[13, 17, 31, 37, 71, 73, 79, 97, 107, 113, 149, 157, 167, 179, 199], [11, 19, 23, 43, 101, 131]],
  'prime-near-square-01': [[2, 5, 17, 37, 101, 197, 257, 401, 577, 677, 1297, 1601], [3, 7, 10, 26, 82]],
  'prime-times-01': [[4, 6, 10, 14, 94], [2, 8, 12, 98, 106]],
  'largest-factor-01': [[3, 6, 9, 12, 18, 24, 27, 36, 48, 54, 72, 81, 96, 108, 144, 162, 192], [1, 2, 8, 15, 30, 243]],
  'smallest-factor-01': [[3, 9, 15, 21, 27, 33, 39, 45, 51, 57, 63, 69, 75, 81, 87, 93, 99], [1, 6, 12, 25, 35, 49, 105]],
  'semiprimes-01': [[6, 10, 14, 15, 21, 22, 26, 33, 34, 35, 38, 39, 46], [4, 9, 12, 25, 30, 49, 51]],
  'goldbach-01': [[10, 14, 16, 18, 20], [8, 11, 12, 22, 102]],
  'prime-runs-01': [[5, 8, 12, 18, 24, 30, 36, 42, 52, 60], [4, 6, 10, 14, 16, 20]],
  'prime-gaps-01': [[3, 5, 11, 17, 29, 41, 59, 71, 101, 107, 137, 149, 179, 191, 197], [2, 7, 13, 23, 199]],
  'reverse-sums-01': [[18, 27, 36, 45, 54, 63, 72, 81], [9, 19, 90, 99, 108]],
  'multiples-01': [[6, 12, 96], [0, 3, 50, 100, 102]],
  'common-multiples-01': [[12, 24, 132, 144], [0, 6, 18, 30, 156]],
  'multiple-but-not-01': [[5, 15, 95], [7, 10, 20, 100, 105]],
  'remainders-01': [[2, 7, 12, 97], [3, 10, 99, 102]],
  'double-remainders-01': [[7, 22, 37, 52, 67, 82, 97, 112, 127, 142, 157, 172, 187], [2, 4, 12, 17, 202]],
  'factors-01': [[1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 96], [5, 7, 9, 18, 36, 192]],
  'factor-count-01': [[4, 9, 25, 49, 121, 169, 289, 361, 529, 841, 961], [1, 8, 16, 36, 1369]],
  'hcf-01': [[4, 20, 28, 44, 52, 68, 76, 92], [2, 8, 12, 16, 24, 36]],
  'coprime-01': [[101, 103, 107, 109, 113, 119, 121, 127, 131, 133, 137, 139, 143, 149], [97, 100, 102, 105, 111, 125, 151]],
  'abundant-01': [[12, 18, 20, 24, 30, 36, 40, 42, 48], [6, 10, 16, 28, 54]],
  'divides-leaving-01': [[6, 8, 12, 16, 24, 32, 48, 96], [2, 3, 4, 5, 100]],
  'linear-multiple-01': [[4, 11, 18, 95], [1, 5, 7, 102]],
  'mean-whole-01': [[2, 5, 8, 98], [1, 3, 6, 99, 101]],
  'ratios-01': [[5, 10, 95], [4, 12, 99, 100]],
  'percentages-01': [[20, 40, 380], [10, 15, 30, 400]],
  'squares-01': [[1, 4, 81], [2, 50, 99, 100]],
  'square-endings-01': [[1, 9, 11, 19, 21, 99], [3, 10, 13, 101]],
  'near-squares-01': [[3, 8, 15, 24, 99, 483], [1, 4, 9, 16, 528]],
  'powers-01': [[2, 4, 512], [1, 6, 100, 1024]],
  'square-starts-01': [[1, 4, 10, 13, 32, 44, 100], [2, 5, 15, 999]],
  'cubes-01': [[1, 8, 343, 729], [9, 100, 1000]],
  'linear-square-01': [[4, 12, 24, 40, 180], [1, 3, 8, 220]],
  'roots-01': [[50, 63], [49, 64, 70]],
  'power-sums-01': [[2, 5, 8, 10, 13, 25, 50, 98], [1, 3, 6, 7, 21, 99]],
  'special-squares-01': [[49, 196, 441, 9604], [7, 14, 64, 9801, 12544]],
  'times-window-01': [[17, 25, 33], [16, 34, 50]],
  'figurate-01': [[2, 6, 12, 20, 30, 42, 56, 72, 90, 110, 992], [1, 4, 10, 24, 1056]],
  'triangular-01': [[1, 3, 6, 10, 15, 21, 28, 36, 45], [2, 4, 9, 50, 55]],
  'consecutive-products-01': [[2, 6, 20, 992], [4, 8, 1056]],
  'fib-like-01': [[1, 2, 3, 5, 8, 13, 21, 34, 6765], [4, 6, 7, 10946]],
  'arith-sequences-01': [[7, 18, 29, 40, 491], [6, 11, 30, 502]],
  'geom-sequences-01': [[3, 6, 12, 24, 48, 96, 3145728, 6291456], [9, 18, 36, 12582912]],
  'consecutive-sums-01': [[3, 5, 99], [1, 2, 4, 100]],
  'collatz-01': [[17, 96], [1, 3, 6, 7]],
  'digit-chains-01': [[25, 26, 29], [5, 10, 39, 77]],
  'digit-sum-01': [[5, 14, 41, 104, 500], [6, 15, 55, 1004]],
  'digit-product-01': [[26, 34, 43, 62, 126, 134, 223, 322], [1, 3, 12, 27]],
  'digit-squares-01': [[5, 34, 43, 50, 304, 340, 403, 430, 500], [7, 12, 25, 205]],
  'palindromes-01': [[101, 111, 252, 292], [99, 120, 300, 303]],
  'palindrome-multiples-01': [[111, 141, 171, 252, 999], [99, 121, 131, 1001]],
  'digit-perms-01': [[1234, 2413, 4321], [123, 1123, 1235, 12345]],
  'digit-perms-plus-01': [[12376, 13276, 67312, 76312], [1236, 12367, 12673, 123676]],
  'only-digits-01': [[1, 10, 11, 111, 1001, 1111], [2, 12, 21, 10001]],
  'digit-order-01': [[123, 159, 789], [99, 122, 321, 1234]],
  'digit-rules-01': [[101, 110, 532, 945, 990], [100, 123, 999]],
  'reversal-01': [[102, 112, 192, 899], [100, 101, 120, 201]],
  'self-divisible-01': [[11, 12, 15, 22, 24, 36, 48, 99], [10, 13, 14, 25, 100]],
  'multiple-digit-sum-01': [[28, 91, 217, 406], [14, 19, 37, 1009]],
  'sum-vs-product-01': [[22, 123, 321, 1124, 2114], [1, 11, 33, 124]],
  'number-words-01': [[13, 14, 18, 19, 41, 51, 61], [1, 17, 21, 70]],
  'roman-01': [[3, 7, 12, 14, 30, 41], [1, 4, 8, 38]],
  'binary-01': [[3, 5, 6, 9, 10, 12, 768], [1, 4, 7, 15, 1024]],
  'base-palindromes-01': [[10, 13, 16, 20, 23, 26, 28, 40], [9, 11, 12, 27]],
  'times-grid-01': [[1, 49, 256, 841, 900], [2, 4, 36, 899]],
  'calendar-01': [[1978, 1989, 1995, 2000], [1990, 1999, 2001]],
  'clock-01': [[1001, 1111, 1221, 1331, 2002, 2332], [959, 1010, 1661, 2442]],
  'timetable-01': [[1005, 1040, 1115, 1300, 2330], [1000, 1006, 1035, 1060, 2400]],
  'coins-01': [[8, 9, 13, 17, 80], [1, 4, 20, 30, 88]],
  'years-01': [[1904, 1950, 2001, 2002, 2004, 2005, 2008, 2010, 2016, 2020, 2025, 2040, 2050], [1999, 2000, 2003, 2024]],
  'stamps-01': [[1, 2, 3, 4, 6, 8, 9, 11, 13, 16, 18, 23], [5, 7, 10, 12, 14, 24, 99]],
  'rounding-01': [[250, 262, 274], [249, 275, 300]],
  'stories-01': [[24, 48, 192], [6, 8, 12, 216]],
  'polygons-01': [[60, 90, 108, 120, 135, 179], [59, 100, 130, 145, 180]],
  'pythagoras-01': [[100, 101, 102, 125, 130, 169], [99, 103, 107, 127, 199]],
  'rectangles-01': [[21, 40, 121], [20, 44, 100, 122]],
  'triangle-sides-01': [[5, 13], [4, 14]],
  'countdown-01': [[60, 72, 73], [50, 101, 210]],
  'factor-sums-01': [[200, 225, 242, 256, 289], [201, 210, 300]],
  'neighbours-01': [[14, 21, 26, 33, 34, 38], [1, 10, 15, 20]],
  'prime-sums-01': [[23, 31, 41, 59, 71, 83], [2, 10, 15, 29, 49]],
  'unit-fractions-01': [[7, 8, 9, 10, 12, 15, 18, 24, 42], [6, 11, 13, 14, 16, 43]],
  'fraction-windows-01': [[37, 47], [36, 48]],
  'sequence-overlaps-01': [[7, 27, 47, 487], [2, 3, 17, 507]],
  'inequalities-01': [[20, 35], [19, 36]],
  'digit-sum-multiple-01': [[114, 133, 152, 171, 190, 209, 228, 399], [19, 38, 95, 1000]],
  'power-runs-01': [[5, 13, 25, 41, 925], [1, 2, 10, 20, 1013]],
  'near-powers-01': [[1, 3, 7, 15, 31, 1023, 8388607], [2, 5, 1024, 16777215]],
  'equations-01': [[2, 5, 47], [1, 3, 48, 50]],
  'game-scores-01': [[21, 22, 25, 40, 50, 51, 57, 60], [23, 29, 31, 59, 61]],
  'dice-01': [[1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 25, 30, 36], [7, 11, 13, 14, 17, 19, 21, 22, 35]],
  'digit-counting-01': [[1123, 1231, 2021, 9907], [123, 1111, 1122, 1234]],
  'simplify-fractions-01': [[12, 24, 36, 48, 72, 84], [6, 15, 30, 60, 120]],
  'surds-01': [[8, 12, 20, 24, 28, 40, 44, 52, 56, 60, 188], [2, 4, 16, 18, 32]],
  'power-last-digits-01': [[4, 8, 48], [1, 2, 6, 10, 52]],
};

const overlap = (a: readonly number[], b: readonly number[]) => {
  const B = new Set(b);
  return a.filter((x) => B.has(x)).length / Math.max(1, Math.min(a.length, b.length));
};

describe('prompt bank', () => {
  it('has 100 question types with 10 questions each, 1,000 in all', () => {
    expect(FAMILIES).toHaveLength(100);
    for (const f of FAMILIES) expect(f.prompts, f.id).toHaveLength(10);
    expect(PROMPTS).toHaveLength(1000);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(1000);
    expect(new Set(FAMILIES.map((f) => f.id)).size).toBe(100);
  });

  it('labels every question with its family', () => {
    for (const f of FAMILIES) {
      f.prompts.forEach((p, i) => {
        expect(p.family).toBe(f.id);
        expect(p.id).toBe(`${f.id}-${String(i + 1).padStart(2, '0')}`);
      });
    }
  });

  it('has enough of each difficulty for three easy, three medium and one hard a day', () => {
    const count = (d: number) => PROMPTS.filter((p) => p.difficulty === d).length;
    expect(count(1)).toBeGreaterThanOrEqual(350);
    expect(count(2)).toBeGreaterThanOrEqual(350);
    expect(count(3)).toBeGreaterThanOrEqual(150);
    // Spread across families too, so the family rule can't starve a slot.
    for (const d of [1, 2, 3]) {
      const families = new Set(PROMPTS.filter((p) => p.difficulty === d).map((p) => p.family));
      expect(families.size, `difficulty ${d}`).toBeGreaterThanOrEqual(80);
    }
  });

  it('has hand-checked cases for the first question of every family', () => {
    expect(Object.keys(CASES).sort()).toEqual(FAMILIES.map((f) => f.prompts[0]!.id).sort());
  });

  it('uses proper maths notation, never ^ or *, and keeps questions short enough to read in time', () => {
    for (const p of PROMPTS) {
      expect(p.text, p.id).not.toMatch(/[\^*]/);
      // No "<=" and no "x" as a times sign ("3 x 4"); x as an unknown is fine.
      expect(p.text, p.id).not.toMatch(/<=|>=|\d\s*x\s*\d/);
      expect(p.text.length, p.id).toBeLessThanOrEqual(135);
    }
  });

  it('gives every question at least 8 valid answers, all inside its range', () => {
    for (const p of PROMPTS) {
      const all = validAnswers(p);
      expect(all.length, p.id).toBeGreaterThanOrEqual(8);
      expect(all[0]!, p.id).toBeGreaterThanOrEqual(p.min);
      expect(all[all.length - 1]!, p.id).toBeLessThanOrEqual(p.max);
    }
  });

  it('finds the same answers by scanning as by listing candidates', () => {
    for (const p of PROMPTS.filter((x) => x.candidates)) {
      // Spot-check the scan on the part of the range a scan can afford.
      const top = Math.min(p.max, p.min + 200_000);
      const scanned: number[] = [];
      for (let n = p.min; n <= top; n++) if (p.validator(n)) scanned.push(n);
      expect(validAnswers(p).filter((n) => n <= top), p.id).toEqual(scanned);
    }
  });

  it('gives questions in the same family different answers', () => {
    // Yesterday's rare answer to a sibling question should mostly not work today.
    for (const f of FAMILIES) {
      const sets = f.prompts.map(validAnswers);
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          expect(overlap(sets[i]!, sets[j]!), `${f.prompts[i]!.id} vs ${f.prompts[j]!.id}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('keeps every clever-list number valid for its prompt', () => {
    for (const p of PROMPTS) {
      for (const n of p.cleverList) expect(isValidAnswer(p, n), `${p.id}: ${n}`).toBe(true);
      // The clever list must never swallow the whole answer set.
      expect(p.cleverList.length, p.id).toBeLessThan(validAnswers(p).length);
    }
  });

  it('rejects non-integers and unsafe numbers everywhere', () => {
    for (const p of PROMPTS) {
      expect(isValidAnswer(p, 2.5), p.id).toBe(false);
      expect(isValidAnswer(p, NaN), p.id).toBe(false);
      expect(isValidAnswer(p, -4), p.id).toBe(false);
      expect(isValidAnswer(p, Infinity), p.id).toBe(false);
    }
  });

  it('keeps docs/questions.md in step with the bank', () => {
    const run = () => execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/list-questions.ts', '--check'], { stdio: 'pipe' });
    expect(run).not.toThrow();
  });

  it('turns ids from an older bank into a retired stand-in instead of crashing', () => {
    expect(hasPrompt('prime-u1000')).toBe(false);
    const old = getPrompt('prime-u1000');
    expect(old.family).toBe('retired');
    expect(old.text).toMatch(/earlier version/);
    expect(isValidAnswer(old, 7)).toBe(false);
  });
});

describe('validators', () => {
  for (const [id, [valid, invalid]] of Object.entries(CASES)) {
    it(id, () => {
      const p = getPrompt(id);
      for (const n of valid) expect(isValidAnswer(p, n), `${n} should be valid`).toBe(true);
      for (const n of invalid) expect(isValidAnswer(p, n), `${n} should be invalid`).toBe(false);
    });
  }
});

describe('maths helpers behind the new questions', () => {
  it('writes Roman numerals', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(romanNumeral)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV', 'MMMCMXCIX']);
    expect(romanNumeral(0)).toBe('');
  });

  it('names numbers in British English', () => {
    expect(numberName(0)).toBe('zero');
    expect(numberName(42)).toBe('forty-two');
    expect(numberName(102)).toBe('one hundred and two');
    expect(numberName(1005)).toBe('one thousand and five');
    expect(numberName(2345)).toBe('two thousand three hundred and forty-five');
    expect(letterCount(42)).toBe(8);
    expect(letterCount(102)).toBe(16);
  });

  it('counts Collatz steps', () => {
    expect([1, 2, 3, 6, 7, 27].map(collatzSteps)).toEqual([0, 1, 7, 8, 16, 111]);
  });

  it('pays with the fewest UK coins', () => {
    expect([1, 3, 8, 88, 99, 100, 388].map((n) => fewestCoins(n))).toEqual([1, 2, 3, 6, 6, 1, 8]);
  });

  it('knows the day of the week', () => {
    expect(weekday(2000, 12, 25)).toBe(1); // Monday
    expect(weekday(2026, 11, 13)).toBe(5); // Friday
    expect(weekday(1969, 7, 20)).toBe(0); // Sunday
  });

  it('counts the ways to split an even number into two primes', () => {
    expect([4, 8, 10, 12, 22, 100].map(goldbachWays)).toEqual([1, 1, 2, 1, 3, 6]);
  });

  it('finds what four numbers make with +, −, × and ÷', () => {
    const made = reachable([2, 3, 5, 7]);
    expect(made.has(210)).toBe(true); // 2 × 3 × 5 × 7
    expect(made.has(17)).toBe(true); // 2 + 3 + 5 + 7
    expect(made.has(1)).toBe(true); // (7 − 5) − (3 − 2)
    expect(made.has(211)).toBe(false); // more than the biggest possible
    expect([...reachable([4])]).toEqual([4]);
  });
});
