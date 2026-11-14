// Versus against real people, through Supabase.
//
// Making a match (choosing its questions and storing their answer keys) is done
// by the `versus` Edge Function, because only it has the question bank. After
// that everything is plain RPCs: join, state, answer, start, leave. Postgres
// checks every answer against the stored keys; scores are worked out from the
// answers by everyone's own browser with the same rules (see versus.ts).
//
// Players are identified by the anonymous id from player.ts, which never leaves
// the server again: other players only ever see seat numbers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient.ts';
import { getPlayerId } from './player.ts';
import { createLocalVersus } from './versusLocal.ts';
import type { AnswerOutcome, MatchKind, MatchStatus, VersusBackend, VersusState } from './versus.ts';

interface RawState {
  id: string;
  code: string | null;
  kind: MatchKind;
  size: number;
  status: MatchStatus;
  host_seat: number;
  my_seat: number;
  year: number;
  round: number;
  round_starts_at: number | null;
  closed_at: number | null;
  start_by: number | null;
  server_now: number;
  players: { seat: number; name: string; left: boolean }[];
  rounds: { round: number; prompt_id: string; answered: number[]; answers: { seat: number; value: number | null }[] | null }[];
}

/** Turns server error codes into sentences a player can act on. */
const MESSAGES: Record<string, string> = {
  no_such_room: "There's no room with that code. Check it and try again.",
  room_full: 'That room is full.',
  already_started: 'That match has already started.',
  not_in_match: "You're not in that match.",
  not_host: 'Only the person who made the room can start it.',
  need_two: 'You need at least one other player to start.',
};

function friendly(message: string): Error {
  const code = Object.keys(MESSAGES).find((k) => message.includes(k));
  return new Error(code ? MESSAGES[code] : "Can't reach the game server. Check your connection and try again.");
}

export function createOnlineVersus(url: string, anonKey: string): VersusBackend {
  const supabase: SupabaseClient = supabaseClient(url, anonKey);
  const player = getPlayerId();
  const ghosts = createLocalVersus();
  const isGhost = (id: string) => id.startsWith('ghost-');

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await supabase.rpc(name, args).then(
      (r) => r,
      (e: unknown) => ({ data: null, error: { message: String(e) } }),
    );
    if (res.error) throw friendly(res.error.message);
    return res.data as T;
  }

  async function make(action: 'quick' | 'create', name: string, size: number): Promise<string> {
    const { data, error } = await supabase.functions.invoke('versus', { body: { action, player, name, size } });
    if (error || !data?.id) throw friendly(String(data?.error ?? error?.message ?? ''));
    return data.id as string;
  }

  return {
    kind: 'online',
    quickMatch: (name, size) => make('quick', name, size),
    createRoom: (name, size) => make('create', name, size),
    joinRoom: (name, code) => rpc<string>('versus_join', { p_player: player, p_name: name, p_code: code }),
    playGhosts: (name, size) => ghosts.playGhosts(name, size),
    start: (id) => (isGhost(id) ? ghosts.start(id) : rpc<void>('versus_start', { p_player: player, p_match: id })),
    leave: (id) => (isGhost(id) ? ghosts.leave(id) : rpc<void>('versus_leave', { p_player: player, p_match: id })),
    state: async (id) => {
      if (isGhost(id)) return ghosts.state(id);
      const r = await rpc<RawState>('versus_state', { p_player: player, p_match: id });
      const state: VersusState = {
        id: r.id,
        code: r.code,
        kind: r.kind,
        size: r.size,
        status: r.status,
        hostSeat: r.host_seat,
        mySeat: r.my_seat,
        year: r.year,
        players: r.players.map((p) => ({ ...p, ghost: false, me: p.seat === r.my_seat })),
        round: r.round,
        roundStartsAt: r.round_starts_at,
        closedAt: r.closed_at,
        startBy: r.start_by,
        serverNow: r.server_now,
        rounds: r.rounds.map((x) => ({ round: x.round, promptId: x.prompt_id, answered: x.answered, answers: x.answers })),
      };
      return state;
    },
    answer: (id, round, value) =>
      isGhost(id)
        ? ghosts.answer(id, round, value)
        : rpc<AnswerOutcome>('versus_answer', { p_player: player, p_match: id, p_round: round, p_value: value }),
  };
}

/** Online when the game server is configured; otherwise ghosts only. */
export function createVersusBackend(): VersusBackend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return createOnlineVersus(url, key);
  return createLocalVersus();
}
