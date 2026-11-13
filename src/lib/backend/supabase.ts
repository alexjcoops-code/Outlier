// The real backend: Supabase RPCs. All scoring and validation happens in Postgres.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPlayerId } from '../player.ts';
import type { TierId } from '../scoring.ts';
import { ukDateString } from '../ukDate.ts';
import {
  OfflineError,
  type AdminStats,
  type Backend,
  type DayResults,
  type Distribution,
  type SubmitResult,
} from './types.ts';

interface RpcError {
  message: string;
  code?: string;
}

/** Errors raised on purpose by our SQL carry a Postgres code; anything else is the network. */
function fail(error: RpcError): never {
  if (error.code && /^[A-Z0-9]{5}$/.test(error.code)) throw new Error(error.message);
  throw new OfflineError(error);
}

interface RawResults {
  date: string;
  final: boolean;
  total: number;
  players: number;
  simulated: boolean;
  average: number | null;
  top10: number | null;
  rows: {
    position: number;
    prompt_id: string;
    started: boolean;
    value: number | null;
    tier: TierId;
    points: number;
    share: number | null;
  }[];
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const supabase: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const player = getPlayerId();

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    let res;
    try {
      res = await supabase.rpc(name, args);
    } catch (e) {
      throw new OfflineError(e);
    }
    if (res.error) fail(res.error);
    return res.data as T;
  }

  async function fetchResults(date: string): Promise<DayResults> {
    const raw = await rpc<RawResults>('get_results', { p_date: date, p_player_id: player });
    return {
      ...raw,
      rows: raw.rows.map(({ prompt_id, ...row }) => ({ ...row, promptId: prompt_id })),
    };
  }

  return {
    kind: 'supabase',

    async getResults(date) {
      let results = await fetchResults(date);
      if (results.rows.length === 0 && date === ukDateString()) {
        // The nightly job hasn't produced today's worksheet. Ask for it (this is
        // safe to call by anyone: it only ever creates today, once) and look again.
        try {
          await supabase.functions.invoke('prepare-day', { body: { date } });
        } catch (e) {
          throw new OfflineError(e);
        }
        results = await fetchResults(date);
      }
      if (results.rows.length === 0) throw new Error('no_worksheet');
      return results;
    },

    async startPrompt(date, position) {
      const data = await rpc<{ remaining_ms: number }>('start_prompt', {
        p_date: date,
        p_position: position,
        p_player_id: player,
      });
      return { remainingMs: data.remaining_ms };
    },

    submitAnswer(date, position, value) {
      return rpc<SubmitResult>('submit_answer', {
        p_date: date,
        p_position: position,
        p_value: value,
        p_player_id: player,
      });
    },

    getDistribution(date, position) {
      return rpc<Distribution>('get_distribution', {
        p_date: date,
        p_position: position,
        p_player_id: player,
      });
    },

    async getAdminStats(date, secret): Promise<AdminStats> {
      const { data, error } = await supabase.functions.invoke('admin-stats', {
        body: { date },
        headers: { 'x-admin-secret': secret },
      });
      if (error || !data) throw new Error('denied');
      const raw = data as {
        date: string;
        players: number;
        prompts: { position: number; prompt_id: string; real_total: number; values: AdminStats['prompts'][number]['values'] }[];
      };
      return {
        date: raw.date,
        players: raw.players,
        prompts: raw.prompts.map((p) => ({
          position: p.position,
          promptId: p.prompt_id,
          realTotal: p.real_total,
          values: p.values,
        })),
      };
    },
  };
}
