// versus: makes live matches. It is the only part of versus that needs the
// question bank: it picks a match's five questions and stores their answer keys.
// Joining by code, playing and leaving are plain RPCs (see the versus migration).
//
// POST { action: 'quick', player, name, size }  a seat in an open quick match, or a new one
// POST { action: 'create', player, name, size } a new private room with a code
// Replies { id } or { error }.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders, json } from '../_shared/http.ts';
import { getPrompt, validAnswers } from '../_shared/core/prompts.ts';
import { ukDateString } from '../_shared/core/lib/ukDate.ts';
import { VERSUS_SIZES, cleanName, pickVersusPrompts, randomCode, randomName } from '../_shared/core/lib/versus.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function makeMatch(supabase: SupabaseClient, kind: 'quick' | 'private', player: string, name: string, size: number) {
  const promptIds = pickVersusPrompts(crypto.randomUUID());
  const keys = promptIds.map((id, i) => ({ round: i + 1, valid: validAnswers(getPrompt(id)) }));
  const year = Number(ukDateString().slice(0, 4));
  // Codes are short, so a clash is possible: try a few.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.rpc('versus_create', {
      p_player: player,
      p_name: name,
      p_kind: kind,
      p_size: size,
      p_code: kind === 'private' ? randomCode() : null,
      p_prompt_ids: promptIds,
      p_year: year,
      p_keys: keys,
    });
    if (!error) return data as string;
    if (!/unique|duplicate/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error('could not find a free room code');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { action?: unknown; player?: unknown; name?: unknown; size?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const { action, player } = body;
  const size = Number(body.size);
  if ((action !== 'quick' && action !== 'create') || typeof player !== 'string' || !UUID.test(player)) {
    return json({ error: 'bad_request' }, 400);
  }
  if (!(VERSUS_SIZES as readonly number[]).includes(size)) return json({ error: 'bad_size' }, 400);
  const name = cleanName(typeof body.name === 'string' ? body.name : '') || randomName();

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    if (action === 'quick') {
      const { data, error } = await supabase.rpc('versus_join_quick', { p_player: player, p_name: name, p_size: size });
      if (error) throw new Error(error.message);
      if (data) return json({ id: data });
      return json({ id: await makeMatch(supabase, 'quick', player, name, size) });
    }
    return json({ id: await makeMatch(supabase, 'private', player, name, size) });
  } catch (e) {
    console.error('versus failed', e);
    return json({ error: 'server_error' }, 500);
  }
});
