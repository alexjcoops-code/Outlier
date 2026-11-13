// admin-stats: ghost answers against real ones, per prompt, for the /admin page.
// Protected by ADMIN_SECRET (set with `supabase secrets set`). The secret is
// checked here, on the server; it is never shipped in the client bundle.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders, json, secretsMatch } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!secretsMatch(req.headers.get('x-admin-secret'), Deno.env.get('ADMIN_SECRET'))) {
    return json({ error: 'forbidden' }, 403);
  }

  let date: unknown;
  try {
    ({ date } = await req.json());
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'bad_date' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('admin_distribution', { p_date: date });
  if (error) {
    console.error('admin_distribution failed', error);
    return json({ error: 'query_failed' }, 500);
  }
  return json(data);
});
