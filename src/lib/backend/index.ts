import { createLocalDailyBackend } from './local.ts';
import { createSupabaseBackend } from './supabase.ts';
import type { Backend } from './types.ts';

/**
 * The backend for the daily game. With Supabase configured, that's the real
 * thing; without it, a self-contained offline version so the app still runs
 * (handy for development and for the end-to-end test).
 */
export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return createSupabaseBackend(url, key);
  return createLocalDailyBackend(window.localStorage);
}
