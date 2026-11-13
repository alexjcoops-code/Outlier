// Suggests new ability and style percentages for the ghost players, fitted to
// the last 14 days of real answers. Prints the suggestions; changes nothing.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run ghosts:suggest
//   npm run ghosts:suggest -- --file snapshots.json      (rows exported from calibration_snapshots)
//   npm run ghosts:suggest -- --days 28
//
// The service-role key is needed because calibration_snapshots has no client
// access. Keep it out of the browser and out of git.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fitGhostMix, type Observation } from '../src/lib/calibrate.ts';
import { ABILITIES, GHOST_CONFIG, STYLES } from '../src/lib/ghostConfig.ts';
import { PROMPTS } from '../src/prompts.ts';
import { addDays, ukDateString } from '../src/lib/ukDate.ts';

interface SnapshotRow {
  date: string;
  position: number;
  prompt_id: string;
  real_counts: Record<string, number>;
  real_timeouts: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadRows(days: number): Promise<SnapshotRow[]> {
  const file = arg('file');
  if (file) return JSON.parse(readFileSync(file, 'utf8')) as SnapshotRow[];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or pass --file snapshots.json.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const from = addDays(ukDateString(), -days);
  const { data, error } = await supabase
    .from('calibration_snapshots')
    .select('date, position, prompt_id, real_counts, real_timeouts')
    .gte('date', from)
    .order('date');
  if (error) {
    console.error(`Could not read calibration_snapshots: ${error.message}`);
    process.exit(1);
  }
  return data as SnapshotRow[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);

async function main() {
  const days = Number(arg('days') ?? 14);
  const rows = await loadRows(days);
  const known = new Set(PROMPTS.map((p) => p.id));
  const observations: Observation[] = rows
    .filter((r) => known.has(r.prompt_id))
    .map((r) => ({
      date: r.date,
      promptId: r.prompt_id,
      counts: new Map(Object.entries(r.real_counts).map(([v, n]) => [Number(v), n])),
      timeouts: r.real_timeouts,
    }));

  if (observations.length === 0) {
    console.log(`No locked days with real answers in the last ${days} days. Nothing to suggest yet.`);
    return;
  }

  const fit = fitGhostMix(observations);
  const dates = [...new Set(observations.map((o) => o.date))].sort();
  console.log(`\nFitted to ${fit.answers.toLocaleString('en-GB')} real answers across ${observations.length} prompts (${dates[0]} to ${dates.at(-1)}).`);
  if (fit.answers < 700) console.log('Warning: that is not many answers. Treat these suggestions as rough.');
  if (fit.unexplained > 0) {
    console.log(`${fit.unexplained} real answers are ones no ghost would ever give: consider raising reach for some abilities.`);
  }

  console.log('\nAbility        now  suggested');
  for (const a of ABILITIES) console.log(`  ${a.padEnd(10)} ${pct(GHOST_CONFIG.abilities[a].share)} ${pct(fit.abilities[a])}`);
  console.log('\nStyle          now  suggested');
  for (const s of STYLES) console.log(`  ${s.padEnd(10)} ${pct(GHOST_CONFIG.styles[s].share)} ${pct(fit.styles[s])}`);

  console.log('\nMatch to real answers (Jensen–Shannon divergence, 0 = identical, 1 = nothing in common):');
  console.log(`  current mix ${fit.jsBefore.toFixed(3)}   suggested mix ${fit.jsAfter.toFixed(3)}`);

  const t = fit.timeouts;
  if (t.observed !== null) {
    console.log('\nTime-outs:');
    console.log(`  real players ${pct(t.observed)}   current mix predicts ${pct(t.configured)}   suggested mix predicts ${pct(t.suggested)}`);
    if (Math.abs(t.suggested - t.observed) > 0.03) {
      console.log('  The gap is large: consider adjusting the timeoutRate values themselves.');
    }
  }

  const round = (x: number) => Math.round(x * 100) / 100;
  console.log('\nTo use these, edit src/lib/ghostConfig.ts (the shares must add up to 1), then run');
  console.log('`npm run sync:shared` and redeploy prepare-day. Suggested values, rounded:');
  console.log(`  abilities: ${ABILITIES.map((a) => `${a} ${round(fit.abilities[a])}`).join(', ')}`);
  console.log(`  styles:    ${STYLES.map((s) => `${s} ${round(fit.styles[s])}`).join(', ')}\n`);
}

void main();
