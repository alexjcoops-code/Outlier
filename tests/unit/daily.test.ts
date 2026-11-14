import { describe, expect, it } from 'vitest';
import { PROMPTS, getPrompt } from '../../src/prompts.ts';
import {
  EPOCH,
  FAMILY_GAP_DAYS,
  NO_REPEAT_DAYS,
  PROMPTS_PER_DAY,
  dailyPromptIds,
  historyFor,
  selectDay,
} from '../../src/lib/daily.ts';
import { addDays } from '../../src/lib/ukDate.ts';

const DAYS = 800;
const schedule = Array.from({ length: DAYS }, (_, i) => dailyPromptIds(addDays(EPOCH, i)));
const familiesOn = (i: number) => schedule[i]!.map((id) => getPrompt(id).family);
const none = { ids: new Set<string>(), families: new Set<string>() };

describe('daily selection', () => {
  it('is deterministic for a date', () => {
    const a = dailyPromptIds('2026-11-13');
    expect(dailyPromptIds('2026-11-13')).toEqual(a);
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

  it('gives 7 questions of 7 different types, easier first and hardest last', () => {
    for (let i = 0; i < DAYS; i++) {
      const ids = schedule[i]!;
      expect(ids).toHaveLength(PROMPTS_PER_DAY);
      expect(new Set(familiesOn(i)).size, `day ${i}`).toBe(PROMPTS_PER_DAY);
      const diffs = ids.map((id) => getPrompt(id).difficulty);
      expect([...diffs].sort()).toEqual(diffs);
      expect(diffs).toEqual([1, 1, 1, 2, 2, 2, 3]);
    }
  });

  it(`never uses a question type again within ${FAMILY_GAP_DAYS} days, over ${DAYS} days`, () => {
    for (let i = 1; i < DAYS; i++) {
      const today = new Set(familiesOn(i));
      for (let back = 1; back <= FAMILY_GAP_DAYS && i - back >= 0; back++) {
        for (const fam of familiesOn(i - back)) expect(today.has(fam), `${fam} on day ${i} and day ${i - back}`).toBe(false);
      }
    }
  });

  it(`never repeats a question within ${NO_REPEAT_DAYS} days, and gets through the whole bank`, () => {
    const lastSeen = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) {
      for (const id of schedule[i]!) {
        const prev = lastSeen.get(id);
        if (prev !== undefined) expect(i - prev, `${id} on day ${i}`).toBeGreaterThanOrEqual(NO_REPEAT_DAYS);
        lastSeen.set(id, i);
      }
    }
    expect(lastSeen.size).toBeGreaterThan(PROMPTS.length * 0.97);
  });

  it('uses every question type regularly', () => {
    const uses = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) for (const fam of familiesOn(i)) uses.set(fam, (uses.get(fam) ?? 0) + 1);
    expect(uses.size).toBe(100);
    // 5,600 slots over 100 types: about 56 each. Nobody hogs the board.
    for (const [fam, n] of uses) {
      expect(n, fam).toBeGreaterThan(25);
      expect(n, fam).toBeLessThan(110);
    }
  });

  it('works out the history: questions for 59 days, types for 3', () => {
    const date = '2027-03-01';
    const byDay = new Map<string, string[]>([
      [addDays(date, -1), ['prime-between-01']],
      [addDays(date, -3), ['clock-04']],
      [addDays(date, -4), ['roman-02']],
      [addDays(date, -(NO_REPEAT_DAYS - 1)), ['squares-05']],
      [addDays(date, -NO_REPEAT_DAYS), ['dice-03']],
      [addDays(date, -2), ['an-old-retired-id']],
    ]);
    const h = historyFor(date, (d) => byDay.get(d) ?? []);
    expect([...h.ids].sort()).toEqual(['an-old-retired-id', 'clock-04', 'prime-between-01', 'roman-02', 'squares-05']);
    expect([...h.families].sort()).toEqual(['clock', 'prime-between']);
  });

  it('selectDay respects the questions and types it is told to avoid', () => {
    const ids = new Set(PROMPTS.slice(0, 300).map((p) => p.id));
    const families = new Set(['squares', 'clock', 'roman', 'dice', 'coins']);
    const picked = selectDay('2027-03-01', { ids, families });
    expect(picked).toHaveLength(7);
    for (const id of picked) {
      expect(ids.has(id)).toBe(false);
      expect(families.has(getPrompt(id).family)).toBe(false);
    }
  });

  it('throws if the bank is too small', () => {
    expect(() => selectDay('2027-03-01', none, PROMPTS.slice(0, 5))).toThrow(/too small/);
    // Plenty of questions but only three types: still too small for seven different types.
    expect(() => selectDay('2027-03-01', none, PROMPTS.slice(0, 30))).toThrow(/too small/);
  });
});
