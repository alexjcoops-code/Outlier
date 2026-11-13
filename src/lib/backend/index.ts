import { createLocalDailyBackend } from './local.ts';
import type { Backend } from './types.ts';

/**
 * The backend for the daily game. With Supabase configured, that's the real
 * thing; without it, a self-contained offline version so the app still runs.
 */
export function createBackend(): Backend {
  return createLocalDailyBackend(window.localStorage);
}
