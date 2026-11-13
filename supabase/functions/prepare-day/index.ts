// prepare-day: chooses a day's seven prompts, writes the answer key, and generates
// the ghost players: per prompt, 1,000 rule-based plus 100 played by Claude
// (or 1,100 rule-based if the Claude call fails).
//
// Two ways in:
//   • The nightly schedule (pg_cron, with the x-cron-secret header) prepares
//     TOMORROW at 23:30 UK time. pg_cron runs in UTC, so the job fires at both
//     22:30 and 23:30 UTC and this function ignores whichever isn't 23:xx in London.
//   • Anyone may ask for TODAY if it is missing (the schedule failed, or this is a
//     brand-new project). That path never calls Claude, so strangers can't spend
//     your API credit: it uses 1,100 rule-based ghosts per prompt.
//
// It is idempotent: a day that already exists is left alone.

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders, json, secretsMatch } from '../_shared/http.ts';
import { getPrompt, validAnswers, type Prompt } from '../_shared/core/prompts.ts';
import { NO_REPEAT_DAYS, dailyPromptIds, selectDay } from '../_shared/core/lib/daily.ts';
import {
  GHOST_SCHEMA,
  assemblePromptGhosts,
  buildAiCast,
  buildGhostUserMessage,
  ghostSystemPrompt,
  parseGhostReply,
  type AiReplyEntry,
  type CastMember,
  type GhostAnswer,
} from '../_shared/core/lib/ghostAi.ts';
import { seededRng } from '../_shared/core/lib/rng.ts';
import { addDays, ukDateString, ukParts } from '../_shared/core/lib/ukDate.ts';

const MODEL = 'claude-opus-5-5';

/**
 * Ask Claude to play the day's 100-person cast on one prompt. Returns null on
 * any failure; the caller then uses rule-based ghosts for that prompt.
 */
async function askClaude(client: Anthropic, prompt: Prompt, cast: CastMember[]): Promise<Map<number, AiReplyEntry> | null> {
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // A quick role-play, not a hard problem: keep thinking light.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: GHOST_SCHEMA } },
      // If a safety classifier declines the request, let the API retry on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: ghostSystemPrompt(),
      messages: [{ role: 'user', content: buildGhostUserMessage(prompt, cast) }],
    });
    if (response.stop_reason !== 'end_turn') {
      console.warn(`${prompt.id}: Claude stopped early (${response.stop_reason})`);
      return null;
    }
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    const parsed = parseGhostReply(text);
    if (!parsed) console.warn(`${prompt.id}: could not read Claude's reply`);
    return parsed;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Claude API key was rejected');
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error('Claude API rate limit hit');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}: ${error.message}`);
    } else {
      console.error(`${prompt.id}: Claude call failed`, error);
    }
    return null;
  }
}

/** Prompt ids used in the 13 days before `date`: from the database where known, replayed otherwise. */
async function recentPromptIds(supabase: SupabaseClient, date: string): Promise<Set<string>> {
  const from = addDays(date, -(NO_REPEAT_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_prompts')
    .select('date, prompt_id')
    .gte('date', from)
    .lt('date', date);
  if (error) throw new Error(`reading history failed: ${error.message}`);
  const byDate = new Map<string, string[]>();
  for (const row of data as { date: string; prompt_id: string }[]) {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row.prompt_id]);
  }
  const recent = new Set<string>();
  for (let d = from; d < date; d = addDays(d, 1)) {
    for (const id of byDate.get(d) ?? dailyPromptIds(d)) recent.add(id);
  }
  return recent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { date?: unknown; force?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is fine */
  }

  const now = new Date();
  const today = ukDateString(now);
  const scheduled = secretsMatch(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'));

  let date: string;
  if (scheduled) {
    if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      date = body.date;
    } else {
      if (ukParts(now).hour !== 23 && body.force !== true) {
        return json({ skipped: 'not 23:xx in London' });
      }
      date = addDays(today, 1);
    }
  } else {
    if (body.date !== today) return json({ error: 'only today can be requested' }, 403);
    date = today;
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const existing = await supabase.from('daily_prompts').select('position', { count: 'exact', head: true }).eq('date', date);
    if (existing.error) throw new Error(existing.error.message);
    if ((existing.count ?? 0) > 0) return json({ date, created: false });

    const ids = selectDay(date, await recentPromptIds(supabase, date));
    const prompts = ids.map(getPrompt);
    const cast = buildAiCast(date);

    // One Claude call per prompt, all at once. No key, or not the schedule: rules only.
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (scheduled && !apiKey) console.warn('ANTHROPIC_API_KEY is not set; using rule-based ghosts only');
    const client = scheduled && apiKey ? new Anthropic({ apiKey, maxRetries: 0, timeout: 120_000 }) : null;
    const replies = await Promise.all(prompts.map((p) => (client ? askClaude(client, p, cast) : Promise.resolve(null))));

    const year = Number(date.slice(0, 4));
    const ghosts: GhostAnswer[] = [];
    const report = prompts.map((p, i) => {
      const { ghosts: g, stats } = assemblePromptGhosts(p, i + 1, cast, replies[i]!, seededRng(`ghosts:${date}:${i + 1}`), { year });
      ghosts.push(...g);
      return { prompt: p.id, ...stats };
    });

    const { data: created, error } = await supabase.rpc('install_day', {
      p_date: date,
      p_prompts: prompts.map((p, i) => ({
        position: i + 1,
        prompt_id: p.id,
        valid: validAnswers(p),
        clever: p.cleverList,
      })),
      p_ghosts: ghosts,
    });
    if (error) throw new Error(error.message);

    console.log(`prepared ${date}: created=${created}`, JSON.stringify(report));
    return json({ date, created, prompts: ids, ghosts: ghosts.length, ai: report });
  } catch (error) {
    console.error('prepare-day failed', error);
    return json({ error: 'prepare_failed' }, 500);
  }
});
