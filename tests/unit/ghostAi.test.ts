import { execFileSync } from 'node:child_process';
import { primeUnder1000 } from './fixtures.ts';
import { describe, expect, it } from 'vitest';
import { isValidAnswer, validAnswers } from '../../src/prompts.ts';
import { ABILITIES } from '../../src/lib/ghostConfig.ts';
import {
  assemblePromptGhosts,
  buildAiCast,
  buildGhostUserMessage,
  ghostSystemPrompt,
  parseGhostReply,
  type AiReplyEntry,
} from '../../src/lib/ghostAi.ts';
import { seededRng } from '../../src/lib/rng.ts';

const ctx = { year: 2026 };
const prompt = primeUnder1000;
const cast = buildAiCast('2026-11-13');

describe('the AI cast', () => {
  it('is 100 people in the configured proportions, the same for a given day', () => {
    expect(cast).toHaveLength(100);
    expect(ABILITIES.map((a) => cast.filter((c) => c.ability === a).length)).toEqual([10, 20, 40, 20, 10]);
    expect(buildAiCast('2026-11-13')).toEqual(cast);
    expect(buildAiCast('2026-11-14')).not.toEqual(cast);
    expect(new Set(cast.map((c) => c.id)).size).toBe(100);
  });

  it('is described to the model with ability, style and persona', () => {
    const msg = buildGhostUserMessage(prompt, cast);
    expect(msg).toContain(prompt.text);
    expect(msg).toContain(`1 | ${cast[0]!.ability} | ${cast[0]!.style} | ${cast[0]!.persona}`);
    expect(ghostSystemPrompt()).toMatch(/40 seconds/);
  });
});

describe('reading the reply', () => {
  it('parses people by id', () => {
    const reply = JSON.stringify({ people: [{ id: 1, ability: 'ultra', style: 'safe', attempts: [9, 683], final: 683 }] });
    expect(parseGhostReply(reply)?.get(1)).toEqual({ attempts: [9, 683], final: 683 });
    expect(parseGhostReply('```json\n' + reply + '\n```')?.get(1)?.final).toBe(683);
  });

  it('returns null for rubbish', () => {
    for (const bad of ['', 'Sorry, I cannot', '{"people": "no"}', '[1,2,3]', '{"people": []}', 'null']) {
      expect(parseGhostReply(bad), bad).toBeNull();
    }
  });
});

describe("assembling a prompt's ghosts", () => {
  it('uses 1,100 rule-based ghosts when the API fails', () => {
    const { ghosts, stats } = assemblePromptGhosts(prompt, 1, cast, null, seededRng('a'), ctx);
    expect(ghosts).toHaveLength(1100);
    expect(stats.used).toBe(false);
    expect(ghosts.every((g) => g.source === 'rules')).toBe(true);
  });

  it('keeps valid AI answers, counts invalid ones as time-outs, and fills gaps with rule-based ghosts', () => {
    const valid = validAnswers(prompt);
    const reply = new Map<number, AiReplyEntry>();
    for (const c of cast) {
      if (c.id <= 60) reply.set(c.id, { attempts: [valid[c.id]!], final: valid[c.id]! });
      else if (c.id <= 70) reply.set(c.id, { attempts: [9, 4], final: 4 }); // invalid: 4 isn't prime
      else if (c.id <= 80) reply.set(c.id, { attempts: [1], final: -1 }); // ran out of time
      // ids 81 to 100 missing from the reply
    }
    const { ghosts, stats } = assemblePromptGhosts(prompt, 3, cast, reply, seededRng('b'), ctx);
    expect(ghosts).toHaveLength(1100);
    expect(stats).toEqual({ used: true, answered: 60, timedOut: 10, invalid: 10, missing: 20 });
    const ai = ghosts.filter((g) => g.source === 'ai');
    expect(ai).toHaveLength(80);
    expect(ai.filter((g) => g.value === null)).toHaveLength(20);
    expect(ghosts.filter((g) => g.source === 'rules')).toHaveLength(1020);
    // AI ghosts keep the ability and style they were cast with.
    for (const g of ai) expect(cast.some((c) => c.ability === g.ability && c.style === g.style)).toBe(true);
    // No invalid answer is ever stored.
    for (const g of ghosts) if (g.value !== null) expect(isValidAnswer(prompt, g.value)).toBe(true);
    expect(ghosts.every((g) => g.position === 3)).toBe(true);
  });
});

describe('Edge Function shared code', () => {
  it('is in sync with src/ (run `npm run sync:shared` if this fails)', () => {
    expect(() => execFileSync('node', ['scripts/sync-shared.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});
