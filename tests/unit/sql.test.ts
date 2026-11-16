// Runs the real migration in an in-process Postgres (PGlite) and exercises the RPCs.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrompt, validAnswers } from '../../src/prompts.ts';
import { dailyPromptIds } from '../../src/lib/daily.ts';
import { scoreAnswer } from '../../src/lib/scoring.ts';
import { seededRng } from '../../src/lib/rng.ts';

const MIGRATION = readFileSync(new URL('../../supabase/migrations/20261113000000_init.sql', import.meta.url), 'utf8');

let db: PGlite;
let today: string;
let ids: string[];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function rpc<T = any>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<{ r: T }>(`select ${sql} as r`, params);
  return res.rows[0]!.r;
}
const start = (player: number, position: number, date = today) =>
  rpc(`start_prompt($1::date, $2, $3::uuid)`, [date, position, uuid(player)]);
const submit = (player: number, position: number, value: number, date = today) =>
  rpc(`submit_answer($1::date, $2, $3, $4::uuid)`, [date, position, value, uuid(player)]);
const results = (player: number, date = today) => rpc(`get_results($1::date, $2::uuid)`, [date, uuid(player)]);
const distribution = (player: number, position: number, date = today) =>
  rpc(`get_distribution($1::date, $2, $3::uuid)`, [date, position, uuid(player)]);

/** Install a day the way the Edge Function does, with chosen ghosts for position 1. */
async function installDay(date: string, ghostsPos1: (number | null)[]) {
  const promptIds = dailyPromptIds(date);
  const prompts = promptIds.map((id, i) => {
    const p = getPrompt(id);
    return { position: i + 1, prompt_id: id, valid: validAnswers(p), clever: p.cleverList };
  });
  const ghosts = ghostsPos1.map((value, i) => ({
    position: 1,
    value,
    ability: (['ultra', 'pretty', 'average', 'weak', 'panicker'] as const)[i % 5],
    style: (['safe', 'mid', 'risk', 'showoff'] as const)[i % 4],
    source: i % 2 ? 'ai' : 'rules',
  }));
  return rpc<boolean>(`install_day($1::date, $2::jsonb, $3::jsonb)`, [date, JSON.stringify(prompts), JSON.stringify(ghosts)]);
}

beforeAll(async () => {
  db = new PGlite();
  // Supabase provides these roles; a bare Postgres does not.
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  await db.exec(MIGRATION);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261116000000_harder_tiers.sql', import.meta.url), 'utf8'));
  today = (await db.query<{ d: string }>(`select uk_today()::text as d`)).rows[0]!.d;
  ids = dailyPromptIds(today);
});

describe('score_tier matches the TypeScript scoring', () => {
  it('agrees on 3,000 random crowds', async () => {
    const rng = seededRng('parity');
    const cases = Array.from({ length: 3000 }, () => {
      const totalReal = 1 + Math.floor(rng() * 400);
      const sameReal = 1 + Math.floor(rng() * Math.min(totalReal, 60));
      const ghostCount = rng() < 0.1 ? 0 : rng() < 0.5 ? 100 : 1100;
      const totalGhost = Math.floor(ghostCount * (0.85 + rng() * 0.15));
      const sameGhost = totalGhost ? Math.floor(rng() * rng() * (ghostCount / 3)) : 0;
      const realPlayers = rng() < 0.2 ? totalReal : Math.floor(rng() * 650);
      return { sameReal, totalReal, sameGhost, totalGhost, ghostCount, realPlayers, clever: rng() < 0.3 };
    });
    const res = await db.query<{ i: number; tier: string; share: number }>(
      `select (c->>'i')::int as i, t.tier, t.share
       from jsonb_array_elements($1::jsonb) c,
       lateral score_tier((c->>'sameReal')::int, (c->>'totalReal')::int, (c->>'sameGhost')::int,
                          (c->>'totalGhost')::int, (c->>'ghostCount')::int, (c->>'realPlayers')::int,
                          (c->>'clever')::boolean) t`,
      [JSON.stringify(cases.map((c, i) => ({ ...c, i })))],
    );
    expect(res.rows).toHaveLength(cases.length);
    for (const row of res.rows) {
      const ts = scoreAnswer(cases[row.i]!);
      expect(row.tier, JSON.stringify(cases[row.i])).toBe(ts.tier);
      expect(row.share).toBeCloseTo(ts.share, 10);
    }
  });

  it('gives the right points per tier', async () => {
    const r = await db.query<{ p: number[] }>(
      `select array[tier_points('obvious'), tier_points('clever'), tier_points('fair'), tier_points('rare'),
                    tier_points('outlier'), tier_points('lone'), tier_points('none')] as p`,
    );
    expect(r.rows[0]!.p).toEqual([10, 15, 30, 60, 85, 100, 0]);
  });
});

describe('a day in the database', () => {
  let valid: number[];
  let common: number;
  let rareish: number;
  let unseen: number;

  beforeAll(async () => {
    valid = validAnswers(getPrompt(ids[0]!));
    [common, rareish, unseen] = [valid[0]!, valid[1]!, valid[valid.length - 1]!];
    // 100 ghosts on question 1: 60 say the first answer, 5 the second, the rest spread thinly.
    const ghosts = [
      ...Array<number>(60).fill(common),
      ...Array<number>(5).fill(rareish),
      ...Array.from({ length: 35 }, (_, i) => valid[2 + (i % Math.max(1, valid.length - 3))]!),
    ];
    expect(await installDay(today, ghosts)).toBe(true);
  });

  it('install_day is idempotent and stores invalid ghost answers as time-outs', async () => {
    expect(await installDay(today, [1, 2, 3])).toBe(false);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from ghost_answers where date = $1`, [today]);
    expect(n.rows[0]!.n).toBe(100);

    const tomorrow = (await db.query<{ d: string }>(`select (uk_today() + 1)::text as d`)).rows[0]!.d;
    const v = validAnswers(getPrompt(dailyPromptIds(tomorrow)[0]!));
    const invalid = -5;
    expect(await installDay(tomorrow, [v[0]!, invalid, v[1]!, null])).toBe(true);
    const m = await db.query<{ n: number; answered: number }>(
      `select count(*)::int as n, count(value)::int as answered from ghost_answers where date = $1`, [tomorrow],
    );
    expect(m.rows[0]).toEqual({ n: 4, answered: 2 });
    const kinds = await db.query<{ ability: string; style: string }>(
      `select ability, style from ghost_answers where date = $1 order by id limit 1`, [tomorrow],
    );
    expect(kinds.rows[0]).toEqual({ ability: 'ultra', style: 'safe' });
  });

  it('shows the worksheet with nothing started', async () => {
    const r = await results(1);
    expect(r.final).toBe(false);
    expect(r.total).toBe(0);
    expect(r.rows.map((x: any) => x.prompt_id)).toEqual(ids);
    expect(r.rows.every((x: any) => x.started === false && x.tier === 'none' && x.value === null)).toBe(true);
    expect(r.simulated).toBe(true);
  });

  it('refuses tomorrow', async () => {
    await expect(rpc(`get_results((uk_today() + 1), $1::uuid)`, [uuid(1)])).rejects.toThrow(/not_yet/);
    await expect(rpc(`start_prompt((uk_today() + 1), 1, $1::uuid)`, [uuid(1)])).rejects.toThrow(/not_today/);
  });

  it('makes players take the questions in order', async () => {
    await expect(start(1, 2)).rejects.toThrow(/out_of_order/);
    await expect(start(1, 8)).rejects.toThrow(/no_such_question/);
    expect((await submit(1, 1, common)).reason).toBe('not_started');
    const s = await start(1, 1);
    expect(s.remaining_ms).toBeGreaterThan(24000);
    expect(s.remaining_ms).toBeLessThanOrEqual(25000);
  });

  it('no peeking at the distribution before answering', async () => {
    await expect(distribution(1, 1)).rejects.toThrow(/no_peeking/);
  });

  it('rejects invalid answers without locking anything in', async () => {
    const wrong = [4, 6, 8, 9, 10, 12].find((n) => !valid.includes(n))!;
    expect(await submit(1, 1, wrong)).toEqual({ ok: false, reason: 'invalid' });
    expect(await submit(1, 1, -1)).toEqual({ ok: false, reason: 'invalid' });
    const n = await db.query<{ n: number }>(`select count(*)::int as n from answers`);
    expect(n.rows[0]!.n).toBe(0);
  });

  it('accepts a valid answer once, and scores it live', async () => {
    const res = await submit(1, 1, common);
    // 100 ghosts and 1 real player: each ghost weighs 1 − 1/500 = 0.998.
    expect(res).toMatchObject({ ok: true, tier: 'obvious', points: 10, players: 1, simulated: true });
    expect(res.share).toBeCloseTo((1 + 0.998 * 60) / (1 + 0.998 * 100), 10);
    expect(await submit(1, 1, rareish)).toEqual({ ok: false, reason: 'already' });
  });

  it('gives Lone Wolf to an answer nobody else gave, and updates live shares', async () => {
    await start(2, 1);
    const lone = await submit(2, 1, unseen);
    expect(lone).toMatchObject({ ok: true, tier: 'lone', points: 100, players: 2 });

    await start(3, 1);
    const second = await submit(3, 1, unseen);
    // Two of about 102 (3 real players + 100 ghosts): each is 1% of everyone else,
    // the Rare band, and the biggest answer is on the clever list, which wins.
    expect(second.tier).toBe('clever');
    // Player 2's score has changed during the day: no longer alone.
    const r2 = await results(2);
    expect(r2.rows[0]).toMatchObject({ value: unseen, tier: 'clever', points: 15, started: true });
    expect(r2.total).toBe(15);
    expect(r2.players).toBe(3);
  });

  it('expires answers after 25 seconds plus grace', async () => {
    await start(4, 1);
    await db.query(`update prompt_starts set started_at = now() - interval '27 seconds' where player_id = $1`, [uuid(4)]);
    expect((await start(4, 1)).remaining_ms).toBe(0);
    // Inside the 3-second grace: still accepted.
    expect((await submit(4, 1, rareish)).ok).toBe(true);

    await start(5, 1);
    await db.query(`update prompt_starts set started_at = now() - interval '29 seconds' where player_id = $1`, [uuid(5)]);
    expect(await submit(5, 1, common)).toEqual({ ok: false, reason: 'expired' });
    // Timed out, so now the distribution is visible, and question 2 can start.
    expect((await distribution(5, 1)).values.length).toBeGreaterThan(0);
    expect((await start(5, 2)).remaining_ms).toBeGreaterThan(0);
    const r = await results(5);
    expect(r.rows[0]).toMatchObject({ started: true, value: null, tier: 'none', points: 0, share: null });
    expect(r.rows[1]).toMatchObject({ started: true, value: null });
    expect(r.rows[2].started).toBe(false);
  });

  it('returns the top answers with weighted shares', async () => {
    const d = await distribution(1, 1);
    expect(d.players).toBe(4);
    expect(d.values[0].value).toBe(common);
    const w = 1 - 4 / 500;
    expect(d.values[0].share).toBeCloseTo((1 + w * 60) / (4 + w * 100), 10);
    for (let i = 1; i < d.values.length; i++) expect(d.values[i].share).toBeLessThanOrEqual(d.values[i - 1].share);
    // The whole crowd is returned, and the shares add up to 1.
    expect(d.values.reduce((s: number, v: any) => s + v.share, 0)).toBeCloseTo(1, 10);
    expect(d.values.some((v: any) => v.value === unseen)).toBe(true);
  });

  it('reports the day average and top-10% mark', async () => {
    const r = await results(1);
    // Players 1 to 5 have scores 10, 85, 85, rare-ish, 0.
    expect(r.average).toBeGreaterThan(0);
    expect(r.top10).toBeGreaterThanOrEqual(r.average);
  });

  it('rate-limits a player who hammers submit', async () => {
    await start(6, 1);
    const wrong = [4, 6, 8, 9, 10, 12].find((n) => !valid.includes(n))!;
    const reasons: string[] = [];
    for (let i = 0; i < 22; i++) reasons.push((await submit(6, 1, wrong)).reason);
    expect(reasons.slice(0, 20).every((r) => r === 'invalid')).toBe(true);
    expect(reasons.slice(20)).toEqual(['rate_limited', 'rate_limited']);
    // Other players are unaffected.
    await start(7, 1);
    expect((await submit(7, 1, common)).ok).toBe(true);
  });

  it('day_scores agrees with the per-answer scores', async () => {
    const all = await db.query<{ player_id: string; total: number; tiers: string[] }>(
      `select player_id::text, total, tiers from day_scores($1::date)`, [today],
    );
    expect(all.rows.length).toBe(7);
    for (const row of all.rows) {
      expect(row.tiers).toHaveLength(7);
      const n = Number(row.player_id.slice(-4));
      const r = await results(n);
      expect(row.total, `player ${n}`).toBe(r.total);
      expect(row.tiers).toEqual(r.rows.map((x: any) => x.tier));
    }
  });

  it('locks scores when the day is over', async () => {
    await expect(rpc(`finalise_day($1::date)`, [today])).rejects.toThrow(/day_not_over/);

    // Move the whole day into the past, as if midnight had struck.
    for (const t of ['daily_prompts', 'prompt_starts', 'answers', 'ghost_answers', 'day_stats']) {
      await db.query(`update ${t} set date = date - 1 where date = $1`, [today]);
    }
    const yesterday = (await db.query<{ d: string }>(`select (uk_today() - 1)::text as d`)).rows[0]!.d;
    const before = await results(2, yesterday);
    expect(before.final).toBe(false);

    expect(await rpc<number>(`finalise_due_days()`)).toBe(1);
    expect(await rpc<number>(`finalise_due_days()`)).toBe(0);

    const after = await results(2, yesterday);
    expect(after.final).toBe(true);
    expect(after.total).toBe(before.total);
    expect(after.rows.map((x: any) => x.tier)).toEqual(before.rows.map((x: any) => x.tier));

    const fs = await db.query<{ total: number; tiers: string[] }>(
      `select total, tiers from final_scores where date = $1 and player_id = $2`, [yesterday, uuid(2)],
    );
    expect(fs.rows[0]).toEqual({ total: 15, tiers: ['clever', 'none', 'none', 'none', 'none', 'none', 'none'] });

    // A past day's distribution is open to anyone, but it can no longer be played.
    expect((await distribution(99, 1, yesterday)).values.length).toBeGreaterThan(5);

    // Calibration snapshot saved for each prompt.
    const snap = await db.query<{ position: number; prompt_id: string; real_counts: any; ghost_counts: any; ghost_count: number; real_timeouts: number }>(
      `select position, prompt_id, real_counts, ghost_counts, ghost_count, real_timeouts
       from calibration_snapshots where date = $1 order by position`, [yesterday],
    );
    expect(snap.rows).toHaveLength(7);
    const q1 = snap.rows[0]!;
    expect(q1.prompt_id).toBe(ids[0]);
    expect(q1.ghost_count).toBe(100);
    expect(q1.real_counts[String(unseen)]).toBe(2);
    expect(q1.ghost_counts[String(common)]).toEqual({ rules: 30, ai: 30 });
    // Players 5 (too slow) and 6 (rate-limited) never answered question 1; player 5 abandoned question 2.
    expect(q1.real_timeouts).toBe(2);
    expect(snap.rows[1]!.real_timeouts).toBe(1);
    await expect(start(99, 1, yesterday)).rejects.toThrow(/not_today/);
  });

  it('admin_distribution splits real, rule and AI answers', async () => {
    const yesterday = (await db.query<{ d: string }>(`select (uk_today() - 1)::text as d`)).rows[0]!.d;
    const a = await rpc(`admin_distribution($1::date)`, [yesterday]);
    expect(a.prompts).toHaveLength(7);
    const q1 = a.prompts[0];
    expect(q1.prompt_id).toBe(ids[0]);
    expect(q1.ghost_count).toBe(100);
    expect(q1.ghost_timeouts).toBe(0);
    const sum = (k: string) => q1.values.reduce((s: number, v: any) => s + v[k], 0);
    expect(sum('rules')).toBe(50);
    expect(sum('ai')).toBe(50);
    expect(sum('real')).toBe(q1.real_total);
  });
});

describe('row level security', () => {
  it('lets anonymous clients call the game RPCs but not read or write tables', async () => {
    await db.exec('set role anon');
    try {
      for (const table of ['answers', 'ghost_answers', 'prompt_keys', 'prompt_starts', 'final_scores', 'submit_log', 'calibration_snapshots']) {
        await expect(db.query(`select * from ${table} limit 1`), table).rejects.toThrow(/permission denied/);
      }
      await expect(
        db.query(`insert into answers (date, player_id, position, value) values (current_date, $1, 1, 2)`, [uuid(50)]),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query(`insert into daily_prompts values (current_date, 1, 'x')`)).rejects.toThrow(/permission denied|row-level security/);

      // Internal functions are off limits too.
      await expect(db.query(`select install_day(current_date, '[]', '[]')`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select finalise_due_days()`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select admin_distribution(current_date)`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from day_scores(current_date)`)).rejects.toThrow(/permission denied/);

      // Past and present prompts are readable; tomorrow's are hidden by the policy.
      const visible = await db.query<{ date: string }>(`select distinct date::text from daily_prompts`);
      expect(visible.rows.length).toBeGreaterThan(0);
      const t = (await db.query<{ d: string }>(`select uk_today()::text as d`)).rows[0]!.d;
      for (const row of visible.rows) expect(row.date <= t).toBe(true);

      // And the public RPCs work.
      const r = await db.query<{ r: any }>(`select get_results(uk_today() - 1, $1::uuid) as r`, [uuid(1)]);
      expect(r.rows[0]!.r.rows).toHaveLength(7);
    } finally {
      await db.exec('reset role');
    }
    // Tomorrow's worksheet does exist; anon just couldn't see it.
    const all = await db.query<{ n: number }>(`select count(*)::int as n from daily_prompts where date > uk_today()`);
    expect(all.rows[0]!.n).toBe(7);
  });
});
