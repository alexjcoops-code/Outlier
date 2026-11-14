// Fitting the ghost mix to real answers.
//
// Each (ability, style) pair has an exact answer distribution (ghostModel.ts).
// Real answers are treated as a mixture of those 20 distributions, and the
// mixture weights are fitted by expectation-maximisation. The suggested ability
// and style percentages are the fitted weights added up per ability and per style.

import { getPrompt } from '../prompts.ts';
import { ABILITIES, GHOST_CONFIG, STYLES, type Ability, type GhostConfig, type Style } from './ghostConfig.ts';
import { jensenShannon } from './divergence.ts';
import { answerDistribution } from './ghostModel.ts';

export interface Observation {
  date: string;
  promptId: string;
  /** Real answers: value → how many players gave it. */
  counts: ReadonlyMap<number, number>;
  /** Real players who saw the prompt and ran out of time. */
  timeouts: number;
}

export interface FitResult {
  abilities: Record<Ability, number>;
  styles: Record<Style, number>;
  /** Real answers used. */
  answers: number;
  /** Real answers no ghost could ever give (outside every ghost's distribution). */
  unexplained: number;
  /** Average Jensen-Shannon divergence between real answers and the model, before and after. */
  jsBefore: number;
  jsAfter: number;
  /** Observed real time-out rate, and what the configured and suggested mixes predict. */
  timeouts: { observed: number | null; configured: number; suggested: number };
}

type Cell = { ability: Ability; style: Style };
const CELLS: Cell[] = ABILITIES.flatMap((ability) => STYLES.map((style) => ({ ability, style })));

function mixture(obs: Observation, weights: number[], config: GhostConfig): Map<number, number> {
  const prompt = getPrompt(obs.promptId);
  const year = Number(obs.date.slice(0, 4));
  const out = new Map<number, number>();
  CELLS.forEach((c, k) => {
    const d = answerDistribution(prompt, c.ability, c.style, { year, config });
    d.probs.forEach((p, i) => {
      if (p > 0) out.set(d.values[i]!, (out.get(d.values[i]!) ?? 0) + weights[k]! * p);
    });
  });
  return out;
}

export function fitGhostMix(
  observations: readonly Observation[],
  config: GhostConfig = GHOST_CONFIG,
  iterations = 400,
): FitResult {
  const start = CELLS.map((c) => config.abilities[c.ability].share * config.styles[c.style].share);
  let weights = start.slice();

  // For each observation: the probability each cell gives each observed value.
  const rows: { n: number; p: number[] }[] = [];
  let answers = 0;
  let unexplained = 0;
  for (const obs of observations) {
    const prompt = getPrompt(obs.promptId);
    const year = Number(obs.date.slice(0, 4));
    const dists = CELLS.map((c) => answerDistribution(prompt, c.ability, c.style, { year, config }));
    for (const [value, n] of obs.counts) {
      if (n <= 0) continue;
      answers += n;
      const i = dists[0]!.values.indexOf(value);
      const p = dists.map((d) => (i >= 0 ? d.probs[i]! : 0));
      if (p.every((x) => x === 0)) unexplained += n;
      else rows.push({ n, p });
    }
  }

  for (let it = 0; it < iterations && rows.length > 0; it++) {
    const next = new Array<number>(CELLS.length).fill(0);
    for (const { n, p } of rows) {
      let denom = 0;
      for (let k = 0; k < p.length; k++) denom += weights[k]! * p[k]!;
      if (denom <= 0) continue;
      for (let k = 0; k < p.length; k++) next[k]! += (n * weights[k]! * p[k]!) / denom;
    }
    const total = next.reduce((s, x) => s + x, 0);
    weights = next.map((x) => Math.max(1e-9, x / total));
  }

  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, 0])) as Record<Ability, number>;
  const styles = Object.fromEntries(STYLES.map((s) => [s, 0])) as Record<Style, number>;
  CELLS.forEach((c, k) => {
    abilities[c.ability] += weights[k]!;
    styles[c.style] += weights[k]!;
  });

  const avgJs = (w: number[]) =>
    observations.length === 0
      ? 0
      : observations.reduce((s, o) => s + jensenShannon(o.counts, mixture(o, w, config)), 0) / observations.length;

  const timeoutsSeen = observations.reduce((s, o) => s + o.timeouts, 0);
  const predicted = (shares: Record<Ability, number>) =>
    ABILITIES.reduce((s, a) => s + shares[a] * config.abilities[a].timeoutRate, 0);

  return {
    abilities,
    styles,
    answers,
    unexplained,
    jsBefore: avgJs(start),
    jsAfter: avgJs(weights),
    timeouts: {
      observed: answers + timeoutsSeen > 0 ? timeoutsSeen / (answers + timeoutsSeen) : null,
      configured: predicted(Object.fromEntries(ABILITIES.map((a) => [a, config.abilities[a].share])) as Record<Ability, number>),
      suggested: predicted(abilities),
    },
  };
}
