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

With no Supabase settings the app runs against a built-in offline backend: the same prompts and scoring rules, with 1,100 rule-based "ghost" players per prompt (what the live game uses when the Claude API is down) standing in for the crowd, and progress kept in `localStorage`. This is also what the end-to-end test uses.

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

At 23:30 UK time `prepare-day` generates the next day's simulated players, per prompt: **1,000 rule-based ghosts plus 100 played by Claude**, stored in `ghost_answers(date, position, value, ability, style, source)`. A ghost who runs out of time has a null value.

Every ghost has an **ability** and, independently, a **playing style**. The proportions and behaviour of each are in `src/lib/ghostConfig.ts`:

| Ability | Share | Knows | Time-outs |
|---|---|---|---|
| Ultra smart | 10% | almost every valid answer | ~1% |
| Pretty smart | 20% | the most salient 60% | ~3% |
| Average | 40% | the most salient 25% | ~8% |
| Weak | 20% | the most salient 10% | ~20% |
| Panicker | 10% | the first thing that comes to mind | ~30% |

| Style | Share | Picks |
|---|---|---|
| Safe | 40% | the top of what they know |
| Mid | 35% | skips the first idea, a bit further down |
| Risk-taker | 15% | the least obvious answer they know |
| Show-off | 10% | the prompt's "Predictably Clever" list, else acts like a risk-taker |

"Salience" is how readily a person thinks of a number: small numbers, the first few valid answers, numbers ending in 0 or 5, times tables, repeated digits, famous numbers, ages, birth years and the current year are boosted; big patternless numbers and the top of the range are penalised. Salience ranks the valid answers (which sets each ability's reach) and weights the choice within reach, raised to a per-ability power: Ultra smart ghosts barely care, Panickers are driven by it. Every (ability, style) pair therefore has an exact answer distribution (`src/lib/ghostModel.ts`), which ghosts sample from.

**AI ghosts.** One Claude call per prompt (all seven at once) asks the model to play the day's 100-person cast, each with an ability, a style and a short persona ("Year 9 student, average at maths, rushing"), under 25-second pressure, returning JSON `{id, ability, style, attempts, final}`. Every final answer goes through the real validator; an invalid one counts as a time-out, and anyone missing from the reply is replaced by a rule-based ghost with the same ability and style. If the call fails, that prompt gets 1,100 rule-based ghosts.

**Mixing with real players.** Each ghost weighs `(100 ÷ ghostCount) × max(0, 1 − realPlayers ÷ 500)`, so all the ghosts together count as about 100 players at the start of the day and nothing by 500 real players. Lone Wolf needs no other real player and fewer than 0.5 weighted ghosts on the same answer. The UI always says "Based on N players + simulated answers".

**Calibration.** When a day is locked, its real and ghost answer counts per prompt are saved to `calibration_snapshots`. `/admin` (password `ADMIN_SECRET`) overlays real against ghost answers for each prompt, with the Jensen–Shannon divergence for all ghosts, rule-based only and AI only, and time-out rates. To get suggested percentages from the last 14 days:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> npm run ghosts:suggest
```

The script treats real answers as a mixture of the 20 (ability, style) distributions, fits the mixture by expectation–maximisation, and prints the suggested ability and style shares, the before and after divergence, and the time-out rate each mix predicts. It changes nothing; you edit `ghostConfig.ts`, run `npm run sync:shared` and redeploy `prepare-day`.

### Where did you land?

The game's signature view. After each answer, the whole crowd falls onto a number line as pencil dots, one dot per 1% of answers, piling up where people agree. Your answer drops in last in red ink: on a tall pile you were Obvious, alone in the empty paper you were an outlier. Very tall piles are cut off with a break mark and labelled with their share. The same plot appears as a thin strip on every question in the results, and the start screen shows a clipping of yesterday's crowd with a right answer nobody gave. Crowd data comes from `get_distribution`, which refuses until you have finished that prompt.

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
scripts/suggest-ghost-mix.ts  suggests ghost ability/style shares from real data
tests/unit/               validators, selection, scoring, ghost model, calibration, SQL (PGlite)
tests/e2e/                Playwright: full game, resume, practice, number pad
```

## Changing things

- **Add a prompt:** add it to `src/prompts.ts` and add known valid and invalid cases to `tests/unit/validators.test.ts` (the suite fails if a prompt has no cases, fewer than 8 valid answers, or `^`/`*` in its text). Then `npm run sync:shared` and redeploy `prepare-day`.
- **Tune the ghosts:** edit `src/lib/ghostConfig.ts` (use `/admin` and `npm run ghosts:suggest`), sync, redeploy.
- **Change the Claude model or prompt:** `MODEL` in `supabase/functions/prepare-day/index.ts`; the instructions and personas are in `src/lib/ghostAi.ts`.
