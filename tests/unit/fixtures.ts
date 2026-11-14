// Fixed questions for tests of the ghost model and the crowd rack, so those tests
// don't depend on what happens to be in the bank.

import type { Prompt } from '../../src/prompts.ts';
import { isPowerOf, isPrime } from '../../src/lib/maths.ts';

export const primeUnder1000: Prompt = {
  id: 'test-prime-u1000',
  family: 'test',
  text: 'Name a prime under 1,000',
  difficulty: 1,
  min: 2,
  max: 999,
  validator: isPrime,
  cleverList: [2, 3, 5, 7, 11, 13, 17, 37, 97, 101, 997],
};

export const bigPowerOf2: Prompt = {
  id: 'test-pow2-big',
  family: 'test',
  text: 'Name a power of 2 between 1,000 and 1,000,000',
  difficulty: 3,
  min: 1000,
  max: 1_000_000,
  validator: (n) => isPowerOf(n, 2),
  cleverList: [1024, 2048, 4096, 65536],
  candidates: () => Array.from({ length: 20 }, (_, i) => 2 ** (i + 1)),
};

export const multipleOf7: Prompt = {
  id: 'test-mult7-500-700',
  family: 'test',
  text: 'Name a multiple of 7 between 500 and 700',
  difficulty: 1,
  min: 500,
  max: 700,
  validator: (n) => n % 7 === 0,
  cleverList: [700],
};

/** No clever list at all. */
export const multipleOf12: Prompt = {
  id: 'test-mult12-u100',
  family: 'test',
  text: 'Name a number under 100 that is a multiple of both 3 and 4',
  difficulty: 1,
  min: 12,
  max: 99,
  validator: (n) => n % 12 === 0,
  cleverList: [],
};
