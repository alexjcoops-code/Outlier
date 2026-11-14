-- Versus: live matches between a handful of players.
--
-- The `versus` Edge Function makes a match (it has the question bank, so it
-- chooses the five questions and stores their answer keys). Everything after
-- that is here. Clients never touch the tables; they call the functions below
-- with their anonymous player id, which is never shown to anyone else: other
-- players only see seat numbers and display names.
--
-- Matches move along lazily. There is no timer on the server: every call to
-- versus_state or versus_answer first runs versus_tick, which brings the match
-- up to date with the clock. Times (keep in step with src/lib/versus.ts):
--   4 s countdown before question 1
--   25 s to answer, plus 3 s grace for the network (28 s)
--   9 s showing everyone's answers; the next question is handed out 3 s early
--   quick matches start after 45 s with two or more players, or when full

create table public.versus_matches (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code ~ '^[A-Z0-9]{5}$'),
  kind text not null check (kind in ('quick', 'private')),
  size smallint not null check (size in (2, 3, 4, 6, 8)),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'done', 'abandoned')),
  host uuid not null,
  prompt_ids text[] not null check (cardinality(prompt_ids) = 5),
  year smallint not null,
  round smallint not null default 0,
  round_starts_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index versus_matches_open on public.versus_matches (kind, size, created_at) where status = 'waiting';

create table public.versus_keys (
  match_id uuid not null references public.versus_matches (id) on delete cascade,
  round smallint not null check (round between 1 and 5),
  valid bigint[] not null,
  primary key (match_id, round)
);

create table public.versus_players (
  match_id uuid not null references public.versus_matches (id) on delete cascade,
  player_id uuid not null,
  seat smallint not null check (seat between 1 and 8),
  name text not null check (char_length(name) between 1 and 16),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (match_id, player_id),
  unique (match_id, seat)
);

create table public.versus_answers (
  match_id uuid not null,
  round smallint not null check (round between 1 and 5),
  player_id uuid not null,
  value bigint not null,
  answered_at timestamptz not null default now(),
  primary key (match_id, round, player_id),
  foreign key (match_id, player_id) references public.versus_players (match_id, player_id) on delete cascade
);

alter table public.versus_matches enable row level security;
alter table public.versus_keys enable row level security;
alter table public.versus_players enable row level security;
alter table public.versus_answers enable row level security;
revoke all on public.versus_matches, public.versus_keys, public.versus_players, public.versus_answers from anon, authenticated;

-- ───────────────────────────── Helpers ─────────────────────────────

create function public.versus_ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

/** Letters, digits, spaces and a little punctuation; 1–16 characters. */
create function public.versus_clean_name(p_name text) returns text
language sql immutable as $$
  select coalesce(
    nullif(trim(left(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^[:alnum:] ''’._-]', '', 'g'), '\s+', ' ', 'g'), 16)), ''),
    'Player'
  )
$$;

/** Bring a match up to date with the clock. Locks the match row. */
create function public.versus_tick(p_match uuid) returns public.versus_matches
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
        if v_now >= m.round_starts_at + interval '28 seconds' then
          m.closed_at := m.round_starts_at + interval '28 seconds';
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

/** Sit a player at the lowest free seat. False if the match is full. The caller holds the row lock. */
create function public.versus_take_seat(p_match uuid, p_player uuid, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_size int;
  v_seat int;
begin
  select size into v_size from versus_matches where id = p_match;
  select s into v_seat
  from generate_series(1, v_size) s
  where not exists (select 1 from versus_players where match_id = p_match and seat = s)
  order by s
  limit 1;
  if v_seat is null then
    return false;
  end if;
  insert into versus_players (match_id, player_id, seat, name)
  values (p_match, p_player, v_seat, versus_clean_name(p_name));
  return true;
end;
$$;

-- ───────────────────────────── Making and joining ─────────────────────────────

/**
 * Service only (the Edge Function): store a new match, its answer keys and its
 * first player.
 *   p_keys: [{ "round": 1, "valid": [..] }, ...]
 */
create function public.versus_create(
  p_player uuid, p_name text, p_kind text, p_size int, p_code text, p_prompt_ids text[], p_year int, p_keys jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into versus_matches (code, kind, size, host, prompt_ids, year)
  values (p_code, p_kind, p_size, p_player, p_prompt_ids, p_year)
  returning id into v_id;
  insert into versus_keys (match_id, round, valid)
  select v_id, (k ->> 'round')::smallint, array(select jsonb_array_elements_text(k -> 'valid')::bigint)
  from jsonb_array_elements(p_keys) k;
  perform versus_take_seat(v_id, p_player, p_name);
  return v_id;
end;
$$;

/**
 * Service only: a seat in an open quick match of this size, or null if there
 * isn't one (the Edge Function then makes a new match).
 */
create function public.versus_join_quick(p_player uuid, p_name text, p_size int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  m versus_matches;
begin
  -- Already waiting in one: go back to it.
  select vm.id into v_id
  from versus_matches vm
  join versus_players vp on vp.match_id = vm.id and vp.player_id = p_player
  where vm.kind = 'quick' and vm.status = 'waiting'
  order by vm.created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  for v_id in
    select id from versus_matches
    where kind = 'quick' and size = p_size and status = 'waiting' and created_at > now() - interval '40 seconds'
    order by created_at
    for update skip locked
  loop
    m := versus_tick(v_id);
    if m.status = 'waiting' and versus_take_seat(v_id, p_player, p_name) then
      perform versus_tick(v_id);
      return v_id;
    end if;
  end loop;
  return null;
end;
$$;

/** Join a private room by its code. */
create function public.versus_join(p_player uuid, p_name text, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  m versus_matches;
begin
  select id into v_id from versus_matches where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_id is null then
    raise exception 'no_such_room' using errcode = 'P0001';
  end if;
  m := versus_tick(v_id);
  if exists (select 1 from versus_players where match_id = v_id and player_id = p_player) then
    return v_id;
  end if;
  if m.status <> 'waiting' then
    raise exception 'already_started' using errcode = 'P0001';
  end if;
  if not versus_take_seat(v_id, p_player, p_name) then
    raise exception 'room_full' using errcode = 'P0001';
  end if;
  perform versus_tick(v_id); -- the last seat filled: start the countdown now
  return v_id;
end;
$$;

/** The host of a private room starts it with whoever is there (two or more). */
create function public.versus_start(p_player uuid, p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m versus_matches;
begin
  m := versus_tick(p_match);
  if m.host <> p_player then
    raise exception 'not_host' using errcode = 'P0001';
  end if;
  if m.status <> 'waiting' then
    return;
  end if;
  if (select count(*) from versus_players where match_id = p_match) < 2 then
    raise exception 'need_two' using errcode = 'P0001';
  end if;
  update versus_matches
  set status = 'playing', round = 1, round_starts_at = now() + interval '4 seconds', closed_at = null
  where id = p_match;
end;
$$;

/** Leave: before the start your seat is freed; after it, you just stop answering. */
create function public.versus_leave(p_player uuid, p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m versus_matches;
begin
  m := versus_tick(p_match);
  if m.status = 'waiting' then
    delete from versus_players where match_id = p_match and player_id = p_player;
    if m.host = p_player then
      update versus_matches
      set host = coalesce((select player_id from versus_players where match_id = p_match order by seat limit 1), host)
      where id = p_match;
    end if;
    perform versus_tick(p_match);
  elsif m.status = 'playing' then
    update versus_players set left_at = coalesce(left_at, now()) where match_id = p_match and player_id = p_player;
    perform versus_tick(p_match);
  end if;
end;
$$;

-- ───────────────────────────── Playing ─────────────────────────────

/**
 * Everything a player's screen needs. Other players' answers to the current
 * question stay hidden until the round closes; you only see who has answered.
 */
create function public.versus_state(p_player uuid, p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m versus_matches;
  v_seat int;
begin
  select seat into v_seat from versus_players where match_id = p_match and player_id = p_player;
  if v_seat is null then
    raise exception 'not_in_match' using errcode = 'P0001';
  end if;
  m := versus_tick(p_match);

  return jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'kind', m.kind,
    'size', m.size,
    'status', m.status,
    'host_seat', (select seat from versus_players where match_id = m.id and player_id = m.host),
    'my_seat', v_seat,
    'year', m.year,
    'round', m.round,
    'round_starts_at', versus_ms(m.round_starts_at),
    'closed_at', versus_ms(m.closed_at),
    'start_by', case when m.kind = 'quick' and m.status = 'waiting' then versus_ms(m.created_at + interval '45 seconds') end,
    'server_now', versus_ms(now()),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('seat', seat, 'name', name, 'left', left_at is not null) order by seat), '[]'::jsonb)
      from versus_players where match_id = m.id
    ),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'round', r,
        'prompt_id', m.prompt_ids[r],
        'answered', (
          select coalesce(jsonb_agg(p.seat order by p.seat), '[]'::jsonb)
          from versus_answers a join versus_players p on p.match_id = a.match_id and p.player_id = a.player_id
          where a.match_id = m.id and a.round = r
        ),
        'answers', case when r < m.round or m.closed_at is not null then (
          select jsonb_agg(jsonb_build_object('seat', p.seat, 'value', a.value) order by p.seat)
          from versus_players p
          left join versus_answers a on a.match_id = p.match_id and a.player_id = p.player_id and a.round = r
          where p.match_id = m.id
        ) end
      ) order by r), '[]'::jsonb)
      from generate_series(1, m.round) r
    )
  );
end;
$$;

/** Hand in an answer. Wrong numbers aren't recorded: keep trying until time runs out. */
create function public.versus_answer(p_player uuid, p_match uuid, p_round int, p_value bigint) returns text
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
  if m.closed_at is not null or now() > m.round_starts_at + interval '28 seconds' then
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

/** Old matches are no use to anyone. Scheduled nightly in 20261114000100_versus_schedule.sql. */
create function public.versus_cleanup() returns int
language sql security definer set search_path = public as $$
  with gone as (delete from versus_matches where created_at < now() - interval '1 day' returning 1)
  select count(*)::int from gone
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.uk_today() to anon, authenticated;
grant execute on function public.start_prompt(date, integer, uuid) to anon, authenticated;
grant execute on function public.submit_answer(date, integer, integer, uuid) to anon, authenticated;
grant execute on function public.get_results(date, uuid) to anon, authenticated;
grant execute on function public.get_distribution(date, integer, uuid) to anon, authenticated;
grant execute on function public.versus_join(uuid, text, text) to anon, authenticated;
grant execute on function public.versus_state(uuid, uuid) to anon, authenticated;
grant execute on function public.versus_answer(uuid, uuid, integer, bigint) to anon, authenticated;
grant execute on function public.versus_start(uuid, uuid) to anon, authenticated;
grant execute on function public.versus_leave(uuid, uuid) to anon, authenticated;
grant execute on all functions in schema public to service_role;
