import { describe, expect, it } from 'vitest';
import { PROMPTS, getPrompt, isValidAnswer, validAnswers } from '../../src/prompts.ts';
import { parseAnswer } from '../../src/lib/parseAnswer.ts';
import { ghostWeight, scoreAnswer, formatShare } from '../../src/lib/scoring.ts';
import { sampleGhosts } from '../../src/lib/ghostRules.ts';
import { seededRng } from '../../src/lib/rng.ts';
import {
  addDays,
  formatCountdown,
  formatShortDate,
  formatSlashDate,
  msUntilUkMidnight,
  ukDateString,
  ukMidnight,
} from '../../src/lib/ukDate.ts';

describe('parseAnswer', () => {
  it('accepts whole numbers and strips commas and spaces', () => {
    expect(parseAnswer('683')).toBe(683);
    expect(parseAnswer('1,024')).toBe(1024);
    expect(parseAnswer(' 1 000 000 ')).toBe(1000000);
    expect(parseAnswer('007')).toBe(7);
    expect(parseAnswer('0')).toBe(0);
  });
  it('rejects everything else', () => {
    for (const bad of ['', ' ', '1.5', '-3', 'abc', '12a', '1e3', '½', '9999999999999999999']) {
      expect(parseAnswer(bad), bad).toBeNull();
    }
  });
});

describe('UK dates', () => {
  it('uses London time, not UTC, in summer', () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    expect(ukDateString(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    expect(ukDateString(new Date('2026-06-30T22:30:00Z'))).toBe('2026-06-30');
  });
  it('matches UTC in winter', () => {
    expect(ukDateString(new Date('2026-11-13T23:59:59Z'))).toBe('2026-11-13');
    expect(ukDateString(new Date('2026-11-14T00:00:00Z'))).toBe('2026-11-14');
  });
  it('finds midnight either side of the clock changes', () => {
    expect(ukMidnight('2026-11-13').toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(ukMidnight('2026-07-01').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    // Clocks go forward on 29 March 2026: that day starts in GMT, the next in BST.
    expect(ukMidnight('2026-03-29').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(ukMidnight('2026-03-30').toISOString()).toBe('2026-03-29T23:00:00.000Z');
    // Clocks go back on 25 October 2026.
    expect(ukMidnight('2026-10-25').toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(ukMidnight('2026-10-26').toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
  it('counts down to the next London midnight, including 23- and 25-hour days', () => {
    expect(msUntilUkMidnight(new Date('2026-11-13T16:47:16Z'))).toBe((7 * 3600 + 12 * 60 + 44) * 1000);
    expect(msUntilUkMidnight(new Date('2026-03-29T00:00:00Z'))).toBe(23 * 3600 * 1000);
    expect(msUntilUkMidnight(new Date('2026-10-24T23:00:00Z'))).toBe(25 * 3600 * 1000);
  });
  it('formats', () => {
    expect(formatShortDate('2026-11-13')).toBe('Fri 13 Nov');
    expect(formatSlashDate('2026-11-13')).toBe('13/11/26');
    expect(formatCountdown((7 * 3600 + 12 * 60 + 44) * 1000)).toBe('07:12:44');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('scoring', () => {
  const base = { totalReal: 1, sameReal: 1, totalGhost: 100, sameGhost: 0, realPlayers: 1, clever: false };

  it('fades ghosts out by 200 players', () => {
    expect(ghostWeight(0)).toBe(1);
    expect(ghostWeight(50)).toBe(0.75);
    expect(ghostWeight(200)).toBe(0);
    expect(ghostWeight(5000)).toBe(0);
  });

  it('Lone Wolf: nobody else, real or ghost', () => {
    expect(scoreAnswer(base)).toMatchObject({ tier: 'lone', points: 100 });
    expect(scoreAnswer({ ...base, sameGhost: 1 }).tier).not.toBe('lone');
    expect(scoreAnswer({ ...base, sameReal: 2, totalReal: 2 }).tier).not.toBe('lone');
  });

  it('a ghost match stops counting once ghosts have faded', () => {
    const s = scoreAnswer({ ...base, sameGhost: 5, totalReal: 300, realPlayers: 300 });
    expect(s.tier).toBe('lone');
    expect(s.share).toBeCloseTo(1 / 300);
  });

  it('applies the share thresholds', () => {
    const at = (sameGhost: number, clever = false) => scoreAnswer({ ...base, realPlayers: 0, sameGhost, clever });
    // share = (1 + g) / 101
    expect(at(1).tier).toBe('outlier'); // 1.98%
    expect(at(2).tier).toBe('outlier'); // 2.97%
    expect(at(3).tier).toBe('rare'); // 3.96%
    expect(at(7).tier).toBe('rare'); // 7.92%
    expect(at(8).tier).toBe('fair'); // 8.91%
    expect(at(19).tier).toBe('fair'); // 19.8%
    expect(at(20).tier).toBe('obvious'); // 20.8%
    expect(at(8).points).toBe(30);
    expect(at(3).points).toBe(60);
    expect(at(1).points).toBe(85);
    expect(at(20).points).toBe(10);
  });

  it('Predictably Clever overrides Fair and Rare, but not Obvious, Outlier or Lone Wolf', () => {
    const at = (sameGhost: number) => scoreAnswer({ ...base, realPlayers: 0, sameGhost, clever: true });
    expect(at(0).tier).toBe('lone');
    expect(at(1).tier).toBe('outlier');
    expect(at(3)).toMatchObject({ tier: 'clever', points: 15 });
    expect(at(10).tier).toBe('clever');
    expect(at(25).tier).toBe('obvious');
  });

  it('weights ghosts down as players arrive', () => {
    // 100 real players (w = 0.5): 4 real + 10 ghost matches out of 100 real + 100 ghosts.
    const s = scoreAnswer({ totalReal: 100, sameReal: 4, totalGhost: 100, sameGhost: 10, realPlayers: 100, clever: false });
    expect(s.share).toBeCloseTo((4 + 5) / (100 + 50));
    expect(s.tier).toBe('rare');
  });

  it('formats shares', () => {
    expect(formatShare(0.04)).toBe('4%');
    expect(formatShare(0.004)).toBe('under 1%');
    expect(formatShare(0.236)).toBe('24%');
  });
});

describe('rule-based ghosts', () => {
  it('only ever produce valid answers, for every prompt', () => {
    for (const p of PROMPTS) {
      const ghosts = sampleGhosts(p, 100, seededRng(`t:${p.id}`));
      expect(ghosts).toHaveLength(100);
      for (const g of ghosts) expect(isValidAnswer(p, g), `${p.id}: ${g}`).toBe(true);
    }
  });

  it('are deterministic for a seed', () => {
    const p = getPrompt('prime-u1000');
    expect(sampleGhosts(p, 50, seededRng('x'))).toEqual(sampleGhosts(p, 50, seededRng('x')));
    expect(sampleGhosts(p, 50, seededRng('x'))).not.toEqual(sampleGhosts(p, 50, seededRng('y')));
  });

  it('favour small and famous numbers but still leave a long tail', () => {
    const p = getPrompt('prime-u1000');
    const ghosts = sampleGhosts(p, 20000, seededRng('big'));
    const count = (n: number) => ghosts.filter((g) => g === n).length;
    expect(count(2)).toBeGreaterThan(count(683) * 5);
    expect(count(7)).toBeGreaterThan(count(683) * 5);
    expect(count(37)).toBeGreaterThan(count(41));
    // First five answers take a big slice, but nowhere near everything.
    const firstFive = ghosts.filter((g) => g <= 11).length / ghosts.length;
    expect(firstFive).toBeGreaterThan(0.25);
    expect(firstFive).toBeLessThan(0.8);
    // Plenty of valid answers get no ghost at all in a day's 100: room for Lone Wolf.
    const day = new Set(sampleGhosts(p, 100, seededRng('day')));
    expect(day.size).toBeLessThan(validAnswers(p).length / 2);
  });
});
