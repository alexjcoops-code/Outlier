import { describe, expect, it } from 'vitest';
import { PROMPTS, getPrompt, isValidAnswer, validAnswers } from '../../src/prompts.ts';
import { ABILITIES, GHOST_CONFIG, STYLES } from '../../src/lib/ghostConfig.ts';
import {
  abilityDistribution,
  answerDistribution,
  castOf,
  entropy,
  generateRuleGhosts,
  quotas,
} from '../../src/lib/ghostModel.ts';
import { assemblePromptGhosts, buildAiCast } from '../../src/lib/ghostAi.ts';
import { seededRng } from '../../src/lib/rng.ts';
import { ghostWeight } from '../../src/lib/scoring.ts';

const ctx = { year: 2026 };
const counts = (values: (number | null)[]) => {
  const m = new Map<number, number>();
  for (const v of values) if (v !== null) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};
const sampleEntropy = (values: (number | null)[]) => {
  const m = counts(values);
  const n = [...m.values()].reduce((s, x) => s + x, 0);
  return entropy([...m.values()].map((c) => c / n));
};

describe('config', () => {
  it('ability and style shares each add up to 1', () => {
    expect(ABILITIES.reduce((s, a) => s + GHOST_CONFIG.abilities[a].share, 0)).toBeCloseTo(1, 10);
    expect(STYLES.reduce((s, x) => s + GHOST_CONFIG.styles[x].share, 0)).toBeCloseTo(1, 10);
  });

  it('casts ghosts in exactly the configured proportions', () => {
    const cast = castOf(1000, seededRng('cast'));
    const n = (pred: (c: (typeof cast)[number]) => boolean) => cast.filter(pred).length;
    expect(ABILITIES.map((a) => n((c) => c.ability === a))).toEqual([100, 200, 400, 200, 100]);
    expect(STYLES.map((x) => n((c) => c.style === x))).toEqual([400, 350, 150, 100]);
    expect(quotas({ a: { share: 1 }, b: { share: 2 } }, ['a', 'b'], 10)).toHaveLength(10);
  });
});

describe('rule-based ghosts', () => {
  it('are deterministic for a fixed seed', () => {
    const p = getPrompt('prime-u1000');
    const a = generateRuleGhosts(p, 1000, seededRng('seed'), ctx);
    const b = generateRuleGhosts(p, 1000, seededRng('seed'), ctx);
    expect(a).toEqual(b);
    expect(generateRuleGhosts(p, 1000, seededRng('other'), ctx)).not.toEqual(a);
  });

  it('never hand in an invalid answer, for any prompt', () => {
    for (const p of PROMPTS) {
      const ghosts = generateRuleGhosts(p, 1100, seededRng(`v:${p.id}`), ctx);
      expect(ghosts).toHaveLength(1100);
      for (const g of ghosts) if (g.value !== null) expect(isValidAnswer(p, g.value), `${p.id}: ${g.value}`).toBe(true);
    }
  });

  it('time out at roughly the configured rate per ability', () => {
    const ghosts = PROMPTS.slice(0, 20).flatMap((p) => generateRuleGhosts(p, 1000, seededRng(`t:${p.id}`), ctx));
    for (const a of ABILITIES) {
      const mine = ghosts.filter((g) => g.ability === a);
      const rate = mine.filter((g) => g.value === null).length / mine.length;
      expect(rate, a).toBeCloseTo(GHOST_CONFIG.abilities[a].timeoutRate, 1);
    }
  });

  it('Ultra smart ghosts spread their answers wider than Panickers (entropy), on every prompt', () => {
    for (const p of PROMPTS) {
      const ultra = entropy(abilityDistribution(p, 'ultra', ctx).probs);
      const panic = entropy(abilityDistribution(p, 'panicker', ctx).probs);
      expect(ultra, p.id).toBeGreaterThan(panic);
    }
    // And in sampled ghosts, not just in theory.
    const p = getPrompt('prime-u1000');
    const ghosts = generateRuleGhosts(p, 5000, seededRng('entropy'), ctx);
    const by = (a: string) => ghosts.filter((g) => g.ability === a).map((g) => g.value);
    expect(sampleEntropy(by('ultra'))).toBeGreaterThan(sampleEntropy(by('panicker')) + 1.5);
  });

  it('only know the top of the salience list, by ability', () => {
    const p = getPrompt('prime-u1000');
    const support = (a: 'ultra' | 'average' | 'panicker') =>
      answerDistribution(p, a, 'safe', ctx).probs.filter((x) => x > 0).length;
    const n = validAnswers(p).length;
    expect(support('ultra')).toBe(n);
    expect(support('average')).toBe(Math.ceil(0.25 * n));
    expect(support('panicker')).toBe(Math.ceil(0.04 * n));
  });

  it('show-offs go for the clever list, safe players for the obvious', () => {
    const p = getPrompt('prime-u1000');
    const show = answerDistribution(p, 'average', 'showoff', ctx);
    show.values.forEach((v, i) => {
      if (show.probs[i]! > 0) expect(p.cleverList).toContain(v);
    });
    const safe = answerDistribution(p, 'average', 'safe', ctx);
    const risk = answerDistribution(p, 'average', 'risk', ctx);
    const mean = (d: typeof safe) => d.values.reduce((s, v, i) => s + v * d.probs[i]!, 0);
    expect(mean(risk)).toBeGreaterThan(mean(safe));
    // No clever list: show-offs act like risk-takers.
    const plain = getPrompt('mult3and4-u100');
    expect(plain.cleverList).toHaveLength(0);
    expect(answerDistribution(plain, 'pretty', 'showoff', ctx).probs).toEqual(answerDistribution(plain, 'pretty', 'risk', ctx).probs);
  });

  it('favour the most salient answers but leave a long tail', () => {
    const p = getPrompt('prime-u1000');
    const c = counts(generateRuleGhosts(p, 20000, seededRng('tail'), ctx).map((g) => g.value));
    expect((c.get(7) ?? 0) + (c.get(2) ?? 0)).toBeGreaterThan((c.get(683) ?? 0) * 20);
    expect(c.size).toBeGreaterThan(100);
  });
});

describe('ghost weight in a full day', () => {
  it('totals about 100 players at 0 real players and exactly 0 at 500', () => {
    const p = getPrompt('prime-u1000');
    const { ghosts } = assemblePromptGhosts(p, 1, buildAiCast('2026-11-13'), null, seededRng('w'), ctx);
    expect(ghosts).toHaveLength(1100);
    const w0 = ghostWeight(0, ghosts.length);
    expect(w0 * ghosts.length).toBeCloseTo(100, 10);
    const answered = ghosts.filter((g) => g.value !== null).length * w0;
    expect(answered).toBeGreaterThan(85);
    expect(answered).toBeLessThanOrEqual(100);
    expect(ghostWeight(500, ghosts.length) * ghosts.length).toBe(0);
  });
});
