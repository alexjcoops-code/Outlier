import { describe, expect, it } from 'vitest';
import { PROMPTS, getPrompt, isValidAnswer, validAnswers } from '../../src/prompts.ts';

// Known answers for every prompt: [valid, invalid]. Invalid lists include
// near-misses and out-of-range numbers that have the property.
const CASES: Record<string, [number[], number[]]> = {
  'prime-u1000': [[2, 97, 683, 997], [1, 0, 91, 999, 1009, 561]],
  'prime-u100': [[2, 3, 53, 97], [1, 51, 57, 87, 91, 101]],
  'square-u1000': [[1, 4, 144, 961], [0, 2, 1000, 1024, 143]],
  'square-3digit': [[100, 121, 529, 961], [81, 64, 1024, 200, 99]],
  'cube-u10000': [[1, 8, 343, 9261], [9, 100, 10648, 16]],
  'pow2-u10000': [[2, 4, 1024, 8192], [1, 6, 1000, 16384, 0]],
  'mult7-u200': [[7, 49, 91, 196], [0, 1, 50, 203, 27]],
  'mult7-500-700': [[504, 595, 700], [497, 500, 707, 600]],
  'mult8-u300': [[8, 64, 296], [0, 4, 300, 304, 100]],
  'mult9-u500': [[9, 81, 495], [0, 3, 504, 100]],
  'mult11-u1000': [[11, 121, 990], [0, 111, 1001, 1]],
  'mult12-u500': [[12, 144, 492], [6, 100, 504, 18]],
  'mult13-u500': [[13, 91, 494], [1, 100, 507, 93]],
  'mult14-u300': [[14, 98, 294], [7, 21, 308, 100]],
  'mult15-u1000': [[15, 225, 990], [5, 3, 1005, 100]],
  'mult16-u500': [[16, 256, 496], [8, 100, 512, 24]],
  'mult19-u1000': [[19, 361, 988], [9, 100, 1007, 29]],
  'mult25-u1000': [[25, 100, 975], [5, 10, 1000, 1025, 110]],
  'mult50-u2000': [[50, 1000, 1950], [25, 10, 2000, 2050, 175]],
  'mult99-u2000': [[99, 1089, 1980], [9, 999, 2079, 100]],
  'mult101-u5000': [[101, 1111, 4949], [1, 1001, 5050, 111]],
  'mult3-50-150': [[51, 99, 150], [48, 50, 153, 100]],
  'mult4-100-200': [[100, 144, 200], [96, 102, 204, 150]],
  'mult3and4-u100': [[12, 48, 96], [6, 9, 16, 108, 30]],
  'odd-mult5-u500': [[5, 125, 495], [10, 50, 505, 7]],
  'factor-60': [[1, 4, 15, 60], [0, 7, 8, 9, 120]],
  'factor-72': [[1, 8, 9, 72], [0, 5, 7, 16, 144]],
  'factor-96': [[1, 3, 32, 96], [0, 5, 9, 36, 192]],
  'factor-120': [[1, 8, 24, 120], [0, 7, 9, 16, 240]],
  'factor-144': [[1, 9, 16, 144], [0, 5, 10, 32, 288]],
  'factor-360': [[1, 8, 45, 360], [0, 7, 16, 25, 720]],
  'factor-1000': [[1, 8, 125, 1000], [0, 3, 16, 75, 2000]],
  'palindrome-3digit': [[101, 252, 999], [11, 100, 123, 1001, 9]],
  'palindrome-4digit': [[1001, 2332, 9999], [999, 1010, 1234, 10001]],
  'repdigit-2': [[11, 55, 99], [1, 10, 12, 111]],
  'repdigit-3': [[111, 555, 999], [11, 110, 121, 1111]],
  'digitsum-5': [[5, 14, 500, 221], [6, 15, 1004, 0]],
  'digitsum-7-u100': [[7, 16, 70, 43], [8, 17, 106, 0]],
  'digitsum-9': [[9, 18, 900, 333], [19, 99, 1008, 0]],
  'digitsum-10': [[19, 55, 910, 235], [10, 100, 1009, 29]],
  'ascending-3digit': [[123, 258, 789], [122, 321, 12, 1234, 100]],
  'consecutive-3digit': [[123, 345, 543, 210, 987], [135, 124, 12, 1234, 12, 890]],
  'digits-differ-1': [[10, 12, 21, 98], [11, 13, 9, 101]],
  'pow3-u100000': [[3, 9, 729, 59049], [1, 6, 177147, 12]],
  'even-square-u2000': [[4, 16, 1936], [1, 9, 8, 2116, 2]],
  'prime-100-200': [[101, 127, 199], [97, 100, 111, 119, 121, 143, 211]],
  'prime-ends-7': [[7, 17, 97, 197], [27, 57, 77, 87, 117, 187, 227]],
  'prime-ends-9': [[19, 29, 199], [9, 39, 49, 119, 169, 229]],
  'prime-1mod4': [[5, 13, 97], [1, 3, 7, 9, 21, 101]],
  'twin-prime-u200': [[3, 5, 7, 11, 13, 29, 31, 197, 199], [2, 23, 37, 9, 15, 227]],
  'prime-odd-digits': [[3, 13, 37, 113, 991], [2, 23, 15, 101, 1117]],
  'semiprime-u100': [[6, 15, 35, 91], [4, 9, 12, 30, 7, 106]],
  'four-factors-u100': [[6, 8, 27, 15], [4, 12, 16, 2, 106]],
  'odd-composite-u100': [[9, 15, 91, 99], [1, 3, 10, 97, 105]],
  'triangular-u500': [[1, 3, 55, 496], [2, 4, 100, 528]],
  'even-triangular-u1000': [[6, 10, 496, 990], [1, 3, 8, 1128, 15]],
  'fibonacci-u10000': [[1, 2, 89, 6765], [4, 6, 100, 10946, 0]],
  'factorial-u1000000': [[1, 2, 24, 362880], [3, 4, 100, 3628800]],
  'pow4-u100000': [[4, 16, 1024, 65536], [1, 2, 8, 32, 262144]],
  'pow5-u1000000': [[5, 25, 3125, 390625], [1, 10, 100, 1953125]],
  'mersenne-u1000': [[1, 3, 127, 511], [2, 4, 9, 1023, 0]],
  'square-1000-5000': [[1024, 2025, 4900], [961, 1000, 5041, 2000]],
  'square-ends-9': [[9, 49, 1089, 4489], [19, 29, 5329, 81]],
  'square-ends-25': [[25, 625, 9025], [125, 50, 11025, 36]],
  'odd-cube-u10000': [[1, 27, 9261], [8, 9, 64, 12167]],
  'cube-plus-1': [[2, 9, 730], [1, 8, 10, 1001]],
  'square-minus-1': [[3, 8, 99, 483], [0, 4, 9, 528, 100]],
  'double-is-square': [[2, 8, 50, 968], [1, 4, 16, 1058, 100]],
  'n2-ends-6': [[4, 6, 14, 196], [2, 8, 5, 10, 204]],
  'sum-two-squares-u100': [[2, 5, 25, 98], [1, 3, 4, 9, 21, 101]],
  'sum-3-consecutive': [[6, 9, 99], [3, 7, 10, 102]],
  'leap-year': [[1904, 2000, 2024, 2096], [1900, 2100, 2023, 2026, 1896, 2104]],
  'mult6and8-u500': [[24, 48, 480], [6, 8, 12, 36, 504]],
  'mult9and12-u500': [[36, 108, 468], [9, 12, 18, 24, 504]],
  'mult4and14-u500': [[28, 56, 476], [4, 14, 42, 504]],
  'mult7and11-u1000': [[77, 154, 924], [7, 11, 70, 1001]],
  'mult17-u500': [[17, 289, 493], [7, 27, 100, 510]],
  'mult37-3digit': [[111, 148, 999], [37, 74, 100, 1036]],
  'mult7-ends-7': [[7, 77, 147, 497], [17, 27, 70, 567]],
  'mod5-1': [[1, 6, 196, 101], [0, 5, 2, 201, 206]],
  'mod7-2': [[2, 9, 93], [7, 1, 14, 100]],
  'mod9-5': [[5, 14, 293], [9, 4, 6, 302]],
  'factor-210': [[1, 7, 30, 210], [0, 4, 9, 11, 420]],
  'factor-5040': [[1, 7, 720, 5040, 16], [0, 11, 13, 32, 10080]],
  'harshad-2digit': [[10, 12, 18, 81, 90], [11, 13, 19, 99, 9, 100]],
  'divisible-by-digits': [[11, 12, 15, 36, 99], [10, 13, 20, 23, 111]],
  'digitsum-20': [[299, 578, 992], [20, 200, 389 + 1, 2999]],
  'digitsum-is-square': [[10, 13, 18, 97, 79], [11, 12, 19, 99, 100]],
  'digit-product-12': [[26, 34, 62, 126, 223], [12, 20, 25, 1126]],
  'palindrome-2000s': [[1001, 1991, 2002, 2992], [999, 1000, 2000, 3003]],
  'odd-factor-count': [[1, 4, 9, 484], [2, 3, 8, 529, 0]],
  'three-factors': [[4, 9, 25, 2809], [1, 2, 8, 16, 3481]],
  'six-factors-u200': [[12, 18, 20, 32, 45], [6, 16, 24, 36, 242]],
  'eight-factors-u200': [[24, 30, 40, 105, 128], [12, 16, 36, 48, 222]],
  'twelve-factors-u200': [[60, 72, 84, 96], [12, 24, 48, 120, 200]],
  'square-and-cube': [[1, 64, 729, 531441], [4, 8, 27, 100, 1000000]],
  'pow2-big': [[1024, 65536, 524288], [512, 1000, 1048576, 2000]],
  'abundant-u100': [[12, 18, 20, 96], [6, 28, 8, 15, 100]],
  'harshad-100-200': [[100, 102, 111, 200], [101, 103, 99, 201, 113]],
  'diff-squares-even': [[4, 8, 16, 196], [2, 6, 3, 15, 200]],
  'not-diff-squares': [[2, 6, 10, 198], [1, 3, 4, 8, 202]],
  'sum-two-cubes': [[2, 9, 16, 1729, 91], [1, 8, 27, 10, 2000]],
  'sum-consecutive-squares': [[5, 13, 25, 925], [1, 2, 10, 20, 1013]],
  'sphenic-u300': [[30, 42, 105, 290], [6, 60, 210, 12, 310]],
  'rough-composite': [[49, 77, 91, 289, 299], [1, 7, 21, 25, 97, 301]],
  'palindromic-prime': [[11, 101, 313, 929], [7, 22, 121, 111, 10301]],
  'prime-square-plus-1': [[2, 5, 17, 1601], [10, 26, 3, 2917]],
  'prime-1000-1100': [[1009, 1013, 1097], [997, 1001, 1007, 1027, 1103]],
  'prime-year-2000s': [[2003, 2011, 2017, 2099], [1999, 2001, 2021, 2023, 2111]],
  'cousin-prime': [[3, 7, 13, 193], [2, 5, 11, 9, 223]],
  'sophie-germain': [[2, 3, 5, 11, 191], [7, 13, 17, 4, 233]],
  'emirp': [[13, 17, 31, 199], [11, 101, 19, 23, 311]],
  'ascending-prime': [[13, 17, 29, 569], [2, 7, 11, 31, 15, 1237]],
  'odd-sum-two-primes': [[5, 7, 9, 99], [3, 11, 17, 4, 105]],
  'square-mult-7': [[49, 196, 9604], [7, 14, 64, 11025]],
  'palindrome-mult-7': [[7, 77, 161, 959], [14, 11, 121, 1001]],
  'palindrome-mult-9': [[171, 333, 999], [9, 99, 121, 180, 1881]],
  'palindrome-mult-11': [[121, 242, 616, 979], [11, 110, 131, 1001]],
  'factor-1001': [[1, 7, 11, 13, 77, 91, 143, 1001], [0, 3, 17, 101, 2002]],
  'factor-2024': [[1, 8, 11, 23, 2024, 253], [0, 3, 7, 16, 4048]],
};

describe('prompt bank', () => {
  it('has at least 98 prompts with unique ids (7 a day, no repeat in 14 days)', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(98);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
  });

  it('has test cases for every prompt, and no stale ones', () => {
    expect(Object.keys(CASES).sort()).toEqual(PROMPTS.map((p) => p.id).sort());
  });

  it('uses proper maths notation, never ^ or *', () => {
    for (const p of PROMPTS) {
      expect(p.text, p.id).not.toMatch(/[\^*]/);
      expect(p.text, p.id).not.toMatch(/<=|>=|\bx\b/);
    }
  });

  it('gives every prompt at least 8 valid answers', () => {
    for (const p of PROMPTS) {
      expect(validAnswers(p).length, p.id).toBeGreaterThanOrEqual(8);
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
