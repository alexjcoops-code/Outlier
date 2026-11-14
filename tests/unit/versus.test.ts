import { describe, expect, it } from 'vitest';
import { getPrompt, validAnswers } from '../../src/prompts.ts';
import { TIMER_MS } from '../../src/lib/backend/types.ts';
import {
  VERSUS_COUNTDOWN_MS,
  VERSUS_REVEAL_MS,
  VERSUS_ROUNDS,
  cleanName,
  crowdScore,
  matchTotals,
  normaliseCode,
  pickVersusPrompts,
  randomCode,
  scoreRound,
} from '../../src/lib/versus.ts';
import { createLocalVersus } from '../../src/lib/versusLocal.ts';

describe('versus rules', () => {
  it('picks five questions of five different types, getting harder', () => {
    const ids = pickVersusPrompts('abc');
    expect(ids).toEqual(pickVersusPrompts('abc'));
    expect(ids).not.toEqual(pickVersusPrompts('abd'));
    expect(ids).toHaveLength(VERSUS_ROUNDS);
    expect(new Set(ids.map((id) => getPrompt(id).family)).size).toBe(5);
    expect(ids.map((id) => getPrompt(id).difficulty)).toEqual([1, 1, 2, 2, 3]);
  });

  it("scores the crowd's favourite low and a rare answer high", () => {
    const p = getPrompt('multiples-01'); // a multiple of 6 under 100
    expect(crowdScore(p, 12, 2026).points).toBeLessThanOrEqual(15);
    expect(crowdScore(p, 66, 2026).points).toBeGreaterThan(crowdScore(p, 12, 2026).points);
    expect(crowdScore(p, 13, 2026)).toEqual({ tier: 'none', points: 0, share: 0 });
  });

  it('splits the points between players who said the same thing', () => {
    const id = 'multiples-01';
    const year = 2026;
    const alone = crowdScore(getPrompt(id), 54, year).points;
    const scores = scoreRound(id, [
      { seat: 1, value: 54 },
      { seat: 2, value: 54 },
      { seat: 3, value: 90 },
      { seat: 4, value: null },
    ], year);
    expect(scores[0]).toMatchObject({ base: alone, points: Math.round(alone / 2), sharedWith: [2] });
    expect(scores[1]!.sharedWith).toEqual([1]);
    expect(scores[2]!.sharedWith).toEqual([]);
    expect(scores[2]!.points).toBe(scores[2]!.base);
    expect(scores[3]).toMatchObject({ tier: 'none', points: 0 });
  });

  it('adds up totals and shares places on a tie', () => {
    const t = matchTotals({
      year: 2026,
      players: [1, 2, 3].map((seat) => ({ seat, name: `P${seat}`, ghost: false, me: seat === 1, left: false })),
      rounds: [
        { round: 1, promptId: 'multiples-01', answered: [1, 2, 3], answers: [{ seat: 1, value: 54 }, { seat: 2, value: 54 }, { seat: 3, value: null }] },
        { round: 2, promptId: 'multiples-02', answered: [], answers: null },
      ],
    });
    expect(t.map((x) => x.place)).toEqual([1, 1, 3]);
    expect(t[0]!.total).toBe(t[1]!.total);
    expect(t[2]).toEqual({ seat: 3, total: 0, place: 3 });
  });

  it('tidies names and room codes', () => {
    expect(cleanName('  Ada   <b>Lovelace</b>!!  ')).toBe('Ada bLovelaceb');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName('🙂')).toBe('');
    expect(normaliseCode('ab-c d2')).toBe('ABCD2');
    expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });
});

describe('versus against ghosts', () => {
  it('plays a whole match on a fake clock', async () => {
    let t = 1_000_000;
    const v = createLocalVersus({ now: () => t, seed: () => 'fixed' });
    const id = await v.playGhosts('Me', 4);
    let s = await v.state(id);
    expect(s.players).toHaveLength(4);
    expect(s.players.filter((p) => p.ghost)).toHaveLength(3);
    expect(s.status).toBe('playing');
    expect(s.roundStartsAt).toBe(t + VERSUS_COUNTDOWN_MS);

    const prompt = getPrompt(s.rounds[0]!.promptId);
    expect(await v.answer(id, 1, validAnswers(prompt)[0]!)).toBe('not_started');
    t += VERSUS_COUNTDOWN_MS + 1_000;
    expect(await v.answer(id, 1, -5)).toBe('invalid');
    const mine = validAnswers(prompt).at(-1)!;
    expect(await v.answer(id, 1, mine)).toBe('ok');
    expect(await v.answer(id, 1, mine)).toBe('already');
    s = await v.state(id);
    expect(s.rounds[0]!.answers).toBeNull(); // ghosts still thinking

    for (let round = 1; round <= VERSUS_ROUNDS; round++) {
      // Step the clock until this round closes: early if everyone's in, at 25 s at the latest.
      while (!(s = await v.state(id)).rounds[round - 1]?.answers) t += 500;
      expect(s.closedAt! - s.roundStartsAt!).toBeLessThanOrEqual(TIMER_MS);
      expect(s.round).toBe(round);
      const answers = s.rounds[round - 1]!.answers!;
      expect(answers).toHaveLength(4);
      for (const a of answers) if (a.value !== null) expect(validAnswers(getPrompt(s.rounds[round - 1]!.promptId))).toContain(a.value);
      t += VERSUS_REVEAL_MS;
    }
    s = await v.state(id);
    expect(s.status).toBe('done');
    expect(matchTotals(s)).toHaveLength(4);
  });

  it('gives the same ghosts for the same seed', async () => {
    const run = async () => {
      let t = 0;
      const v = createLocalVersus({ now: () => t, seed: () => 'same' });
      const id = await v.playGhosts('Me', 3);
      t += 60_000;
      return (await v.state(id)).rounds[0]!.answers;
    };
    expect(await run()).toEqual(await run());
  });

  it('turns online requests away offline', async () => {
    const v = createLocalVersus();
    await expect(v.quickMatch('Me', 2)).rejects.toThrow(/server/);
  });
});
