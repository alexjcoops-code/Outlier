// A tiny stand-in for a Supabase project, for the online versus test.
//
// It runs the real migrations in an in-process Postgres (PGlite) and answers
// the two kinds of request the app makes:
//   POST /rest/v1/rpc/<function>   → select public.<function>(named args)
//   POST /functions/v1/versus      → the versus Edge Function's logic
// Only what versus needs; the daily game isn't served.
//
//   node --experimental-strip-types tests/e2e/fakeSupabase.ts 54329

import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { getPrompt, validAnswers } from '../../src/prompts.ts';
import { cleanName, pickVersusPrompts, randomCode, randomName } from '../../src/lib/versus.ts';

const port = Number(process.argv[2] ?? 54329);
const migration = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

const db = new PGlite();
await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
await db.exec(migration('20261113000000_init.sql'));
await db.exec(migration('20261114000000_versus.sql'));

const ALLOWED = new Set(['versus_join', 'versus_state', 'versus_answer', 'versus_start', 'versus_leave']);

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const res = await db.query<{ r: unknown }>(sql, names.map((n) => args[n]));
  return res.rows[0]?.r ?? null;
}

/** What supabase/functions/versus does, against the same database. */
async function versusFunction(body: { action: string; player: string; name?: string; size: number }) {
  const name = cleanName(body.name ?? '') || randomName();
  const make = async (kind: 'quick' | 'private') => {
    const promptIds = pickVersusPrompts(crypto.randomUUID());
    const keys = promptIds.map((id, i) => ({ round: i + 1, valid: validAnswers(getPrompt(id)) }));
    return call('versus_create', {
      p_player: body.player,
      p_name: name,
      p_kind: kind,
      p_size: body.size,
      p_code: kind === 'private' ? randomCode() : null,
      p_prompt_ids: promptIds,
      p_year: 2026,
      p_keys: JSON.stringify(keys),
    });
  };
  if (body.action === 'quick') {
    const seat = await call('versus_join_quick', { p_player: body.player, p_name: name, p_size: body.size });
    return { id: seat ?? (await make('quick')) };
  }
  return { id: await make('private') };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function read(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

// One query at a time, like a single database connection.
let queue = Promise.resolve();

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  queue = queue.then(async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const body = await read(req);
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
      if (rpc && ALLOWED.has(rpc[1]!)) return send(res, 200, await call(rpc[1]!, body));
      if (url.pathname === '/functions/v1/versus') return send(res, 200, await versusFunction(body));
      if (url.pathname === '/health') return send(res, 200, { ok: true });
      send(res, 404, { message: 'not found' });
    } catch (e) {
      const err = e as { message?: string; code?: string };
      send(res, 400, { message: err.message ?? String(e), code: err.code ?? 'P0001' });
    }
  });
}).listen(port, () => console.log(`fake supabase on ${port}`));
