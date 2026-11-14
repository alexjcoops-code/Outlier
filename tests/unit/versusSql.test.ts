// Runs the versus migration in an in-process Postgres (PGlite) and plays matches
// through the RPCs. Time is simulated by moving a match's timestamps into the past.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { getPrompt, validAnswers } from '../../src/prompts.ts';
import { pickVersusPrompts } from '../../src/lib/versus.ts';

const read = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

let db: PGlite;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<{ r: T }>(`select ${sql} as r`, params);
  return res.rows[0]!.r;
}
async function fails(sql: string, params: unknown[], message: RegExp) {
  await expect(db.query(`select ${sql}`, params)).rejects.toThrow(message);
}

const promptIds = pickVersusPrompts('sql-test');
const keys = promptIds.map((id, i) => ({ round: i + 1, valid: validAnswers(getPrompt(id)) }));
const valid = (round: number, k = 0) => keys[round - 1]!.valid[k]!;
const invalid = (round: number) => {
  const set = new Set(keys[round - 1]!.valid);
  let n = 1;
  while (set.has(n)) n++;
  return n;
};

const create = (player: number, kind: 'quick' | 'private', size: number, code: string | null, name = `P${player}`) =>
  q<string>(`versus_create($1::uuid, $2, $3, $4, $5, $6::text[], 2026, $7::jsonb)`, [
    uuid(player), name, kind, size, code, promptIds, JSON.stringify(keys),
  ]);
const join = (player: number, code: string) => q<string>(`versus_join($1::uuid, $2, $3)`, [uuid(player), `P${player}`, code]);
const joinQuick = (player: number, size: number) => q<string | null>(`versus_join_quick($1::uuid, $2, $3)`, [uuid(player), `P${player}`, size]);
const state = (player: number, match: string) => q<any>(`versus_state($1::uuid, $2::uuid)`, [uuid(player), match]);
const answer = (player: number, match: string, round: number, value: number) =>
  q<string>(`versus_answer($1::uuid, $2::uuid, $3, $4)`, [uuid(player), match, round, value]);
const start = (player: number, match: string) => db.query(`select versus_start($1::uuid, $2::uuid)`, [uuid(player), match]);
const leave = (player: number, match: string) => db.query(`select versus_leave($1::uuid, $2::uuid)`, [uuid(player), match]);

/** Pretend `seconds` have passed for this match. */
async function wait(match: string, seconds: number) {
  const s = `interval '${seconds} seconds'`;
  await db.query(
    `update versus_matches set created_at = created_at - ${s}, round_starts_at = round_starts_at - ${s}, closed_at = closed_at - ${s} where id = $1`,
    [match],
  );
  await db.query(`update versus_answers set answered_at = answered_at - ${s} where match_id = $1`, [match]);
  await db.query(`delete from submit_log`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  await db.exec(read('20261113000000_init.sql'));
  await db.exec(read('20261114000000_versus.sql'));
});

describe('versus: private rooms', () => {
  it("joins by code, starts when full, and hides everyone's ids", async () => {
    const id = await create(1, 'private', 2, 'ABCDE', 'Ada!!<script>');
    await expect(start(1, id)).rejects.toThrow(/need_two/);
    let s = await state(1, id);
    expect(s.status).toBe('waiting');
    expect(s.players).toEqual([{ seat: 1, name: 'Adascript', left: false }]);
    await fails(`versus_state($1::uuid, $2::uuid)`, [uuid(2), id], /not_in_match/);

    expect(await join(2, 'abc-de')).toBe(id); // codes are forgiving about case and dashes
    expect(await join(2, 'ABCDE')).toBe(id); // joining twice is harmless
    s = await state(2, id);
    expect(s.status).toBe('playing');
    expect(s.my_seat).toBe(2);
    expect(s.host_seat).toBe(1);
    expect(s.round).toBe(1);
    expect(s.round_starts_at - s.server_now).toBeGreaterThan(3000);
    expect(JSON.stringify(s)).not.toContain(uuid(1).slice(-12));
    await fails(`versus_join($1::uuid, 'x', 'ABCDE')`, [uuid(3)], /already_started/);
  });

  it('rejects bad codes, full rooms and starts by anyone but the host', async () => {
    await fails(`versus_join($1::uuid, 'x', 'ZZZZZ')`, [uuid(9)], /no_such_room/);
    const id = await create(10, 'private', 3, 'FGHJK');
    await join(11, 'FGHJK');
    await expect(start(11, id)).rejects.toThrow(/not_host/);
    await start(10, id);
    expect((await state(10, id)).status).toBe('playing');
    await create(20, 'private', 2, 'MNPQR');
    await join(21, 'MNPQR');
    await fails(`versus_join($1::uuid, 'x', 'MNPQR')`, [uuid(22)], /already_started|room_full/);
  });

  it('passes the room on if the host leaves before the start', async () => {
    const id = await create(30, 'private', 4, 'STUVW');
    await join(31, 'STUVW');
    await leave(30, id);
    const s = await state(31, id);
    expect(s.players.map((p: any) => p.seat)).toEqual([2]);
    expect(s.host_seat).toBe(2);
  });
});

describe('versus: playing a match', () => {
  it('runs five rounds: answers checked, hidden until the round closes, then the next question', async () => {
    const id = await create(40, 'private', 2, 'XYZ23');
    await join(41, 'XYZ23');
    expect(await answer(40, id, 1, valid(1))).toBe('not_started');
    await wait(id, 5);

    expect(await answer(40, id, 1, invalid(1))).toBe('invalid');
    expect(await answer(40, id, 1, valid(1))).toBe('ok');
    expect(await answer(40, id, 1, valid(1, 1))).toBe('already');
    let s = await state(41, id);
    expect(s.rounds[0].answered).toEqual([1]);
    expect(s.rounds[0].answers).toBeNull(); // no peeking
    expect(s.rounds[0].prompt_id).toBe(promptIds[0]);

    expect(await answer(41, id, 1, valid(1))).toBe('ok');
    s = await state(41, id);
    expect(s.closed_at).not.toBeNull(); // everyone answered: closed straight away
    expect(s.rounds[0].answers).toEqual([{ seat: 1, value: valid(1) }, { seat: 2, value: valid(1) }]);
    expect(await answer(41, id, 1, valid(1, 2))).toBe('late');

    // The next question is handed out 3 s before it starts.
    await wait(id, 5);
    expect((await state(40, id)).round).toBe(1);
    await wait(id, 2);
    s = await state(40, id);
    expect(s.round).toBe(2);
    expect(s.rounds[1].prompt_id).toBe(promptIds[1]);
    expect(await answer(40, id, 2, valid(2))).toBe('not_started');

    // Round 2: only one answers; time runs out after 25 s plus 3 s grace.
    await wait(id, 3);
    expect(await answer(40, id, 2, valid(2))).toBe('ok');
    await wait(id, 26);
    expect(await answer(41, id, 2, valid(2))).toBe('ok'); // inside the grace
    await wait(id, 2);
    s = await state(40, id);
    expect(s.rounds[1].answers.map((a: any) => a.value)).toEqual([valid(2), valid(2)]);

    for (let round = 3; round <= 5; round++) {
      await wait(id, 9);
      s = await state(40, id);
      expect(s.round).toBe(round);
      await wait(id, 29); // nobody answers
      s = await state(40, id);
      expect(s.rounds[round - 1].answers).toEqual([{ seat: 1, value: null }, { seat: 2, value: null }]);
    }
    await wait(id, 9);
    expect((await state(40, id)).status).toBe('done');
  });

  it('closes a round without waiting for someone who has left', async () => {
    const id = await create(50, 'private', 3, 'B2C3D');
    await join(51, 'B2C3D');
    await join(52, 'B2C3D');
    await wait(id, 5);
    await leave(52, id);
    expect(await answer(50, id, 1, valid(1))).toBe('ok');
    expect(await answer(51, id, 1, valid(1, 1))).toBe('ok');
    const s = await state(50, id);
    expect(s.closed_at).not.toBeNull();
    expect(s.players.find((p: any) => p.seat === 3).left).toBe(true);
    await fails(`versus_answer($1::uuid, $2::uuid, 2, 1)`, [uuid(52), id], /not_in_match/);
  });

  it('gives up on a match everyone has left', async () => {
    const id = await create(60, 'private', 2, 'E4F5G');
    await join(61, 'E4F5G');
    await leave(60, id);
    await leave(61, id);
    const row = (await db.query<{ status: string }>(`select status from versus_matches where id = $1`, [id])).rows[0]!;
    expect(row.status).toBe('abandoned');
  });
});

describe('versus: quick matches', () => {
  it('seats strangers together, and starts with whoever came after 45 seconds', async () => {
    expect(await joinQuick(70, 4)).toBeNull(); // nobody waiting: the Edge Function makes one
    const id = await create(70, 'quick', 4, null);
    expect(await joinQuick(71, 4)).toBe(id);
    expect(await joinQuick(71, 4)).toBe(id); // asking again keeps your seat
    expect(await joinQuick(72, 6)).toBeNull(); // a different size is a different queue
    let s = await state(70, id);
    expect(s.status).toBe('waiting');
    expect(s.start_by - s.server_now).toBeGreaterThan(40_000);
    await wait(id, 46);
    s = await state(71, id);
    expect(s.status).toBe('playing');
    expect(s.players).toHaveLength(2);
  });

  it("doesn't start a quick match alone, and doesn't seat newcomers in old ones", async () => {
    const id = await create(80, 'quick', 2, null);
    await wait(id, 46);
    expect((await state(80, id)).status).toBe('waiting');
    expect(await joinQuick(81, 2)).toBeNull();
  });

  it('starts as soon as a quick match is full', async () => {
    const id = await create(90, 'quick', 2, null);
    expect(await joinQuick(91, 2)).toBe(id);
    expect((await state(90, id)).status).toBe('playing');
  });
});

describe('versus: permissions', () => {
  it('lets players call only the playing functions', async () => {
    const rows = (
      await db.query<{ name: string; anon: boolean }>(
        `select p.proname as name, has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'versus%'`,
      )
    ).rows;
    const allowed = rows.filter((r) => r.anon).map((r) => r.name).sort();
    expect(allowed).toEqual(['versus_answer', 'versus_join', 'versus_leave', 'versus_start', 'versus_state']);
  });
});
