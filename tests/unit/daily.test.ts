import { describe, expect, it } from 'vitest';
import { PROMPTS, getPrompt } from '../../src/prompts.ts';
import { EPOCH, NO_REPEAT_DAYS, PROMPTS_PER_DAY, dailyPromptIds, selectDay } from '../../src/lib/daily.ts';
import { addDays } from '../../src/lib/ukDate.ts';

describe('daily selection', () => {
  it('is deterministic for a date', () => {
    const a = dailyPromptIds('2026-11-13');
    const b = dailyPromptIds('2026-11-13');
    expect(a).toEqual(b);
    // A fresh bank array (so no memo is shared) must give the same answer.
    expect(dailyPromptIds('2026-11-13', [...PROMPTS])).toEqual(a);
    // And asking for dates out of order must not change anything.
    const fresh = [...PROMPTS];
    dailyPromptIds('2026-12-25', fresh);
    expect(dailyPromptIds('2026-11-13', fresh)).toEqual(a);
  });

  it('differs from day to day', () => {
    expect(dailyPromptIds('2026-11-13')).not.toEqual(dailyPromptIds('2026-11-14'));
  });

  it('gives 7 distinct prompts, easier first and hardest last', () => {
    for (let i = 0; i < 800; i++) {
      const ids = dailyPromptIds(addDays(EPOCH, i));
      expect(ids).toHaveLength(PROMPTS_PER_DAY);
      expect(new Set(ids).size).toBe(PROMPTS_PER_DAY);
      const diffs = ids.map((id) => getPrompt(id).difficulty);
      expect([...diffs].sort()).toEqual(diffs);
      expect(diffs[0]).toBe(1);
      expect(diffs[6]).toBe(Math.max(...diffs));
    }
  });

  it('never repeats a prompt within 14 days, over 800 days', () => {
    const lastSeen = new Map<string, number>();
    for (let i = 0; i < 800; i++) {
      for (const id of dailyPromptIds(addDays(EPOCH, i))) {
        const prev = lastSeen.get(id);
        if (prev !== undefined) expect(i - prev, `${id} on day ${i}`).toBeGreaterThanOrEqual(NO_REPEAT_DAYS);
        lastSeen.set(id, i);
      }
    }
    // Every prompt gets used.
    expect(lastSeen.size).toBe(PROMPTS.length);
  });

  it('ends on a hard prompt most days', () => {
    let hard = 0;
    for (let i = 0; i < 400; i++) {
      const ids = dailyPromptIds(addDays(EPOCH, i));
      if (getPrompt(ids[6]!).difficulty === 3) hard++;
    }
    expect(hard).toBeGreaterThan(380);
  });

  it('selectDay respects the exclusion set it is given', () => {
    const recent = new Set(PROMPTS.slice(0, 91).map((p) => p.id));
    const ids = selectDay('2027-03-01', recent);
    expect(ids).toHaveLength(7);
    for (const id of ids) expect(recent.has(id)).toBe(false);
  });

  it('throws if the bank is too small', () => {
    expect(() => selectDay('2027-03-01', new Set(), PROMPTS.slice(0, 5))).toThrow(/too small/);
  });
});
