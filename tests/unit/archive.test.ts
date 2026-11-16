import { describe, expect, it } from 'vitest';
import { createArchiveBackend, loadArchiveScores, recordArchiveScore, withMyAnswer } from '../../src/lib/backend/archive.ts';
import { createLocalBackend, memoryStorage } from '../../src/lib/backend/local.ts';
import { dailyPromptIds } from '../../src/lib/daily.ts';
import { scoreFromCrowd } from '../../src/lib/scoring.ts';
import { getPrompt, validAnswers } from '../../src/prompts.ts';

const TODAY = '2026-11-16';
const PAST = '2026-11-10';
const NOON = Date.parse('2026-11-16T12:00:00Z');

function setup() {
  let clock = NOON;
  const now = () => clock;
  const real = createLocalBackend({
    kind: 'local',
    storage: memoryStorage(),
    promptIdsFor: (d) => dailyPromptIds(d),
    yearFor: (d) => Number(d.slice(0, 4)),
    now,
  });
  const storage = memoryStorage();
  const archive = createArchiveBackend(real, storage, now);
  return { real, archive, storage, tick: (ms: number) => (clock += ms) };
}

describe('scoreFromCrowd', () => {
  it('uses the same thresholds as the live game', () => {
    expect(scoreFromCrowd(0, false).tier).toBe('lone');
    expect(scoreFromCrowd(0.003, true).tier).toBe('outlier');
    expect(scoreFromCrowd(0.02, true).tier).toBe('clever');
    expect(scoreFromCrowd(0.02, false).tier).toBe('rare');
    expect(scoreFromCrowd(0.1, false).tier).toBe('fair');
    expect(scoreFromCrowd(0.25, true).tier).toBe('obvious');
    expect(scoreFromCrowd(0.1, false).points).toBe(30);
  });
});

describe('withMyAnswer', () => {
  it('adds your ball to the crowd and keeps the shares summing to one', () => {
    const crowd = { players: 0, simulated: true, values: [{ value: 2, share: 0.6 }, { value: 3, share: 0.4 }] };
    const mine = withMyAnswer(crowd, 97);
    expect(mine.values.reduce((s, v) => s + v.share, 0)).toBeCloseTo(1);
    expect(mine.values.find((v) => v.value === 97)!.share).toBeCloseTo(1 / 101);
    expect(withMyAnswer(crowd, undefined)).toBe(crowd);
  });
});

describe('archive backend', () => {
  it("plays a past day against that day's finished crowd", async () => {
    const { real, archive, tick } = setup();
    const day = await archive.getResults(PAST);
    expect(day.final).toBe(true);
    expect(day.rows.map((r) => r.promptId)).toEqual(dailyPromptIds(PAST));
    expect(day.rows.every((r) => !r.started)).toBe(true);

    await expect(archive.startPrompt(PAST, 2)).rejects.toThrow(/order/);
    await expect(archive.getDistribution(PAST, 1)).rejects.toThrow(/no_peeking/);

    const { remainingMs } = await archive.startPrompt(PAST, 1);
    expect(remainingMs).toBe(40_000);
    const prompt = getPrompt(day.rows[0]!.promptId);
    const crowd = await real.getDistribution(PAST, 1);
    const value = crowd.values[0]!.value; // the crowd's favourite: Obvious
    tick(3_000);
    const res = await archive.submitAnswer(PAST, 1, value);
    expect(res).toMatchObject({ ok: true, tier: 'obvious', points: 10 });
    expect(await archive.submitAnswer(PAST, 1, value)).toEqual({ ok: false, reason: 'already' });

    // Your ball is in the rack now.
    const after = await archive.getDistribution(PAST, 1);
    expect(after.players).toBe(crowd.players + 1);

    // An answer nobody gave is a Lone Wolf.
    await archive.startPrompt(PAST, 2);
    const prompt2 = getPrompt(day.rows[1]!.promptId);
    const given = new Set((await real.getDistribution(PAST, 2)).values.map((v) => v.value));
    const unseen = validAnswers(prompt2).find((v) => !given.has(v));
    if (unseen !== undefined) expect(await archive.submitAnswer(PAST, 2, unseen)).toMatchObject({ ok: true, tier: 'lone' });

    // Invalid answers bounce; late ones are refused.
    await archive.startPrompt(PAST, 3);
    expect(await archive.submitAnswer(PAST, 3, -5)).toEqual({ ok: false, reason: 'invalid' });
    tick(44_000);
    expect(await archive.submitAnswer(PAST, 3, validAnswers(getPrompt(day.rows[2]!.promptId))[0]!)).toEqual({
      ok: false,
      reason: 'expired',
    });

    const results = await archive.getResults(PAST);
    expect(results.rows[0]).toMatchObject({ started: true, value, tier: 'obvious' });
    expect(results.rows[2]).toMatchObject({ started: true, value: null, tier: 'none' });
    expect(prompt.id).toBe(results.rows[0]!.promptId);
  });

  it("doesn't touch the real game's answers", async () => {
    const { real, archive } = setup();
    await archive.startPrompt(PAST, 1);
    const real1 = await real.getResults(PAST);
    expect(real1.rows.every((r) => !r.started)).toBe(true);
    expect((await real.getResults(TODAY)).rows.every((r) => !r.started)).toBe(true);
  });

  it('records a finished archive worksheet for the archive list', async () => {
    const storage = memoryStorage();
    const { archive } = setup();
    const r = await archive.getResults(PAST);
    recordArchiveScore(r, storage);
    expect(loadArchiveScores(storage)).toEqual({}); // not finished: nothing recorded
    recordArchiveScore({ ...r, total: 210, rows: r.rows.map((row) => ({ ...row, started: true })) }, storage);
    expect(loadArchiveScores(storage)[PAST]!.total).toBe(210);
  });
});
