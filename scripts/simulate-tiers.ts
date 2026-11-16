// How hard are Lone Wolf and Outlier? Plays every question in the bank against a
// simulated crowd, with three kinds of player, under the current rules and any
// alternatives listed in RULES below.
//
//   npm run sim:tiers              all 1,000 questions
//   npm run sim:tiers -- --quick   every fifth question
//
// Players:
//   typical      answers like a random member of the crowd (an ability and a
//                style drawn in the usual proportions)
//   bold         a strong player going for something unusual: the model's
//                ultra and pretty smart players in risk-taking mode
//   rare-hunter  knows the answers well and deliberately avoids the obvious half:
//                picks evenly among the less salient half of the valid answers
//   random       picks evenly among all valid answers (the most contrarian play)
//
// Crowds:
//   launch       no other real players: the ghost crowd only
//   busy         300 real players (simulated as typical players) plus the ghosts

import { PROMPTS, validAnswers, type Prompt } from '../src/prompts.ts';
import { ABILITIES, GHOST_CONFIG, STYLES } from '../src/lib/ghostConfig.ts';
import { answerDistribution, generateRuleGhosts, salience } from '../src/lib/ghostModel.ts';
import { seededRng, type Rng } from '../src/lib/rng.ts';
import { GHOST_CROWD, GHOST_FADE_PLAYERS, scoreAnswer } from '../src/lib/scoring.ts';

interface Rules {
  name: string;
  ghosts: number;
  /** Lone Wolf if fewer than this many weighted ghosts share the answer. */
  loneLimit: number;
  outlier: number;
  rare: number;
  fair: number;
  obvious: number;
  /**
   * Outlier by the rarest slice instead of a share: the answers at least as rare
   * as yours (yours included) make up less than this fraction of all answers.
   */
  tail?: number;
  /** Judge Outlier/Rare/Fair on the share of OTHER players' answers (yours left out). */
  others?: boolean;
  /** Use the game's own scoreAnswer() instead of the numbers above. */
  real?: boolean;
}

const RULES: Rules[] = [
  // What the rules were before 16 Nov 2026: Lone Wolf allowed half a weighted
  // player (up to 5 of 1,100 ghosts); Outlier was under 3% counting your own answer.
  { name: 'previous', ghosts: 1100, loneLimit: 0.5, outlier: 0.03, rare: 0.08, fair: 0.2, obvious: 0.2 },
  // The game as it is: scoreAnswer() from src/lib/scoring.ts.
  { name: 'now (scoreAnswer)', ghosts: 1100, loneLimit: 0, outlier: 0, rare: 0, fair: 0, obvious: 0, real: true },
  // Alternatives worth comparing against.
  { name: 'now + 3,000 ghosts', ghosts: 3000, loneLimit: 0, outlier: 0, rare: 0, fair: 0, obvious: 0, real: true },
  { name: 'Outlier < 1% of others', ghosts: 1100, loneLimit: 1e-9, outlier: 0.01, rare: 0.05, fair: 0.2, obvious: 0.2, others: true },
  { name: 'Outlier in rarest 3% slice', ghosts: 1100, loneLimit: 1e-9, outlier: 0.03, rare: 0.08, fair: 0.2, obvious: 0.2, tail: 0.03 },
];

const POINTS = { obvious: 10, clever: 15, fair: 30, rare: 60, outlier: 85, lone: 100 } as const;
type Tier = keyof typeof POINTS;

function tierOf(r: Rules, sameReal: number, totalReal: number, sameGhost: number, totalGhost: number, ghostCount: number, realPlayers: number, clever: boolean, tailShare: number): Tier {
  if (r.real) return scoreAnswer({ sameReal, totalReal, sameGhost, totalGhost, ghostCount, realPlayers, clever }).tier as Tier;
  const w = (GHOST_CROWD / ghostCount) * Math.max(0, 1 - realPlayers / GHOST_FADE_PLAYERS);
  const same = sameReal + w * sameGhost;
  const total = totalReal + w * totalGhost;
  const share = total > 0 ? same / total : 1;
  const others = total > 0 ? (same - 1) / total : 0;
  const judged = r.others ? others : share;
  if (sameReal <= 1 && w * sameGhost < r.loneLimit) return 'lone';
  if (share >= r.obvious) return 'obvious';
  if (judged < r.outlier && (r.tail === undefined || tailShare < r.tail)) return 'outlier';
  if (clever) return 'clever';
  if (judged >= r.rare) return 'fair';
  return 'rare';
}

/** What each kind of player answers, as a probability per valid answer. */
function strategies(prompt: Prompt, year: number): Record<string, number[]> {
  const values = validAnswers(prompt);
  const typical = new Array<number>(values.length).fill(0);
  for (const a of ABILITIES) {
    for (const s of STYLES) {
      const weight = GHOST_CONFIG.abilities[a].share * GHOST_CONFIG.styles[s].share;
      answerDistribution(prompt, a, s, { year }).probs.forEach((p, i) => (typical[i]! += weight * p));
    }
  }
  const sal = values.map((n, rank) => salience(n, rank, prompt, year, GHOST_CONFIG.salience));
  const order = values.map((_, i) => i).sort((a, b) => sal[a]! - sal[b]!); // least salient first
  const half = Math.max(1, Math.floor(values.length / 2));
  const hunter = new Array<number>(values.length).fill(0);
  for (const i of order.slice(0, half)) hunter[i] = 1 / half;
  const random = values.map(() => 1 / values.length);
  // A strong player going for something unusual: ultra or pretty smart, taking risks.
  const bold = new Array<number>(values.length).fill(0);
  for (const [a, wgt] of [['ultra', 1 / 3], ['pretty', 2 / 3]] as const) {
    answerDistribution(prompt, a, 'risk', { year }).probs.forEach((p, i) => (bold[i]! += wgt * p));
  }
  return { typical, bold, 'rare-hunter': hunter, random };
}

function sampleTypical(probs: number[], rng: Rng): number {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]!;
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

const quick = process.argv.includes('--quick');
const bank = quick ? PROMPTS.filter((_, i) => i % 5 === 0) : PROMPTS;
const year = 2026;
const REAL = 300;

type Tally = Record<Tier, number> & { points: number; n: number };
const blank = (): Tally => ({ obvious: 0, clever: 0, fair: 0, rare: 0, outlier: 0, lone: 0, points: 0, n: 0 });
const results = new Map<string, Tally>();
const tally = (key: string) => results.get(key) ?? (results.set(key, blank()), results.get(key)!);

const t0 = Date.now();
for (const prompt of bank) {
  const values = validAnswers(prompt);
  const index = new Map(values.map((v, i) => [v, i]));
  const plays = strategies(prompt, year);
  const clever = new Set(prompt.cleverList);
  for (const r of RULES) {
    const ghosts = generateRuleGhosts(prompt, r.ghosts, seededRng(`sim:${prompt.id}:${r.ghosts}`), { year });
    const ghostCounts = new Array<number>(values.length).fill(0);
    let answered = 0;
    for (const g of ghosts) if (g.value !== null) (ghostCounts[index.get(g.value)!]! += 1), answered++;
    // 300 real players, answering like typical players.
    const rng = seededRng(`sim-real:${prompt.id}`);
    const realCounts = new Array<number>(values.length).fill(0);
    for (let k = 0; k < REAL; k++) realCounts[sampleTypical(plays.typical!, rng)]! += 1;

    // The rarest-slice measure: for each answer, the weighted share of all answers
    // that are at least as rare (with the player's own answer added to theirs).
    const tailFor = (crowd: 'launch' | 'busy') => {
      const realPlayers = crowd === 'busy' ? REAL + 1 : 1;
      const w = (GHOST_CROWD / ghosts.length) * Math.max(0, 1 - realPlayers / GHOST_FADE_PLAYERS);
      const weight = values.map((_, i) => (crowd === 'busy' ? realCounts[i]! : 0) + w * ghostCounts[i]!);
      const total = weight.reduce((a, b) => a + b, 0) + 1;
      const order = values.map((_, i) => i).sort((a, b) => weight[a]! - weight[b]!);
      const tail = new Array<number>(values.length).fill(0);
      let run = 0;
      for (let k = 0; k < order.length; ) {
        let j = k;
        let sum = 0;
        while (j < order.length && weight[order[j]!] === weight[order[k]!]) sum += weight[order[j++]!]!;
        run += sum;
        for (let m = k; m < j; m++) tail[order[m]!] = (run + 1) / total;
        k = j;
      }
      return tail;
    };
    const tails = { launch: tailFor('launch'), busy: tailFor('busy') };
    for (const [who, probs] of Object.entries(plays)) {
      for (const crowd of ['launch', 'busy'] as const) {
        const t = tally(`${r.name}|${who}|${crowd}`);
        const dt = tally(`${r.name}|${who}|${crowd}|d${prompt.difficulty}`);
        probs.forEach((p, i) => {
          if (p === 0) return;
          const sameReal = 1 + (crowd === 'busy' ? realCounts[i]! : 0);
          const totalReal = 1 + (crowd === 'busy' ? REAL : 0);
          const tier = tierOf(r, sameReal, totalReal, ghostCounts[i]!, answered, ghosts.length, crowd === 'busy' ? REAL + 1 : 1, clever.has(values[i]!), tails[crowd][i]!);
          for (const x of [t, dt]) {
            x[tier] += p;
            x.points += p * POINTS[tier];
          }
        });
        t.n++;
        dt.n++;
      }
    }
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)}%`;
console.log(`${bank.length} questions, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
for (const crowd of ['launch', 'busy']) {
  console.log(`── ${crowd === 'launch' ? 'Launch: ghosts only' : `Busy: ${REAL} real players + ghosts`} ──`);
  console.log('rules                              player         Lone    Outlier  Rare    avg/q  day');
  for (const r of RULES) {
    for (const who of ['typical', 'bold', 'rare-hunter', 'random']) {
      const t = results.get(`${r.name}|${who}|${crowd}`)!;
      console.log(`${r.name.padEnd(34)} ${who.padEnd(12)} ${pct(t.lone / t.n)} ${pct(t.outlier / t.n)} ${pct(t.rare / t.n)} ${(t.points / t.n).toFixed(1).padStart(6)} ${Math.round((t.points / t.n) * 7).toString().padStart(4)}`);
    }
  }
  console.log('');
}
if (process.argv.includes('--by-difficulty')) {
  for (const r of RULES) {
    for (const d of [1, 2, 3]) {
      const t = results.get(`${r.name}|rare-hunter|launch|d${d}`)!;
      console.log(`${r.name.padEnd(34)} d${d} rare-hunter launch  Lone ${pct(t.lone / t.n)}  Outlier ${pct(t.outlier / t.n)}`);
    }
  }
}
