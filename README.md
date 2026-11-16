# Oddle

A daily maths game where rare answers win: find the right answer nobody else said.

Every day at midnight UK time everyone gets the same seven prompts, such as "Name a prime under 1,000". Each has many right answers. You have 25 seconds to type a whole number. Any right answer scores, but the fewer people who gave the same answer, the more it scores. Up to 100 a question, 700 a day.

| Tier | Points | Rule |
|---|---|---|
| Obvious | 10 | 20% or more of answers |
| Predictably Clever | 15 | on the prompt's "famous numbers" list (unless it's Obvious, an Outlier or a Lone Wolf) |
| Fair | 30 | 4% to under 20% of everyone else |
| Rare | 60 | 1 in 200 to under 4% of everyone else |
| Outlier | 85 | fewer than 1 in 200 of everyone else |
| Lone Wolf | 100 | nobody else at all, real or simulated, gave it |

"Everyone else" leaves your own answer out. That matters early in a day, when the crowd is mostly ghosts counting as about 100 players: one other person is already 1% of them.

## Quick start (no accounts needed)

```bash
npm install
npm run dev
```

With no Supabase settings the app runs against a built-in offline backend: the same prompts and scoring rules, with 1,100 rule-based "ghost" players per prompt (what the live game uses when the Claude API is down) standing in for the crowd, and progress kept in `localStorage`. This is also what the end-to-end test uses.

```bash
npm test          # unit tests (Vitest), including the SQL run in an in-process Postgres
npm run e2e       # end-to-end tests (Playwright; needs `npx playwright install chromium` once)
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
supabase functions deploy versus
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
- `src/lib/daily.ts` picks seven prompts with a shuffle seeded by the date, ordered easy to hard (three easy, three medium, one hard), under two rules:
  - a question never comes back within 60 days;
  - a question type never comes back within 3 days, and the seven questions on a day are always seven different types. If you play every day you can't lean on a recent answer. You have to do the maths again.
- The bank in `src/prompts.ts` has 1,000 questions in 100 types, ten per type. The ten in a type share an idea (a prime with a twist, a time on a 24-hour clock, a Roman numeral of a given length) but have different answers. No two share more than half their valid answers, so last week's rare answer is usually wrong today.
- Each type is tagged easy, medium or hard, which spreads its ten questions across the three daily slots (easy types: seven easy, two medium, one hard; medium: two, six, two; hard: four medium, six hard). The bank has about 400 easy, 380 medium and 220 hard questions.
- Ids look like `clock-04` (type, then number). A question id that's no longer in the bank (from an older version, still in a database's history) shows as a retired stand-in instead of breaking the page.

### Scoring

For your answer to a prompt:

```
w      = (100 ÷ ghostCount) × max(0, 1 − realPlayersToday ÷ 500)   weight of one ghost
share  = (real answers equal to yours + w × ghost answers equal to yours)
       ÷ (all real answers + w × all ghost answers)                 your own answer included
```

`others` is the same share with your own answer taken out. Then, in order: Lone Wolf if no other real player and no ghost gave it; Obvious if share ≥ 20%; Outlier if others < 0.5%; Predictably Clever if it's on the prompt's clever list; Fair if others ≥ 4%; otherwise Rare.

The thresholds come from `npm run sim:tiers`, which plays all 1,000 questions against a simulated crowd with four kinds of player and compares rule sets. With the current rules, at the start of a day:

| Player | Lone Wolf | Outlier | Typical day |
|---|---|---|---|
| Typical (answers like the crowd) | 0.6% | 2.4% | 181 |
| Bold (a strong player going for something unusual) | 4.4% | 20.9% | 409 |
| Rare-hunter (knows every answer, avoids the obvious half) | 11.5% | 49.0% | 521 |

Before 16 November 2026 Lone Wolf allowed up to five matching ghosts and Outlier was "under 3%, counting yourself": a bold player got Lone Wolf 28.5% of the time and averaged 513 a day. `supabase/migrations/20261116000000_harder_tiers.sql` replaces `score_tier` with the new rules.

Scores are live and labelled "provisional" until the day ends. `finalise_due_days()` runs just after midnight UK time and copies each player's total and tiers into `final_scores`.

The rule exists twice, in `src/lib/scoring.ts` and as `score_tier` in SQL. `tests/unit/sql.test.ts` checks the two agree on 3,000 random cases.

### Ghost players

At 23:30 UK time `prepare-day` makes the next day's simulated players. Each prompt gets 1,000 rule-based ghosts and 100 played by Claude, stored in `ghost_answers(date, position, value, ability, style, source)`. A ghost who runs out of time has a null value.

Every ghost has an ability and, separately, a playing style. The proportions and behaviour of each are in `src/lib/ghostConfig.ts`:

| Ability | Share | Knows | Time-outs |
|---|---|---|---|
| Ultra smart | 10% | almost every valid answer | ~1% |
| Pretty smart | 20% | the most salient 60% | ~3% |
| Average | 40% | the most salient 35% | ~8% |
| Weak | 20% | the most salient 15% | ~20% |
| Panicker | 10% | the first thing that comes to mind | ~30% |

| Style | Share | Picks |
|---|---|---|
| Safe | 40% | the top of what they know |
| Mid | 35% | skips the first idea, a bit further down |
| Risk-taker | 15% | the least obvious answer they know |
| Show-off | 10% | the prompt's "Predictably Clever" list, else acts like a risk-taker |

"Salience" is how readily a person thinks of a number: small numbers, the first few valid answers, numbers ending in 0 or 5, times tables, repeated digits, famous numbers, ages, birth years and the current year are boosted; big patternless numbers and the top of the range are penalised. Salience ranks the valid answers (which sets each ability's reach) and weights the choice within reach, raised to a per-ability power: Ultra smart ghosts barely care, Panickers are driven by it. So every (ability, style) pair has an exact answer distribution (`src/lib/ghostModel.ts`), and ghosts sample from it.

#### AI ghosts

One Claude call per prompt (all seven run at once) asks the model to play the day's 100-person cast, each with an ability, a style and a short persona ("Year 9 student, average at maths, rushing"), under 25-second pressure, returning JSON `{id, ability, style, attempts, final}`. Every final answer goes through the real validator; an invalid one counts as a time-out, and anyone missing from the reply is replaced by a rule-based ghost with the same ability and style. If the call fails, that prompt gets 1,100 rule-based ghosts.

#### Mixing ghosts with real players

Each ghost weighs `(100 ÷ ghostCount) × max(0, 1 − realPlayers ÷ 500)`, so all the ghosts together count as about 100 players at the start of the day and nothing by 500 real players. Lone Wolf needs nobody else at all on the same answer: no other real player and, while ghosts still count, no ghost. The UI always says "Based on N players + simulated answers".

#### Calibration

When a day is locked, its real and ghost answer counts per prompt are saved to `calibration_snapshots`. `/admin` (password `ADMIN_SECRET`) overlays real against ghost answers for each prompt. It shows the Jensen-Shannon divergence (for all ghosts, rule-based only and AI only) and time-out rates. To get suggested percentages from the last 14 days:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> npm run ghosts:suggest
```

The script treats real answers as a mixture of the 20 (ability, style) distributions, fits the mixture by expectation-maximisation, and prints the suggested ability and style shares, the before and after divergence, and the time-out rate each mix predicts. It changes nothing; you edit `ghostConfig.ts`, run `npm run sync:shared` and redeploy `prepare-day`.

### Where did you land?

After each answer the whole crowd pours into a rack of tubes standing on the number line, using a real physics engine (matter-js on a canvas). Each ball is 1% of answers, or 2 to 5% when one answer is so popular its pile would overflow. The balls bounce and settle into piles where people agreed. Your red ball drops in last and lands with a squash: on a tall pile you were Obvious, alone in an empty tube you were an outlier. Tap the rack or "Shake it" to throw the balls up and watch them resettle. With reduced motion the balls are drawn at rest. The same plot appears as a thin strip on every question in the results, and the start screen shows a clipping of yesterday's crowd with a right answer nobody gave. Crowd data comes from `get_distribution`, which refuses until you have finished that prompt.

### Celebrations

The rarer the answer, the bigger the fuss, but each tier has one signature move rather than everything at once (`src/lib/celebrate.ts`). Confetti is only for a Lone Wolf.

| Tier | What happens |
|---|---|
| Obvious, Predictably Clever | A plain mark. |
| Fair | The points count up into the red circle; one tick. |
| Rare | Two ticks (a teacher's "very good"), a light buzz. |
| Outlier | The red ball knocks the crowd into the air, and the teacher dashes red-pen emphasis lines and two little stars round your score. |
| Lone Wolf | The crowd scatters off the red ball, a NOBODY ELSE stamp in green pen, the page shakes, confetti cut from coloured paper (the highlighter colours) thrown out to the sides, then a shower of it fluttering down the page, a longer buzz. |

A good day earns an award stamp on the results page, with confetti when the paper has just been finished: Merit (300+), Distinction (450+), Headteacher's award (600+). Vibration only happens on phones that support it. With reduced motion there is no confetti, shaking, buzzing or flying balls; the stamps and marks simply appear.

### Versus

`/versus` is the live mode. You play against 1 to 7 other people (1 v 1, 1 v 2, 1 v 3, 1 v 5 or 1 v 7): five questions, 25 seconds each, and everyone sees each question at the same moment. There are three ways in:

- "Find players" puts you in a quick match with strangers who picked the same size. It starts when the table is full, or after 45 seconds with whoever turned up, as long as that's two or more. If nobody comes, you're offered ghosts instead.
- "Make a room for friends" gives you a five-character code and a link to send (`/versus?code=K7MPQ`). The room starts when it's full, or when the host presses "Start now".
- "Play ghosts" is always available. The opponents are simulated in the browser, labelled as ghosts, and use the same abilities and styles as the daily crowd. Without a Supabase project (offline mode) it's the only option.

Each answer first gets the tier it would get in the daily game, judged against the ghost crowd for that question: 10 for an obvious answer, 85 for an outlier, 100 for a lone wolf. If anyone else in the match said the same number, those points are split between you (`60 ÷ 2 = 30`). Everyone's answers are shown after each question, and at the end a register ranks the room.

The five questions are five different types, easy to hard, picked fresh for each match. The `versus` Edge Function makes matches, because it has the question bank, and stores each question's answer key. Everything else is RPCs (`versus_join`, `versus_state`, `versus_answer`, `versus_start`, `versus_leave`) that check each answer against the key and the server clock. Players only ever see each other's seat numbers and names, never their ids. A match moves along whenever anyone asks for its state, so it needs no timer running on the server. Matches over a day old are deleted nightly.

Scores aren't stored. Every browser works them out from the answers with the same code (`src/lib/versus.ts`), so everyone sees the same register.

### Not cheatable from the client

- Tables have row level security with no client policies, apart from reading which prompts make up today and past days. Everything else goes through `SECURITY DEFINER` RPCs.
- `submit_answer` checks the value against that day's answer key (generated from the TypeScript validators when the day is prepared), checks the server-side clock started by `start_prompt` (25 seconds plus 3 for the network), allows one answer per prompt, and rate-limits each player id to 20 submissions per 30 seconds.
- `get_distribution` refuses until you have answered that prompt or run out of time on it.
- Tomorrow's prompts exist in the database from 23:30 but are hidden by policy until midnight.
- Versus: other players' answers to the current question stay hidden until the round closes; answers are checked against the stored key and accepted only between the question's start and 28 seconds after it.

There is no login, so a player is an anonymous UUID in `localStorage`. Clearing storage gives a new identity and another go; that is the accepted cost of having no accounts.

## Project layout

```
src/
  prompts.ts              the prompt bank: 100 types × 10 questions (text, difficulty, range, validator, clever list)
  lib/                    pure game logic (dates, daily selection, scoring, ghosts, parsing)
  lib/backend/            Backend interface; Supabase and offline implementations
  components/, pages/     React UI
  styles/                 plain CSS with variables (tokens.css)
supabase/
  migrations/             schema, RLS, RPCs; pg_cron schedules
  functions/prepare-day   nightly: prompts, answer key, ghosts
  functions/admin-stats   data for /admin
  functions/versus        makes versus matches: questions and answer keys
  functions/_shared/core  generated copy of src/ logic (npm run sync:shared)
scripts/suggest-ghost-mix.ts  suggests ghost ability/style shares from real data
tests/unit/               validators, selection, scoring, ghost model, calibration, SQL (PGlite)
tests/e2e/                Playwright: full game, resume, number pad, versus against ghosts,
                          and an online versus match between two browsers (fakeSupabase.ts
                          runs the real migrations in an in-process Postgres)
```

## Changing things

- To change a question, edit its row in its `family(...)` in `src/prompts.ts`. Every type must keep exactly ten questions. The suite fails if a question has fewer than 8 valid answers, `^`/`*` in its text, more than 135 characters, or shares more than half its answers with another question of its type. The first question of each type also has hand-checked valid and invalid answers in `tests/unit/validators.test.ts`. Then `npm run sync:shared` and redeploy `prepare-day`.
- `docs/questions.md` lists all 1,000 questions by type, with how many right answers each has. Regenerate it with `npm run questions` after any change (a test checks it's current).
- To add a type, write a `family('id', 'Name', 'easy' | 'medium' | 'hard', rows, make)` with ten rows, and add hand-checked cases for its first question.
- The look and feel follow `docs/art-direction.md`: palette roles, shape and motion rules, and what's excluded. Colours and timings live in `src/styles/tokens.css` and `src/lib/motion.ts`.
- To change how hard the tiers are, edit the thresholds in `src/lib/scoring.ts` and the matching SQL in a new migration, then check the effect with `npm run sim:tiers` (it lists the old rules and some alternatives for comparison).
- To tune the ghosts, edit `src/lib/ghostConfig.ts` (`/admin` and `npm run ghosts:suggest` tell you what to change), then sync and redeploy.
- The Claude model is `MODEL` in `supabase/functions/prepare-day/index.ts`. The instructions and personas are in `src/lib/ghostAi.ts`.
