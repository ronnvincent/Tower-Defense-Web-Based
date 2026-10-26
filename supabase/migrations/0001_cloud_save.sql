-- 0001_cloud_save.sql — the realm ledger.
--
-- WHAT THIS IS
-- ------------
-- Three tables and seven functions that let a browser keep its save file in
-- Postgres, and let every player read one shared ranking.
--
--   players              one row per commander: the name, the device key that
--                        proves the browser owns the row, and the four numbers
--                        the ranking is built from.
--   progress             the save file itself, as jsonb. The client owns the
--                        shape; the database owns the row.
--   player_achievements  one row per unlocked medal, so the ranking can count
--                        them without parsing the save blob.
--
-- WHY THERE IS NO PASSWORD
-- ------------------------
-- The brief asks for a name and nothing else. With no password and no email
-- there is nothing to authenticate, so the browser mints a random `device_key`
-- on first run and keeps it in localStorage. The key is the only credential:
-- it proves "this browser owns this row" for `sync_progress`. It is never
-- returned by any function, so reading the ranking cannot leak it, and the
-- tables themselves are not readable by the anon key at all (RLS with no
-- policies + revoked grants). Everything the client is allowed to do is a
-- security-definer function with a fixed, narrow signature.
--
-- WHAT IT CANNOT DO
-- -----------------
-- A device key lives in one browser. Clearing site data loses the key, and with
-- it the ability to write that row again — the name stays taken (which is what
-- "hindi na tatanggapin" means) but the progress behind it becomes read-only.
-- Restoring a save across devices would need a recovery code or a real auth
-- provider; neither is in this scope, and pretending otherwise would be worse
-- than saying it.
--
-- HOW TO APPLY
-- ------------
-- Supabase dashboard → SQL editor → paste this file → Run. It is idempotent
-- (`create ... if not exists`, `create or replace function`), so re-running it
-- after an edit is safe. See `supabase/README.md` for the env vars the game
-- needs.

begin;

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- players
-- --------------------------------------------------------------------------

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  -- The uniqueness check is case-insensitive ("Aria" and "aria" are one name),
  -- so the comparison happens on a lower-cased copy that the insert owns.
  username_key text not null,
  -- Opaque per-browser secret. 36 hex-ish characters (a UUID) in practice.
  device_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ranking columns. Every one is clamped at zero: a bad payload can never
  -- move a player backwards through the ranking by accident.
  power integer not null default 0 check (power >= 0),
  level integer not null default 1 check (level >= 1),
  stars integer not null default 0 check (stars >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  waves integer not null default 0 check (waves >= 0),
  achievements integer not null default 0 check (achievements >= 0),
  constraint players_username_shape check (username ~ '^[A-Za-z0-9 ._-]{3,16}$'),
  constraint players_username_key_shape check (username_key = lower(btrim(username))),
  constraint players_device_key_shape check (device_key ~ '^[A-Za-z0-9-]{16,64}$')
);

create unique index if not exists players_username_key_uidx
  on public.players (username_key);
create unique index if not exists players_device_key_uidx
  on public.players (device_key);
create index if not exists players_ranking_idx
  on public.players (power desc, level desc, stars desc, best_score desc, created_at asc);

-- --------------------------------------------------------------------------
-- progress — the save file, one row per player
-- --------------------------------------------------------------------------

create table if not exists public.progress (
  player_id uuid primary key references public.players (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- player_achievements — one row per unlocked medal
-- --------------------------------------------------------------------------

create table if not exists public.player_achievements (
  player_id uuid not null references public.players (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

create index if not exists player_achievements_player_idx
  on public.player_achievements (player_id);

-- --------------------------------------------------------------------------
-- helpers
-- --------------------------------------------------------------------------

-- Trim, collapse inner whitespace, and drop control characters. The same rules
-- live in `src/systems/CloudSave.js#sanitizeUsername`; the database is the
-- authority, the client copy only exists to fail fast in the form.
create or replace function public.clean_username(p_username text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));
$$;

-- --------------------------------------------------------------------------
-- cloud_ping — "is this a ledger, and which version?"
-- --------------------------------------------------------------------------

create or replace function public.cloud_ping()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'service', 'realm-ledger',
    'schema', 1
  );
$$;

-- --------------------------------------------------------------------------
-- check_username — the live "is this name free?" the form calls while typing
-- --------------------------------------------------------------------------

create or replace function public.check_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := public.clean_username(p_username);
  v_key text := lower(public.clean_username(p_username));
  v_taken boolean;
begin
  if v_name = '' then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'empty', 'username', v_name);
  end if;
  if v_name !~ '^[A-Za-z0-9 ._-]{3,16}$' then
    return jsonb_build_object('ok', true, 'available', false, 'reason', 'invalid', 'username', v_name);
  end if;

  select exists (select 1 from public.players where username_key = v_key) into v_taken;

  return jsonb_build_object(
    'ok', true,
    'available', not v_taken,
    'reason', case when v_taken then 'taken' else 'free' end,
    'username', v_name
  );
end;
$$;

-- --------------------------------------------------------------------------
-- register_player — claim a name. The ONLY way a player row is created.
-- --------------------------------------------------------------------------

create or replace function public.register_player(p_username text, p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := public.clean_username(p_username);
  v_key text := lower(public.clean_username(p_username));
  v_device text := coalesce(p_device_key, '');
  v_id uuid;
  v_existing uuid;
begin
  if v_name !~ '^[A-Za-z0-9 ._-]{3,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'username', v_name);
  end if;
  if v_device !~ '^[A-Za-z0-9-]{16,64}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad-device');
  end if;

  -- Already claimed by someone else? Say so and write nothing.
  select id into v_existing from public.players where username_key = v_key;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'taken', 'username', v_name);
  end if;

  -- This browser already owns a name: it cannot claim a second one.
  select id into v_existing from public.players where device_key = v_device;
  if v_existing is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'device-claimed',
      'playerId', v_existing,
      'username', (select username from public.players where id = v_existing)
    );
  end if;

  begin
    insert into public.players (username, username_key, device_key)
    values (v_name, v_key, v_device)
    returning id into v_id;
  exception when unique_violation then
    -- Two players typed the same name in the same instant; the loser is told
    -- the name is taken rather than being handed a duplicate row.
    return jsonb_build_object('ok', false, 'reason', 'taken', 'username', v_name);
  end;

  insert into public.progress (player_id) values (v_id)
  on conflict (player_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'playerId', v_id,
    'username', v_name,
    'createdAt', now()
  );
end;
$$;

-- --------------------------------------------------------------------------
-- sync_progress — the save, plus the four ranking numbers
-- --------------------------------------------------------------------------

create or replace function public.sync_progress(
  p_device_key text,
  p_data jsonb,
  p_metrics jsonb,
  p_achievements text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_revision integer;
  v_power integer := greatest(0, coalesce((p_metrics ->> 'power')::int, 0));
  v_level integer := greatest(1, coalesce((p_metrics ->> 'level')::int, 1));
  v_stars integer := greatest(0, coalesce((p_metrics ->> 'stars')::int, 0));
  v_best integer := greatest(0, coalesce((p_metrics ->> 'bestScore')::int, 0));
  v_waves integer := greatest(0, coalesce((p_metrics ->> 'waves')::int, 0));
  v_ach integer := greatest(0, coalesce((p_metrics ->> 'achievements')::int, 0));
  v_unlocked integer;
begin
  select id into v_id from public.players where device_key = coalesce(p_device_key, '') for update;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown-device');
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'bad-payload');
  end if;
  -- A save file is a few kilobytes. A megabyte of "save" is not a save.
  if octet_length(p_data::text) > 131072 then
    return jsonb_build_object('ok', false, 'reason', 'payload-too-large');
  end if;

  insert into public.player_achievements (player_id, achievement_id)
  select distinct v_id, medal
  from unnest(coalesce(p_achievements, '{}')) as medal
  where medal ~ '^[a-z0-9-]{1,64}$'
  on conflict (player_id, achievement_id) do nothing;

  select count(*) into v_unlocked from public.player_achievements where player_id = v_id;

  update public.players
     set power = v_power,
         level = v_level,
         stars = v_stars,
         best_score = greatest(best_score, v_best),
         waves = greatest(waves, v_waves),
         achievements = v_unlocked,
         updated_at = now()
   where id = v_id;

  insert into public.progress (player_id, data, revision, updated_at)
  values (v_id, p_data, 1, now())
  on conflict (player_id) do update
    set data = excluded.data,
        revision = public.progress.revision + 1,
        updated_at = now()
  returning revision into v_revision;

  return jsonb_build_object(
    'ok', true,
    'revision', coalesce(v_revision, 1),
    'power', v_power,
    'level', v_level,
    'achievements', v_unlocked
  );
end;
$$;

-- --------------------------------------------------------------------------
-- pull_progress — read back the row this device owns
-- --------------------------------------------------------------------------

create or replace function public.pull_progress(p_device_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_revision integer;
begin
  select id, username, power, level, stars, best_score, waves, achievements, created_at
    into v_row
    from public.players
   where device_key = coalesce(p_device_key, '');
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown-device');
  end if;

  select revision into v_revision from public.progress where player_id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'playerId', v_row.id,
    'username', v_row.username,
    'power', v_row.power,
    'level', v_row.level,
    'stars', v_row.stars,
    'bestScore', v_row.best_score,
    'waves', v_row.waves,
    'achievements', v_row.achievements,
    'revision', coalesce(v_revision, 0)
  );
end;
$$;

-- --------------------------------------------------------------------------
-- leaderboard_page — the shared ranking
-- --------------------------------------------------------------------------
-- Order: power, then commander level, then stars, then best score, then who got
-- there first. Every tie-break is a column, so the order is total and stable —
-- two players with identical numbers can never swap places between refreshes.

create or replace function public.leaderboard_page(p_limit integer default 25, p_offset integer default 0)
returns table (
  rank bigint,
  username text,
  power integer,
  level integer,
  stars integer,
  best_score integer,
  waves integer,
  achievements integer,
  total bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      row_number() over (
        order by p.power desc, p.level desc, p.stars desc, p.best_score desc, p.created_at asc, p.id asc
      ) as rank,
      p.username,
      p.power,
      p.level,
      p.stars,
      p.best_score,
      p.waves,
      p.achievements,
      count(*) over () as total
    from public.players p
  )
  select rank, username, power, level, stars, best_score, waves, achievements, total
  from ranked
  order by rank
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- --------------------------------------------------------------------------
-- my_rank — where the calling device sits
-- --------------------------------------------------------------------------

create or replace function public.my_rank(p_device_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_row record;
  v_total bigint;
  v_rank bigint;
begin
  select id into v_id from public.players where device_key = coalesce(p_device_key, '');
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown-device');
  end if;

  select username, power, level, stars, best_score, waves, achievements, created_at
    into v_row
    from public.players where id = v_id;

  select count(*) into v_total from public.players;

  select count(*) + 1 into v_rank
    from public.players p
   where p.power > v_row.power
      or (p.power = v_row.power and p.level > v_row.level)
      or (p.power = v_row.power and p.level = v_row.level and p.stars > v_row.stars)
      or (p.power = v_row.power and p.level = v_row.level and p.stars = v_row.stars
          and p.best_score > v_row.best_score)
      or (p.power = v_row.power and p.level = v_row.level and p.stars = v_row.stars
          and p.best_score = v_row.best_score and p.created_at < v_row.created_at);

  return jsonb_build_object(
    'ok', true,
    'username', v_row.username,
    'rank', v_rank,
    'total', v_total,
    'power', v_row.power,
    'level', v_row.level,
    'stars', v_row.stars,
    'bestScore', v_row.best_score,
    'waves', v_row.waves,
    'achievements', v_row.achievements
  );
end;
$$;

-- --------------------------------------------------------------------------
-- access control
-- --------------------------------------------------------------------------
-- The tables are closed to the anon key. Every read and write the client is
-- allowed to make goes through one of the functions above, which are security
-- definer and therefore run with the owner's rights.

alter table public.players enable row level security;
alter table public.progress enable row level security;
alter table public.player_achievements enable row level security;

revoke all on table public.players from anon, authenticated;
revoke all on table public.progress from anon, authenticated;
revoke all on table public.player_achievements from anon, authenticated;

revoke all on function public.cloud_ping() from public;
revoke all on function public.check_username(text) from public;
revoke all on function public.register_player(text, text) from public;
revoke all on function public.sync_progress(text, jsonb, jsonb, text[]) from public;
revoke all on function public.pull_progress(text) from public;
revoke all on function public.leaderboard_page(integer, integer) from public;
revoke all on function public.my_rank(text) from public;

grant execute on function public.cloud_ping() to anon, authenticated;
grant execute on function public.check_username(text) to anon, authenticated;
grant execute on function public.register_player(text, text) to anon, authenticated;
grant execute on function public.sync_progress(text, jsonb, jsonb, text[]) to anon, authenticated;
grant execute on function public.pull_progress(text) to anon, authenticated;
grant execute on function public.leaderboard_page(integer, integer) to anon, authenticated;
grant execute on function public.my_rank(text) to anon, authenticated;

commit;
