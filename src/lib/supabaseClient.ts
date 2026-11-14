import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const clients = new Map<string, SupabaseClient>();

/** One Supabase client per project for the whole app (the daily game and versus share it). */
export function supabaseClient(url: string, anonKey: string): SupabaseClient {
  const key = `${url}|${anonKey}`;
  let client = clients.get(key);
  if (!client) {
    client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    clients.set(key, client);
  }
  return client;
}
