-- Players found 25 seconds too short. Every question now has 40 seconds,
-- plus the same 3 seconds' grace for the network (43 s), in the daily game
-- and in Versus. These are the earlier functions with only the times changed.

create or replace function public.start_prompt(p_date date, p_position integer, p_player_id uuid)
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
    greatest(0, 40000 - floor(extract(epoch from (clock_timestamp() - v_started)) * 1000))::integer
  );
end;
$$;

create or replace function public.submit_answer(p_date date, p_position integer, p_value integer, p_player_id uuid)
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

  if clock_timestamp() > v_started + interval '43 seconds' then
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

create or replace function public.get_distribution(p_date date, p_position integer, p_player_id uuid)
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
        and started_at + interval '40 seconds' < clock_timestamp()
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

create or replace function public.admin_distribution(p_date date) returns jsonb
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
            and s.started_at + interval '43 seconds' < clock_timestamp()
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

create or replace function public.versus_tick(p_match uuid) returns public.versus_matches
language plpgsql security definer set search_path = public as $$
declare
  m versus_matches;
  v_now timestamptz := now();
  v_players int;
  v_present int;
  v_answered int;
  v_last timestamptz;
begin
  select * into m from versus_matches where id = p_match for update;
  if not found then
    raise exception 'no_such_match' using errcode = 'P0001';
  end if;

  for i in 1..20 loop
    if m.status = 'waiting' then
      select count(*) into v_players from versus_players where match_id = m.id;
      if v_players = 0 or v_now > m.created_at + interval '30 minutes' then
        m.status := 'abandoned';
      elsif v_players >= m.size
         or (m.kind = 'quick' and v_players >= 2 and v_now >= m.created_at + interval '45 seconds') then
        m.status := 'playing';
        m.round := 1;
        m.round_starts_at := v_now + interval '4 seconds';
        m.closed_at := null;
      end if;
      exit;
    elsif m.status = 'playing' then
      select count(*) into v_present from versus_players where match_id = m.id and left_at is null;
      if v_present = 0 then
        m.status := 'abandoned';
        exit;
      end if;
      if m.closed_at is null then
        select count(*), max(a.answered_at) into v_answered, v_last
        from versus_answers a
        join versus_players p on p.match_id = a.match_id and p.player_id = a.player_id
        where a.match_id = m.id and a.round = m.round and p.left_at is null;
        if v_now >= m.round_starts_at + interval '43 seconds' then
          m.closed_at := m.round_starts_at + interval '43 seconds';
        elsif v_answered >= v_present and v_now >= m.round_starts_at then
          -- Everyone still here has answered: close when the last answer went in.
          m.closed_at := greatest(v_last, m.round_starts_at);
        else
          exit;
        end if;
      else
        if v_now < m.closed_at + interval '6 seconds' then
          exit;
        end if;
        if m.round >= 5 then
          if v_now >= m.closed_at + interval '9 seconds' then
            m.status := 'done';
          end if;
          exit;
        end if;
        m.round := m.round + 1;
        m.round_starts_at := m.closed_at + interval '9 seconds';
        m.closed_at := null;
      end if;
    else
      exit;
    end if;
  end loop;

  update versus_matches
  set status = m.status, round = m.round, round_starts_at = m.round_starts_at, closed_at = m.closed_at
  where id = m.id;
  return m;
end;
$$;

create or replace function public.versus_answer(p_player uuid, p_match uuid, p_round int, p_value bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  m versus_matches;
begin
  if not exists (select 1 from versus_players where match_id = p_match and player_id = p_player and left_at is null) then
    raise exception 'not_in_match' using errcode = 'P0001';
  end if;
  if (select count(*) from submit_log where player_id = p_player and at > now() - interval '30 seconds') >= 20 then
    return 'rate_limited';
  end if;
  insert into submit_log (player_id) values (p_player);

  m := versus_tick(p_match);
  if m.status <> 'playing' or m.round <> p_round then
    return 'late';
  end if;
  if now() < m.round_starts_at then
    return 'not_started';
  end if;
  if m.closed_at is not null or now() > m.round_starts_at + interval '43 seconds' then
    return 'late';
  end if;
  if exists (select 1 from versus_answers where match_id = p_match and round = p_round and player_id = p_player) then
    return 'already';
  end if;
  if not exists (select 1 from versus_keys where match_id = p_match and round = p_round and p_value = any (valid)) then
    return 'invalid';
  end if;
  insert into versus_answers (match_id, round, player_id, value) values (p_match, p_round, p_player, p_value);
  -- Last one in? Close the round now rather than at the next poll.
  perform versus_tick(p_match);
  return 'ok';
end;
$$;
