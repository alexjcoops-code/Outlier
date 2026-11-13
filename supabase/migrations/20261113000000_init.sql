-- Outlier: schema, row level security and the RPCs the game talks to.
--
-- Clients never touch a table directly (the one exception: reading which prompts
-- make up a day). Everything else goes through SECURITY DEFINER functions that
-- validate, time and score on the server.

-- ───────────────────────────── Tables ─────────────────────────────

create table public.daily_prompts (
  date date not null,
  position smallint not null check (position between 1 and 7),
  prompt_id text not null,
  primary key (date, position)
);

-- The answer key for each day's prompts. Written by the prepare-day Edge
-- Function from the TypeScript validators, so those stay the single source of truth.
create table public.prompt_keys (
  date date not null,
  position smallint not null,
  valid_values integer[] not null,
  clever_values integer[] not null default '{}',
  primary key (date, position),
  foreign key (date, position) references public.daily_prompts (date, position) on update cascade on delete cascade
);

-- When each player was shown each prompt: the server-side timer.
create table public.prompt_starts (
  date date not null,
  player_id uuid not null,
  position smallint not null check (position between 1 and 7),
  started_at timestamptz not null default now(),
  primary key (date, player_id, position)
);

create table public.answers (
  id bigint generated always as identity primary key,
  date date not null,
  player_id uuid not null,
  position smallint not null check (position between 1 and 7),
  value integer not null,
  created_at timestamptz not null default now(),
  unique (date, player_id, position)
);
create index answers_by_value on public.answers (date, position, value);

-- Simulated players. value is null when the ghost ran out of time.
create table public.ghost_answers (
  id bigint generated always as identity primary key,
  date date not null,
  position smallint not null check (position between 1 and 7),
  value integer,
  ability text not null check (ability in ('ultra', 'pretty', 'average', 'weak', 'panicker')),
  style text not null check (style in ('safe', 'mid', 'risk', 'showoff')),
  source text not null check (source in ('rules', 'ai'))
);
create index ghost_answers_by_value on public.ghost_answers (date, position, value);

create table public.final_scores (
  date date not null,
  player_id uuid not null,
  total integer not null,
  tiers text[] not null,
  primary key (date, player_id)
);

-- Real against ghost answers per prompt, saved when a day is locked, for tuning
-- the ghosts (npm run ghosts:suggest reads the last 14 days).
create table public.calibration_snapshots (
  date date not null,
  position smallint not null,
  prompt_id text not null,
  -- {"683": 3, "2": 41, ...}: real answers per value
  real_counts jsonb not null,
  real_timeouts integer not null,
  -- {"683": {"rules": 1, "ai": 0}, ...}: ghost answers per value and source
  ghost_counts jsonb not null,
  ghost_count integer not null,
  ghost_timeouts integer not null,
  created_at timestamptz not null default now(),
  primary key (date, position)
);

-- Days whose scores have been locked.
create table public.finalised_days (
  date date primary key,
  finalised_at timestamptz not null default now()
);

-- A short-lived cache of the day's average and top-10% score.
create table public.day_stats (
  date date primary key,
  players integer not null,
  average integer,
  top10 integer,
  computed_at timestamptz not null default now()
);

-- For rate limiting submissions.
create table public.submit_log (
  player_id uuid not null,
  at timestamptz not null default now()
);
create index submit_log_recent on public.submit_log (player_id, at);

-- ───────────────────────────── Row level security ─────────────────────────────

alter table public.daily_prompts enable row level security;
alter table public.prompt_keys enable row level security;
alter table public.prompt_starts enable row level security;
alter table public.answers enable row level security;
alter table public.ghost_answers enable row level security;
alter table public.final_scores enable row level security;
alter table public.finalised_days enable row level security;
alter table public.day_stats enable row level security;
alter table public.calibration_snapshots enable row level security;
alter table public.submit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ───────────────────────────── Helpers ─────────────────────────────

-- The game day runs midnight to midnight in London; Postgres handles GMT/BST.
create function public.uk_today() returns date
language sql stable
as $$ select (now() at time zone 'Europe/London')::date $$;

grant select on public.daily_prompts to anon, authenticated;
create policy "prompts are public once their day has started"
  on public.daily_prompts for select
  to anon, authenticated
  using (date <= public.uk_today());

create function public.ghost_weight(players integer, ghost_count integer) returns double precision
language sql immutable
as $$
  select case when ghost_count > 0
    then (100.0 / ghost_count) * greatest(0, 1 - players / 500.0)
    else 0 end
$$;

create function public.tier_points(tier text) returns integer
language sql immutable
as $$
  select case tier
    when 'obvious' then 10
    when 'clever' then 15
    when 'fair' then 30
    when 'rare' then 60
    when 'outlier' then 85
    when 'lone' then 100
    else 0
  end
$$;

-- The scoring rule. Mirrors scoreAnswer() in src/lib/scoring.ts; a test checks they agree.
--   same_real / total_real: real answers equal to this one / all real answers (both include it)
--   same_ghost / total_ghost: ghost answers equal to this one / all ghost answers
--   ghost_count: every ghost for the prompt, including those who ran out of time
--   players: distinct real players today
-- Each ghost weighs (100 ÷ ghost_count) × max(0, 1 − players ÷ 500): together
-- the ghosts count as about 100 players, fading to nothing by 500 real players.
create function public.score_tier(
  same_real integer,
  total_real integer,
  same_ghost integer,
  total_ghost integer,
  ghost_count integer,
  players integer,
  clever boolean,
  out tier text,
  out share double precision
)
language plpgsql immutable
as $$
declare
  w double precision := public.ghost_weight(players, ghost_count);
  total double precision := total_real + w * total_ghost;
begin
  share := case when total > 0 then (same_real + w * same_ghost) / total else 1 end;
  if same_real <= 1 and w * same_ghost < 0.5 then tier := 'lone';
  elsif share >= 0.2 then tier := 'obvious';
  elsif share < 0.03 then tier := 'outlier';
  elsif clever then tier := 'clever';
  elsif share >= 0.08 then tier := 'fair';
  else tier := 'rare';
  end if;
end;
$$;

create function public.day_players(p_date date) returns integer
language sql stable
as $$ select count(distinct player_id)::integer from public.answers where date = p_date $$;

-- Live score for one value on one prompt, assuming it is among the real answers.
create function public.score_value(
  p_date date,
  p_position integer,
  p_value integer,
  out tier text,
  out points integer,
  out share double precision,
  out players integer,
  out simulated boolean
)
language plpgsql stable
as $$
declare
  s record;
begin
  players := public.day_players(p_date);
  select t.tier, t.share into s
  from public.score_tier(
    (select count(*)::integer from public.answers a where a.date = p_date and a.position = p_position and a.value = p_value),
    (select count(*)::integer from public.answers a where a.date = p_date and a.position = p_position),
    (select count(*)::integer from public.ghost_answers g where g.date = p_date and g.position = p_position and g.value = p_value),
    (select count(g.value)::integer from public.ghost_answers g where g.date = p_date and g.position = p_position),
    (select count(*)::integer from public.ghost_answers g where g.date = p_date and g.position = p_position),
    players,
    coalesce((select p_value = any (k.clever_values) from public.prompt_keys k where k.date = p_date and k.position = p_position), false)
  ) t;
  tier := s.tier;
  share := s.share;
  points := public.tier_points(s.tier);
  simulated := players < 500
    and exists (select 1 from public.ghost_answers g where g.date = p_date and g.position = p_position);
end;
$$;

-- Everybody's score for a day, in one pass. Used to lock scores and for the day's stats.
create function public.day_scores(p_date date)
returns table (player_id uuid, total integer, tiers text[])
language sql stable
as $$
  with n as (select public.day_players(p_date) as players),
  real_counts as (
    select position, value, count(*)::integer as c from public.answers where date = p_date group by position, value
  ),
  real_totals as (
    select position, count(*)::integer as c from public.answers where date = p_date group by position
  ),
  ghost_counts as (
    select position, value, count(*)::integer as c from public.ghost_answers
    where date = p_date and value is not null group by position, value
  ),
  ghost_totals as (
    select position, count(value)::integer as answered, count(*)::integer as everyone
    from public.ghost_answers where date = p_date group by position
  ),
  scored as (
    select a.player_id, a.position,
      (public.score_tier(
        rc.c, rt.c, coalesce(gc.c, 0), coalesce(gt.answered, 0), coalesce(gt.everyone, 0), n.players,
        coalesce(a.value = any (k.clever_values), false)
      )).tier as tier
    from public.answers a
    cross join n
    join real_counts rc on rc.position = a.position and rc.value = a.value
    join real_totals rt on rt.position = a.position
    left join ghost_counts gc on gc.position = a.position and gc.value = a.value
    left join ghost_totals gt on gt.position = a.position
    left join public.prompt_keys k on k.date = a.date and k.position = a.position
    where a.date = p_date
  ),
  everyone as (
    -- Anyone who started the worksheet gets a score, even if every answer timed out.
    select distinct s.player_id from public.prompt_starts s where s.date = p_date
    union
    select distinct a.player_id from public.answers a where a.date = p_date
  )
  select e.player_id,
    coalesce(sum(public.tier_points(s.tier)), 0)::integer as total,
    array_agg(coalesce(s.tier, 'none') order by pos.position) as tiers
  from everyone e
  cross join generate_series(1, 7) as pos (position)
  left join scored s on s.player_id = e.player_id and s.position = pos.position
  group by e.player_id
$$;

-- ───────────────────────────── RPC: start_prompt ─────────────────────────────

-- Starts the 25-second clock for a prompt, or re-joins it. Prompts go in order.
create function public.start_prompt(p_date date, p_position integer, p_player_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_started timestamptz;
begin
  if p_position not between 1 and 7 then
    raise exception 'no_such_question';
  end if;

  select started_at into v_started from prompt_starts
  where date = p_date and player_id = p_player_id and position = p_position;

  if v_started is null then
    if p_date <> uk_today() then
      raise exception 'not_today';
    end if;
    if not exists (select 1 from daily_prompts where date = p_date and position = p_position) then
      raise exception 'no_worksheet';
    end if;
    if p_position > 1 and not exists (
      select 1 from prompt_starts
      where date = p_date and player_id = p_player_id and position = p_position - 1
    ) then
      raise exception 'out_of_order';
    end if;
    insert into prompt_starts (date, player_id, position) values (p_date, p_player_id, p_position)
    on conflict do nothing;
    select started_at into v_started from prompt_starts
    where date = p_date and player_id = p_player_id and position = p_position;
  end if;

  return jsonb_build_object(
    'remaining_ms',
    greatest(0, 25000 - floor(extract(epoch from (clock_timestamp() - v_started)) * 1000))::integer
  );
end;
$$;

-- ───────────────────────────── RPC: submit_answer ─────────────────────────────

-- Validates server-side and saves. Never trusts the client: the value must be in
-- the day's answer key, the clock must still be running (25s + 3s for the network),
-- and each prompt takes one answer. Returns the live tier and share.
create function public.submit_answer(p_date date, p_position integer, p_value integer, p_player_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_started timestamptz;
  v_valid boolean;
  s record;
begin
  -- Rate limit: 20 submissions per player per 30 seconds. Honest play needs about one per prompt.
  if (select count(*) from submit_log where player_id = p_player_id and at > now() - interval '30 seconds') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into submit_log (player_id) values (p_player_id);

  select started_at into v_started from prompt_starts
  where date = p_date and player_id = p_player_id and position = p_position;
  if v_started is null then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;

  if exists (select 1 from answers where date = p_date and player_id = p_player_id and position = p_position) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;

  if clock_timestamp() > v_started + interval '28 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select p_value = any (valid_values) into v_valid from prompt_keys
  where date = p_date and position = p_position;
  if v_valid is not true then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  begin
    insert into answers (date, player_id, position, value) values (p_date, p_player_id, p_position, p_value);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;

  select * into s from score_value(p_date, p_position, p_value);
  return jsonb_build_object(
    'ok', true, 'tier', s.tier, 'points', s.points, 'share', s.share,
    'players', s.players, 'simulated', s.simulated
  );
end;
$$;

-- ───────────────────────────── RPC: get_results ─────────────────────────────

-- The player's own day: prompts, progress, live (or locked) scores, and the day's
-- average and top-10% mark. Reveals nothing about anyone else's answers.
create function public.get_results(p_date date, p_player_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_final boolean;
  v_final_tiers text[];
  v_rows jsonb;
  v_total integer;
  v_players integer;
  v_stats day_stats;
begin
  if p_date > uk_today() then
    raise exception 'not_yet';
  end if;

  v_final := exists (select 1 from finalised_days where date = p_date);
  select tiers into v_final_tiers from final_scores where date = p_date and player_id = p_player_id;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'position', d.position,
      'prompt_id', d.prompt_id,
      'started', s.started_at is not null,
      'value', a.value,
      'tier', r.tier,
      'points', tier_points(r.tier),
      'share', r.share
    ) order by d.position), '[]'::jsonb),
    coalesce(sum(tier_points(r.tier)), 0)::integer
  into v_rows, v_total
  from daily_prompts d
  left join prompt_starts s on s.date = d.date and s.position = d.position and s.player_id = p_player_id
  left join answers a on a.date = d.date and a.position = d.position and a.player_id = p_player_id
  left join lateral (
    select
      case
        when a.value is null then 'none'
        -- Once the day is locked, the tier is whatever it was at midnight.
        when v_final_tiers is not null then v_final_tiers[d.position]
        else live.tier
      end as tier,
      case when a.value is null then null else live.share end as share
    from (select 1) one
    left join lateral score_value(d.date, d.position, a.value) live on a.value is not null
  ) r on true
  where d.date = p_date;

  v_players := day_players(p_date);

  -- Day statistics are cached for a minute while the day is live. With only a
  -- few players they are cheap, so they are worked out fresh every time.
  select * into v_stats from day_stats where date = p_date;
  if v_stats.date is null
     or (not v_final and (v_stats.players < 50 or v_stats.computed_at < now() - interval '60 seconds'))
     or (v_final and v_stats.computed_at < (select finalised_at from finalised_days where date = p_date)) then
    insert into day_stats (date, players, average, top10, computed_at)
    select p_date, count(*)::integer, round(avg(sc.total))::integer,
      (percentile_cont(0.9) within group (order by sc.total))::integer, now()
    from (
      select fs.total from final_scores fs where v_final and fs.date = p_date
      union all
      select ds.total from day_scores(p_date) ds where not v_final
    ) sc
    on conflict (date) do update
      set players = excluded.players, average = excluded.average, top10 = excluded.top10,
          computed_at = excluded.computed_at
    returning * into v_stats;
  end if;

  return jsonb_build_object(
    'date', p_date,
    'final', v_final,
    'total', v_total,
    'players', v_players,
    'simulated', v_players < 500 and exists (select 1 from ghost_answers where date = p_date),
    'average', case when v_stats.players > 0 then v_stats.average end,
    'top10', case when v_stats.players > 0 then v_stats.top10 end,
    'rows', v_rows
  );
end;
$$;

-- ───────────────────────────── RPC: get_distribution ─────────────────────────────

-- The whole crowd for a prompt: every answer given, most common first, with
-- shares weighted exactly as in the scoring. No peeking: only once the player
-- has answered it, run out of time on it, or the day is over.
create function public.get_distribution(p_date date, p_position integer, p_player_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_players integer;
  v_w double precision;
  v_values jsonb;
begin
  if not (
    p_date < uk_today()
    or exists (select 1 from answers where date = p_date and player_id = p_player_id and position = p_position)
    or exists (
      select 1 from prompt_starts
      where date = p_date and player_id = p_player_id and position = p_position
        and started_at + interval '25 seconds' < clock_timestamp()
    )
  ) then
    raise exception 'no_peeking';
  end if;

  v_players := day_players(p_date);
  v_w := ghost_weight(
    v_players,
    (select count(*)::integer from ghost_answers where date = p_date and position = p_position)
  );

  with every_answer as (
    select value, 1::double precision as weight from answers where date = p_date and position = p_position
    union all
    select value, v_w from ghost_answers
    where date = p_date and position = p_position and value is not null and v_w > 0
  ),
  counts as (
    select value, sum(weight) as weight from every_answer group by value
  ),
  total as (select sum(weight) as t from counts)
  select coalesce(
    jsonb_agg(jsonb_build_object('value', c.value, 'share', c.weight / total.t) order by c.weight desc, c.value asc),
    '[]'::jsonb
  )
  into v_values
  from counts c, total;

  return jsonb_build_object(
    'players', v_players,
    'simulated', v_players < 500 and exists (select 1 from ghost_answers where date = p_date and position = p_position),
    'values', v_values
  );
end;
$$;

-- ───────────────────────────── Server-side jobs ─────────────────────────────

-- Lock a finished day's scores. Idempotent.
create function public.finalise_day(p_date date) returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_date >= uk_today() then
    raise exception 'day_not_over';
  end if;
  if exists (select 1 from finalised_days where date = p_date) then
    return 0;
  end if;
  insert into final_scores (date, player_id, total, tiers)
  select p_date, ds.player_id, ds.total, ds.tiers from day_scores(p_date) ds
  on conflict do nothing;
  get diagnostics v_count = row_count;

  -- Save real against ghost answers for calibration.
  insert into calibration_snapshots
    (date, position, prompt_id, real_counts, real_timeouts, ghost_counts, ghost_count, ghost_timeouts)
  select d.date, d.position, d.prompt_id,
    coalesce((
      select jsonb_object_agg(value::text, n)
      from (select value, count(*) as n from answers a where a.date = d.date and a.position = d.position group by value) r
    ), '{}'::jsonb),
    (select count(*)::integer from prompt_starts s
      where s.date = d.date and s.position = d.position
        and not exists (select 1 from answers a where a.date = s.date and a.position = s.position and a.player_id = s.player_id)),
    coalesce((
      select jsonb_object_agg(value::text, jsonb_build_object('rules', rules, 'ai', ai))
      from (
        select value, count(*) filter (where source = 'rules') as rules, count(*) filter (where source = 'ai') as ai
        from ghost_answers g where g.date = d.date and g.position = d.position and g.value is not null
        group by value
      ) gh
    ), '{}'::jsonb),
    (select count(*)::integer from ghost_answers g where g.date = d.date and g.position = d.position),
    (select count(*)::integer from ghost_answers g where g.date = d.date and g.position = d.position and g.value is null)
  from daily_prompts d
  where d.date = p_date
  on conflict do nothing;
  insert into finalised_days (date) values (p_date) on conflict do nothing;
  return v_count;
end;
$$;

-- Called by pg_cron around midnight UK time: locks every finished day not yet locked.
create function public.finalise_due_days() returns integer
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_date date;
  v_days integer := 0;
begin
  for v_date in
    select distinct d.date from daily_prompts d
    where d.date < uk_today() and not exists (select 1 from finalised_days f where f.date = d.date)
    order by d.date
  loop
    perform finalise_day(v_date);
    v_days := v_days + 1;
  end loop;
  delete from submit_log where at < now() - interval '1 day';
  return v_days;
end;
$$;

-- Used by the prepare-day Edge Function: writes a day's prompts, answer key and
-- ghosts in one transaction. Returns false (and changes nothing) if the day exists.
--   p_prompts: [{ "position": 1, "prompt_id": "...", "valid": [..], "clever": [..] }, ...]
--   p_ghosts:  [{ "position": 1, "value": 7 or null, "ability": "average", "style": "safe", "source": "rules" }, ...]
create function public.install_day(p_date date, p_prompts jsonb, p_ghosts jsonb) returns boolean
language plpgsql volatile security definer
set search_path = public
as $$
begin
  -- One writer at a time per day.
  perform pg_advisory_xact_lock(hashtext('outlier-day:' || p_date::text));
  if exists (select 1 from daily_prompts where date = p_date) then
    return false;
  end if;
  if jsonb_array_length(p_prompts) <> 7 then
    raise exception 'a day needs exactly 7 prompts';
  end if;

  insert into daily_prompts (date, position, prompt_id)
  select p_date, (x ->> 'position')::smallint, x ->> 'prompt_id'
  from jsonb_array_elements(p_prompts) x;

  insert into prompt_keys (date, position, valid_values, clever_values)
  select p_date, (x ->> 'position')::smallint,
    array(select jsonb_array_elements_text(x -> 'valid')::integer),
    array(select jsonb_array_elements_text(x -> 'clever')::integer)
  from jsonb_array_elements(p_prompts) x;

  -- A ghost's answer must be valid (or null: out of time). Anything else is
  -- stored as a time-out here, as a last line of defence.
  insert into ghost_answers (date, position, value, ability, style, source)
  select p_date, (g ->> 'position')::smallint,
    case when (g ->> 'value')::integer = any (k.valid_values) then (g ->> 'value')::integer end,
    g ->> 'ability', g ->> 'style', g ->> 'source'
  from jsonb_array_elements(p_ghosts) g
  join prompt_keys k on k.date = p_date and k.position = (g ->> 'position')::smallint;

  return true;
end;
$$;

-- Used by the admin-stats Edge Function: ghost against real answers, per prompt.
create function public.admin_distribution(p_date date) returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'date', p_date,
    'players', day_players(p_date),
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', d.position,
        'prompt_id', d.prompt_id,
        'real_total', (select count(*) from answers a where a.date = d.date and a.position = d.position),
        'real_timeouts', (
          select count(*) from prompt_starts s
          where s.date = d.date and s.position = d.position
            and s.started_at + interval '28 seconds' < clock_timestamp()
            and not exists (select 1 from answers a where a.date = s.date and a.position = s.position and a.player_id = s.player_id)
        ),
        'ghost_count', (select count(*) from ghost_answers g where g.date = d.date and g.position = d.position),
        'ghost_timeouts', (select count(*) from ghost_answers g where g.date = d.date and g.position = d.position and g.value is null),
        'values', coalesce((
          select jsonb_agg(jsonb_build_object('value', v.value, 'real', v.real, 'rules', v.rules, 'ai', v.ai) order by v.value)
          from (
            select value,
              count(*) filter (where source = 'real') as real,
              count(*) filter (where source = 'rules') as rules,
              count(*) filter (where source = 'ai') as ai
            from (
              select value, 'real' as source from answers a where a.date = d.date and a.position = d.position
              union all
              select value, source from ghost_answers g where g.date = d.date and g.position = d.position and g.value is not null
            ) every_answer
            group by value
          ) v
        ), '[]'::jsonb)
      ) order by d.position)
      from daily_prompts d where d.date = p_date
    ), '[]'::jsonb)
  )
$$;

-- ───────────────────────────── Who may call what ─────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.uk_today() to anon, authenticated;
grant execute on function public.start_prompt(date, integer, uuid) to anon, authenticated;
grant execute on function public.submit_answer(date, integer, integer, uuid) to anon, authenticated;
grant execute on function public.get_results(date, uuid) to anon, authenticated;
grant execute on function public.get_distribution(date, integer, uuid) to anon, authenticated;

grant execute on all functions in schema public to service_role;
