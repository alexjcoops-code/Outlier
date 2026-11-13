import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { getPrompt, isValidAnswer } from '../../src/prompts.ts';
import { dailyPromptIds } from '../../src/lib/daily.ts';
import {
  GHOSTS_PER_SOURCE,
  assembleGhosts,
  buildGhostUserMessage,
  parseGhostReply,
} from '../../src/lib/ghostAi.ts';
import { seededRng } from '../../src/lib/rng.ts';

const prompts = dailyPromptIds('2026-11-13').map(getPrompt);

describe('AI ghost reply handling', () => {
  it('describes each prompt with its position and range', () => {
    const msg = buildGhostUserMessage(prompts);
    prompts.forEach((p, i) => expect(msg).toContain(`${i + 1}. ${p.text}`));
    expect(msg).toContain('Allowed range');
  });

  it('parses a clean reply, and one wrapped in a code fence', () => {
    const reply = JSON.stringify({ prompts: [{ position: 1, answers: [1, 2, 3] }, { position: 2, answers: [9] }] });
    expect(parseGhostReply(reply)?.get(1)).toEqual([1, 2, 3]);
    expect(parseGhostReply('```json\n' + reply + '\n```')?.get(2)).toEqual([9]);
  });

  it('returns null for rubbish', () => {
    for (const bad of ['', 'Sorry, I cannot', '{"prompts": "no"}', '[1,2,3]', '{"prompts": []}', 'null']) {
      expect(parseGhostReply(bad), bad).toBeNull();
    }
  });

  it('drops non-integer answers while parsing', () => {
    const reply = JSON.stringify({ prompts: [{ position: 1, answers: [7, '8', 2.5, null, 11] }] });
    expect(parseGhostReply(reply)?.get(1)).toEqual([7, 11]);
  });
});

describe('assembling the day’s ghosts', () => {
  it('uses 100 rule-based ghosts per prompt when the API fails', () => {
    const { ghosts, aiAccepted } = assembleGhosts(prompts, null, seededRng('a'));
    expect(ghosts).toHaveLength(700);
    expect(aiAccepted).toBe(0);
    expect(ghosts.every((g) => g.source === 'rules')).toBe(true);
    for (const g of ghosts) expect(isValidAnswer(prompts[g.position - 1]!, g.value)).toBe(true);
  });

  it('keeps valid AI answers and replaces invalid or missing ones with rule-based samples', () => {
    const ai = new Map<number, number[]>();
    prompts.forEach((p, i) => {
      const valid: number[] = [];
      for (let n = p.min; n <= p.max && valid.length < 40; n++) if (p.validator(n)) valid.push(n);
      // Position 1: 30 good answers and 20 bad ones. Position 2: only 10 answers. Position 3: 80 answers.
      if (i === 0) ai.set(1, [...Array.from({ length: 30 }, (_, k) => valid[k % valid.length]!), ...Array<number>(20).fill(-1)]);
      else if (i === 1) ai.set(2, Array.from({ length: 10 }, (_, k) => valid[k % valid.length]!));
      else if (i === 2) ai.set(3, Array.from({ length: 80 }, (_, k) => valid[k % valid.length]!));
      // Positions 4–7: nothing at all.
    });
    const { ghosts, aiAccepted, aiRejected } = assembleGhosts(prompts, ai, seededRng('b'));
    const count = (position: number, source: string) =>
      ghosts.filter((g) => g.position === position && g.source === source).length;

    expect(ghosts).toHaveLength(700);
    expect([count(1, 'ai'), count(1, 'rules')]).toEqual([30, 70]);
    expect([count(2, 'ai'), count(2, 'rules')]).toEqual([10, 90]);
    expect([count(3, 'ai'), count(3, 'rules')]).toEqual([GHOSTS_PER_SOURCE, 50]);
    expect([count(4, 'ai'), count(4, 'rules')]).toEqual([0, 100]);
    expect(aiAccepted).toBe(90);
    expect(aiRejected).toBe(20);
    for (const g of ghosts) expect(isValidAnswer(prompts[g.position - 1]!, g.value)).toBe(true);
  });
});

describe('Edge Function shared code', () => {
  it('is in sync with src/ (run `npm run sync:shared` if this fails)', () => {
    expect(() => execFileSync('node', ['scripts/sync-shared.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
