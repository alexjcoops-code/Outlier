import { describe, expect, it } from 'vitest';
import { parseAnswer } from '../../src/lib/parseAnswer.ts';
import { ghostWeight, scoreAnswer, formatShare } from '../../src/lib/scoring.ts';
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
  // 100 ghosts and no real players: each ghost weighs exactly 1.
  const base = { totalReal: 1, sameReal: 1, totalGhost: 100, sameGhost: 0, ghostCount: 100, realPlayers: 0, clever: false };

  it('weighs all the ghosts together as 100 players, fading out by 500', () => {
    expect(ghostWeight(0, 100)).toBe(1);
    expect(ghostWeight(0, 1100) * 1100).toBeCloseTo(100, 10);
    expect(ghostWeight(250, 1100) * 1100).toBeCloseTo(50, 10);
    expect(ghostWeight(500, 1100)).toBe(0);
    expect(ghostWeight(5000, 1100)).toBe(0);
    expect(ghostWeight(0, 0)).toBe(0);
  });

  it('Lone Wolf: nobody else at all, real or ghost', () => {
    expect(scoreAnswer(base)).toMatchObject({ tier: 'lone', points: 100 });
    expect(scoreAnswer({ ...base, sameGhost: 1 }).tier).not.toBe('lone');
    expect(scoreAnswer({ ...base, sameReal: 2, totalReal: 2 }).tier).not.toBe('lone');
    // With 1,100 ghosts each weighs 1/11, but even one matching ghost means somebody else said it.
    const big = { ...base, totalGhost: 1000, ghostCount: 1100 };
    expect(scoreAnswer({ ...big, sameGhost: 0 }).tier).toBe('lone');
    expect(scoreAnswer({ ...big, sameGhost: 1 }).tier).toBe('outlier');
  });

  it('ghost matches stop counting once ghosts have faded', () => {
    const s = scoreAnswer({ ...base, sameGhost: 50, totalReal: 600, realPlayers: 600 });
    expect(s.tier).toBe('lone');
    expect(s.share).toBeCloseTo(1 / 600);
  });

  it('leaves ghosts who ran out of time out of the share, but not out of the weight', () => {
    // 1,100 ghosts, 1,000 answered: answered ghosts weigh 100 × 1000/1100 ≈ 90.9 players.
    const s = scoreAnswer({ ...base, totalGhost: 1000, ghostCount: 1100, sameGhost: 110 });
    expect(s.share).toBeCloseTo((1 + 10) / (1 + 1000 / 11), 10);
  });

  // 1,000 real players and the ghosts faded out: each other player is 0.1% of everyone else.
  const crowd = (sameReal: number, clever = false) =>
    scoreAnswer({ totalReal: 1000, sameReal, totalGhost: 0, sameGhost: 0, ghostCount: 0, realPlayers: 1000, clever });

  it('applies the thresholds to everyone else\'s answers', () => {
    expect(crowd(1).tier).toBe('lone'); // nobody else
    expect(crowd(2).tier).toBe('outlier'); // 0.1% of the others
    expect(crowd(5).tier).toBe('outlier'); // 0.4%
    expect(crowd(6).tier).toBe('rare'); // 0.5%: 1 in 200
    expect(crowd(40).tier).toBe('rare'); // 3.9%
    expect(crowd(41).tier).toBe('fair'); // 4.0%
    expect(crowd(199).tier).toBe('fair'); // 19.9% said it
    expect(crowd(200).tier).toBe('obvious'); // 20%
    expect(crowd(41).points).toBe(30);
    expect(crowd(6).points).toBe(60);
    expect(crowd(2).points).toBe(85);
    expect(crowd(200).points).toBe(10);
  });

  it("a crowd of about 100 can't make an Outlier: one other person is already 1%", () => {
    expect(scoreAnswer({ ...base, sameGhost: 1 }).tier).toBe('rare'); // 1 of 101
  });

  it('Predictably Clever overrides Fair and Rare, but not Obvious, Outlier or Lone Wolf', () => {
    expect(crowd(1, true).tier).toBe('lone');
    expect(crowd(3, true).tier).toBe('outlier');
    expect(crowd(11, true)).toMatchObject({ tier: 'clever', points: 15 });
    expect(crowd(100, true).tier).toBe('clever');
    expect(crowd(250, true).tier).toBe('obvious');
  });

  it('weights ghosts down as players arrive', () => {
    // 250 real players: ghosts together count as 50.
    const s = scoreAnswer({ totalReal: 250, sameReal: 10, totalGhost: 100, sameGhost: 10, ghostCount: 100, realPlayers: 250, clever: false });
    expect(s.share).toBeCloseTo((10 + 5) / (250 + 50));
    // Everyone else: 14 of 300, 4.7%.
    expect(s.tier).toBe('fair');
  });

  it('leaves a ghost\'s own weight out when scoring a ghost\'s answer', () => {
    // 1,100 ghosts, none real: a ghost alone on its answer has nobody else.
    const s = scoreAnswer({ totalReal: 0, sameReal: 0, totalGhost: 1000, sameGhost: 1, ghostCount: 1100, realPlayers: 0, clever: false });
    expect(s.tier).toBe('outlier');
  });

  it('formats shares', () => {
    expect(formatShare(0.04)).toBe('4%');
    expect(formatShare(0.004)).toBe('under 1%');
    expect(formatShare(0.236)).toBe('24%');
  });
});
