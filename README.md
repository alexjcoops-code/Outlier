# Outlier

A daily maths game where rare answers win.

Every day at midnight UK time everyone gets the same seven prompts, such as "Name a prime under 1,000". Each has many right answers. You have 25 seconds to type a whole number. Any right answer scores, but the fewer people who gave the same answer, the more it scores. Up to 100 a question, 700 a day.

| Tier | Points | Rule |
|---|---|---|
| Obvious | 10 | 20% or more of answers |
| Predictably Clever | 15 | on the prompt's "famous numbers" list (unless 20% or more, or under 3%) |
| Fair | 30 | 8% to under 20% |
| Rare | 60 | 3% to under 8% |
| Outlier | 85 | under 3% |
| Lone Wolf | 100 | nobody else, real or simulated, gave it |

## Quick start (no accounts needed)

```bash
npm install
npm run dev
```

With no Supabase settings the app runs against a built-in offline backend: the same prompts and scoring rules, with 100 rule-based "ghost" answers per prompt standing in for the crowd, and progress kept in `localStorage`. This is also what the end-to-end test uses.

```bash
npm test          # unit tests (Vitest), including the SQL run in an in-process Postgres
npm run e2e       # full-game end-to-end tests (Playwright; needs `npx playwright install chromium` once)
npm run typecheck
npm run build
```

## Going live

You need a [Supabase](https://supabase.com) project, the [Supabase CLI](https://supabase.com/docs/guides/cli), an [Anthropic API key](https://console.anthropic.com) and a [Vercel](https://vercel.com) account.

### 1. Database

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Enable the `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions). Then store the three values the scheduled jobs need in Vault, from the SQL editor:

```sql
select vault.create_secret('https://<your-project-ref>.supabase.co/functions/v1', 'outlier_functions_url');
select vault.create_secret('<your anon key>', 'outlier_anon_key');
select vault.create_secret('<a long random string>', 'outlier_cron_secret');
```

Apply the migrations (schema, row level security, RPCs, schedules):

```bash
supabase db push
```

### 2. Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=<your key>
supabase secrets set ADMIN_SECRET=<password for /admin>
supabase secrets set CRON_SECRET=<the same random string you put in Vault>

npm run sync:shared            # copies src/ game logic into supabase/functions/_shared/core
supabase functions deploy prepare-day
supabase functions deploy admin-stats
```

Create the first worksheet straight away rather than waiting for 23:30:

```bash
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/prepare-day" \
  -H "Authorization: Bearer <your anon key>" -H "x-cron-secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" -d '{"date":"<today, YYYY-MM-DD, London>"}'
```

(If you skip this, the first visitor of the day triggers it automatically, with rule-based ghosts only.)

### 3. Front end on Vercel

Import the repository in Vercel (it detects Vite; `vercel.json` adds the single-page rewrite) and set two environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your project's anon key |

Those two are public by design. The Anthropic key, admin secret and cron secret live only in Supabase and are never in the client bundle. `.env.example` lists everything.

## How it works

### The day

- The game day is midnight to midnight in `Europe/London`. Dates are worked out with `Intl` in the browser and `at time zone 'Europe/London'` in Postgres, so GMT/BST is never hand-rolled.
- `src/lib/daily.ts` picks seven prompts with a shuffle seeded by the date, skipping anything used in the previous 13 days, ordered easy to hard (three easy, three medium, one hard).
- The bank in `src/prompts.ts` has 120 prompts. It has to be large: no repeats within 14 days at seven a day means 91 prompts are unavailable on any given day.

### Scoring

For your answer to a prompt:

```
w      = max(0, 1 − realPlayersToday ÷ 200)            ghost weight
share  = (real answers equal to yours + w × ghost answers equal to yours)
       ÷ (all real answers + w × all ghost answers)     your own answer included
```

Then, in order: Lone Wolf if nobody else gave it (ghosts only count while `w > 0`); Obvious if share ≥ 20%; Outlier if share < 3%; Predictably Clever if it is on the prompt's clever list; Fair if share ≥ 8%; otherwise Rare.

Scores are live and labelled "provisional" until the day ends. `finalise_due_days()` runs just after midnight UK time and copies each player's total and tiers into `final_scores`.

The rule exists twice, in `src/lib/scoring.ts` and as `score_tier` in SQL. `tests/unit/sql.test.ts` checks the two agree on 3,000 random cases.

### Ghost players

At 23:30 UK time the `prepare-day` function generates 100 ghost answers per prompt for the next day:

- **50 rule-based.** Every valid answer is weighted by how likely a person is to think of it (small numbers, the first few valid answers, numbers ending in 0 or 5, times-table numbers, famous numbers, ages, birth years, repeated digits) and sampled. All the weights are in `src/lib/ghostWeights.ts`.
- **50 from Claude.** One request asks the model to play 50 people of mixed ability under time pressure and return JSON. Every answer is validated; invalid or missing ones are replaced with rule-based samples. If the call fails for any reason, the day gets 100 rule-based ghosts.

The UI always says what the score is based on, for example "Based on 14 players + simulated answers". Ghosts fade out linearly and are gone at 200 real players.

`/admin` (password: `ADMIN_SECRET`) shows real, rule-based and AI answer distributions side by side for each prompt, with a "gap" figure (total variation distance between real answers and ghosts), for tuning the weights.

### Not cheatable from the client

- Tables have row level security with no client policies, apart from reading which prompts make up today and past days. Everything else goes through `SECURITY DEFINER` RPCs.
- `submit_answer` checks the value against that day's answer key (generated from the TypeScript validators when the day is prepared), checks the server-side clock started by `start_prompt` (25 seconds plus 3 for the network), allows one answer per prompt, and rate-limits each player id to 20 submissions per 30 seconds.
- `get_distribution` refuses until you have answered that prompt or run out of time on it.
- Tomorrow's prompts exist in the database from 23:30 but are hidden by policy until midnight.

There is no login, so a player is an anonymous UUID in `localStorage`. Clearing storage gives a new identity and another go; that is the accepted cost of having no accounts.

## Project layout

```
src/
  prompts.ts              the prompt bank: id, text, difficulty, range, validator, clever list
  lib/                    pure game logic (dates, daily selection, scoring, ghosts, parsing)
  lib/backend/            Backend interface; Supabase and offline implementations
  components/, pages/     React UI
  styles/                 plain CSS with variables (tokens.css)
supabase/
  migrations/             schema, RLS, RPCs; pg_cron schedules
  functions/prepare-day   nightly: prompts, answer key, ghosts
  functions/admin-stats   data for /admin
  functions/_shared/core  generated copy of src/ logic (npm run sync:shared)
tests/unit/               validators, selection, scoring, ghosts, SQL (PGlite)
tests/e2e/                Playwright: full game, resume, practice, number pad
```

## Changing things

- **Add a prompt:** add it to `src/prompts.ts` and add known valid and invalid cases to `tests/unit/validators.test.ts` (the suite fails if a prompt has no cases, fewer than 8 valid answers, or `^`/`*` in its text). Then `npm run sync:shared` and redeploy `prepare-day`.
- **Tune the ghosts:** edit `src/lib/ghostWeights.ts`, sync, redeploy.
- **Change the Claude model or prompt:** `MODEL` in `supabase/functions/prepare-day/index.ts`; the instructions are in `src/lib/ghostAi.ts`.
