-- Harder Lone Wolf and Outlier, set with scripts/simulate-tiers.ts.
--
--   Lone Wolf  nobody else at all said it: no other real player and no ghost
--              (before: up to half a weighted player, which was up to 5 ghosts)
--   Outlier    fewer than 1 in 200 of everyone else's answers (before: under 3%,
--              counting your own)
--   Rare       1 in 200 to 4% of everyone else's answers
--   Fair       4% to 20%
--   Obvious    20% or more (unchanged)
--
-- "Everyone else" leaves out the answer being scored: a real player's whole
-- vote, or a ghost's own weight when a ghost's answer is scored.
-- Keep in step with scoreAnswer in src/lib/scoring.ts (tests/unit/sql.test.ts checks).

create or replace function public.score_tier(
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
  same double precision := same_real + w * same_ghost;
  others double precision;
begin
  share := case when total > 0 then same / total else 1 end;
  others := case when total > 0 then greatest(0, same - case when same_real >= 1 then 1 else w end) / total else 0 end;
  if same_real <= 1 and w * same_ghost = 0 then tier := 'lone';
  elsif share >= 0.2 then tier := 'obvious';
  elsif others < 0.005 then tier := 'outlier';
  elsif clever then tier := 'clever';
  elsif others >= 0.04 then tier := 'fair';
  else tier := 'rare';
  end if;
end;
$$;
