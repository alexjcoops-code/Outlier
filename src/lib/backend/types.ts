import type { TierId } from '../scoring.ts';

export const TIMER_MS = 25_000;
/** Allowance for network latency on top of the 25 seconds. The server uses the same figure. */
export const GRACE_MS = 3_000;

export interface DayRow {
  position: number; // 1 to 7
  promptId: string;
  /** Has the player seen this prompt? A started prompt with no answer scores 0. */
  started: boolean;
  value: number | null;
  tier: TierId;
  points: number;
  /** Weighted share of answers equal to the player's, 0 to 1. Null if no answer. */
  share: number | null;
}

export interface DayResults {
  date: string;
  /** False until the day has ended and scores are locked. */
  final: boolean;
  total: number;
  /** Real players who have answered today. */
  players: number;
  /** Are simulated (ghost) answers still part of the scoring? */
  simulated: boolean;
  /** Today's mean score and the score needed for the top 10%; null if unknown. */
  average: number | null;
  top10: number | null;
  rows: DayRow[];
}

export type SubmitResult =
  | { ok: true; tier: TierId; points: number; share: number; players: number; simulated: boolean }
  | { ok: false; reason: 'invalid' | 'expired' | 'already' | 'not_started' | 'rate_limited' };

export interface Distribution {
  players: number;
  simulated: boolean;
  /**
   * Every answer given, most common first. Shares are 0 to 1, weighted exactly as
   * in the scoring, and add up to 1.
   */
  values: { value: number; share: number }[];
}

export interface AdminPromptStats {
  position: number;
  promptId: string;
  realTotal: number;
  /** Real players who saw the prompt and ran out of time. */
  realTimeouts: number;
  /** All ghosts, and those who ran out of time. */
  ghostCount: number;
  ghostTimeouts: number;
  /** Answer counts per source, sorted by value. */
  values: { value: number; real: number; rules: number; ai: number }[];
}

export interface AdminStats {
  date: string;
  players: number;
  prompts: AdminPromptStats[];
}

export interface Backend {
  kind: 'local' | 'supabase';
  /** The day's prompts and the player's progress. Never reveals other people's answers. */
  getResults(date: string): Promise<DayResults>;
  /** Start (or re-join) the timer for a prompt. Prompts must be started in order. */
  startPrompt(date: string, position: number): Promise<{ remainingMs: number }>;
  submitAnswer(date: string, position: number, value: number): Promise<SubmitResult>;
  /** The whole crowd for a prompt. Only once the player has finished with it, or the day is over. */
  getDistribution(date: string, position: number): Promise<Distribution>;
  getAdminStats(date: string, secret: string): Promise<AdminStats>;
}

/** Thrown when the server can't be reached at all. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super("Can't reach the staffroom");
    this.name = 'OfflineError';
    this.cause = cause;
  }
}
