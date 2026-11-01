--
-- 0002_daily_board.sql — one run per player per day, on that day's seed.
--
-- `DailyChallenge.js` already gives every player the same seed and the same rule
-- twist on the same calendar day, and it keeps a streak. What was missing was
-- everyone else: a streak with no board is a private ritual. This adds the
-- shared table and the three functions behind the hall's "TODAY'S SEED" tab.
--
-- TRUST MODEL, STATED PLAINLY
-- ---------------------------
-- The client is trusted for exactly one thing: its own `device_key`. The server
-- cannot replay a tower-defense run, so it rejects only what is cheap to reject:
-- a day that is not a date, a level id that is not one, numbers that are
-- negative or above a hard ceiling, and a second row for the same player on the
-- same day (the better run is kept). Someone determined can still post a wave
-- count they did not survive; the honest upgrade is a replay check, and a bigger
-- clamp is not it.
--
-- The seed is *stored*, not validated against a server clock: every player's
-- local day is their own, and the board is read filtered by the seed the reader
-- is playing. A run posted under a made-up seed simply never appears on the
-- board of the real day.
--
-- HOW TO APPLY
-- ------------
-- Supabase dashboard → SQL editor → paste this file → Run. It is idempotent
-- (`create ... if not exists`, `create or replace function`), so re-running it
-- after an edit is safe. `0001_cloud_save.sql` must be applied first: every row
-- here points at `public.players`.

begin;

-- --------------------------------------------------------------------------
-- daily_runs
-- --------------------------------------------------------------------------

create table if not exists public.daily_runs (
  id uuid primary key default gen_random_uuid(),
  day_key text not null check (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  player_id uuid not null references public.players (id) on delete cascade,
  level_id text not null check (level_id ~ '^[a-z0-9-]{1,32}$'),
  -- The day's seed, as `seedForDay()` computed it on the client. Kept so a board
  -- can never mix two different runs of the "same" day.
  seed integer not null,
  score integer not null default 0 check (score >= 0 and score <= 5000000),
  waves integer not null default 0 check (waves >= 0 and waves <= 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per player per day: the board is a best run, not a log.
  unique (day_key, player_id)
);

create index if not exists daily_runs_board_idx
  on public.daily_runs (day_key, seed, score desc, waves desc, updated_at asc);

-- --------------------------------------------------------------------------
-- daily_submit — the caller's run for a day, keeping the better of the two
-- --------------------------------------------------------------------------

create or replace function public.daily_submit(
  p_device_key text,
  p_day_key text,
  p_level_id text,
  p_seed integer,
  p_score integer,
  p_waves integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_row public.daily_runs;
begin
  select id into v_id from public.players where device_key = coalesce(p_device_key, '');
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown-device');
  end if;

  if p_day_key is null or p_day_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad-day');
  end if;
  if p_level_id is null or p_level_id !~ '^[a-z0-9-]{1,32}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad-level');
  end if;
  if coalesce(p_score, -1) < 0 or coalesce(p_score, 0) > 5000000 then
    return jsonb_build_object('ok', false, 'reason', 'bad-score');
  end if;
  if coalesce(p_waves, -1) < 0 or coalesce(p_waves, 0) > 999 then
    return jsonb_build_object('ok', false, 'reason', 'bad-waves');
  end if;

  insert into public.daily_runs (day_key, player_id, level_id, seed, score, waves)
  values (p_day_key, v_id, p_level_id, coalesce(p_seed, 0), coalesce(p_score, 0), coalesce(p_waves, 0))
  on conflict (day_key, player_id) do update
    set score = greatest(public.daily_runs.score, excluded.score),
        -- The wave count only follows a run that actually beat the old score:
        -- keeping "best waves" and "best score" from different attempts would
        -- print a run nobody played.
        waves = case
                  when excluded.score > public.daily_runs.score then excluded.waves
                  else greatest(public.daily_runs.waves, excluded.waves)
                end,
        level_id = excluded.level_id,
        seed = excluded.seed,
        updated_at = now()
  returning * into v_row;

  -- The stored best, not the submitted numbers: the caller prints what the
  -- board is actually holding for this device.
  return jsonb_build_object(
    'ok', true,
    'day', v_row.day_key,
    'score', v_row.score,
    'waves', v_row.waves
  );
end;
$$;

-- --------------------------------------------------------------------------
-- daily_board — one page of a day's board, filtered by that day's seed
-- --------------------------------------------------------------------------

create or replace function public.daily_board(
  p_day_key text,
  p_seed integer default null,
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  level_id text,
  score integer,
  waves integer,
  total bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with day as (
    select
      row_number() over (
        order by d.score desc, d.waves desc, d.updated_at asc, d.id asc
      ) as rank,
      pl.username,
      d.level_id,
      d.score,
      d.waves,
      count(*) over () as total
    from public.daily_runs d
    join public.players pl on pl.id = d.player_id
    where d.day_key = p_day_key
      and (p_seed is null or d.seed = p_seed)
  )
  select rank, username, level_id, score, waves, total
  from day
  order by rank
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

-- --------------------------------------------------------------------------
-- my_daily_rank — where the calling device sits on today's board
-- --------------------------------------------------------------------------

create or replace function public.my_daily_rank(
  p_device_key text,
  p_day_key text,
  p_seed integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_row public.daily_runs;
  v_total bigint;
  v_rank bigint;
begin
  select id into v_id from public.players where device_key = coalesce(p_device_key, '');
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown-device');
  end if;

  select * into v_row
    from public.daily_runs
   where day_key = p_day_key
     and player_id = v_id
     and (p_seed is null or seed = p_seed);

  if v_row.id is null then
    return jsonb_build_object('ok', true, 'played', false);
  end if;

  select count(*) into v_total
    from public.daily_runs d
   where d.day_key = p_day_key and (p_seed is null or d.seed = p_seed);

  select count(*) + 1 into v_rank
    from public.daily_runs d
   where d.day_key = p_day_key
     and (p_seed is null or d.seed = p_seed)
     and (
       d.score > v_row.score
       or (d.score = v_row.score and d.waves > v_row.waves)
       or (d.score = v_row.score and d.waves = v_row.waves and d.updated_at < v_row.updated_at)
     );

  return jsonb_build_object(
    'ok', true,
    'played', true,
    'rank', v_rank,
    'total', v_total,
    'score', v_row.score,
    'waves', v_row.waves,
    'levelId', v_row.level_id
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Closed to the anon key, like every other table in this schema
-- --------------------------------------------------------------------------

alter table public.daily_runs enable row level security;

revoke all on table public.daily_runs from anon, authenticated;

revoke all on function public.daily_submit(text, text, text, integer, integer, integer) from public;
revoke all on function public.daily_board(text, integer, integer) from public;
revoke all on function public.my_daily_rank(text, text, integer) from public;

grant execute on function public.daily_submit(text, text, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.daily_board(text, integer, integer) to anon, authenticated;
grant execute on function public.my_daily_rank(text, text, integer) to anon, authenticated;

commit;
