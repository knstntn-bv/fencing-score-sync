-- Current desired schema. Apply in the Supabase SQL Editor on an empty project.
-- Do not replay timestamped files in migrations/ on top of this.
--
-- Live projects that already ran older migrations: apply only the new files
-- under migrations/, then keep this file in sync with the result.
--
-- When changing the database:
--   1. Add supabase/migrations/YYYYMMDDHHMMSS_short_name.sql (delta from current).
--   2. Update this file so it still creates the full schema from scratch.
--   3. Do not rewrite migrations that have already been applied.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.club_member_role as enum ('owner', 'trainer', 'member');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Fencing Club',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_name_not_blank check (char_length(trim(name)) > 0)
);

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row
  execute procedure public.set_updated_at();

create or replace function public.clubs_mark_deleting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('fencing.deleting_club_id', old.id::text, true);
  perform set_config('fencing.fencer_link', '1', true);

  delete from public.matches where club_id = old.id;
  delete from public.tournaments where club_id = old.id;
  delete from public.tournament_bouts where club_id = old.id;
  delete from public.tournament_participants where club_id = old.id;
  delete from public.fencers
  where club_id = old.id
    and user_id is null;

  update public.fencers
  set club_id = null,
      role = null
  where club_id = old.id
    and user_id is not null;

  return old;
end;
$$;

create trigger clubs_mark_deleting
  before delete on public.clubs
  for each row
  execute procedure public.clubs_mark_deleting();

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.fencers
    where club_id = p_club_id
      and user_id = auth.uid()
      and archived_at is null
  );
end;
$$;

create or replace function public.is_club_owner(p_club_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.fencers
    where club_id = p_club_id
      and user_id = auth.uid()
      and role = 'owner'
      and archived_at is null
  );
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  public_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (char_length(trim(name)) > 0),
  constraint profiles_public_id_digits check (public_id ~ '^[0-9]+$'),
  constraint profiles_public_id_unique unique (public_id)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_updated_at();

create or replace function public.profiles_assign_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.public_id := old.public_id;
    return new;
  end if;

  perform pg_advisory_xact_lock(871234002);

  select (coalesce(max(public_id::bigint), 1000) + 1)::text
  into new.public_id
  from public.profiles;

  return new;
end;
$$;

create trigger profiles_assign_public_id
  before insert or update on public.profiles
  for each row
  execute procedure public.profiles_assign_public_id();

create or replace function public.save_own_profile(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  profile_public_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if normalized is null then
    raise exception 'Name is required';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  insert into public.profiles (user_id, name)
  values (auth.uid(), normalized)
  on conflict (user_id) do update
    set name = excluded.name
  returning public_id into profile_public_id;

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set name = normalized,
      public_id = coalesce(public_id, profile_public_id)
  where user_id = auth.uid()
    and archived_at is null;

  if not found then
    insert into public.fencers (club_id, name, user_id, role, public_id)
    values (null, normalized, auth.uid(), null, profile_public_id);
  end if;

  return normalized;
end;
$$;

create or replace function public.create_own_club(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  club_name text;
  profile_name text;
  profile_public_id text;
  existing_id uuid;
  existing_club_id uuid;
  new_club_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  club_name := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if club_name is null then
    raise exception 'Club name is required';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select id, club_id
  into existing_id, existing_club_id
  from public.fencers
  where user_id = auth.uid()
  limit 1;

  if existing_club_id is not null then
    raise exception 'Already in a club';
  end if;

  select name, public_id
  into profile_name, profile_public_id
  from public.profiles
  where user_id = auth.uid();

  if profile_name is null then
    raise exception 'Profile name is required';
  end if;

  insert into public.clubs (name)
  values (club_name)
  returning id into new_club_id;

  perform set_config('fencing.fencer_link', '1', true);

  if existing_id is not null then
    update public.fencers
    set club_id = new_club_id,
        role = 'owner',
        name = profile_name,
        public_id = coalesce(public_id, profile_public_id),
        archived_at = null
    where id = existing_id;
  else
    insert into public.fencers (club_id, name, user_id, role, public_id)
    values (new_club_id, profile_name, auth.uid(), 'owner', profile_public_id);
  end if;

  return new_club_id;
end;
$$;

create or replace function public.rename_own_club(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  club_name text;
  target_club_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  club_name := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if club_name is null then
    raise exception 'Club name is required';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select club_id
  into target_club_id
  from public.fencers
  where user_id = auth.uid()
    and role = 'owner'
    and archived_at is null
  limit 1;

  if target_club_id is null then
    raise exception 'Only the owner can rename the club';
  end if;

  update public.clubs
  set name = club_name
  where id = target_club_id;

  return club_name;
end;
$$;

create table public.fencers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  role public.club_member_role,
  name text not null,
  public_id text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fencers_name_not_blank check (char_length(trim(name)) > 0),
  constraint fencers_public_id_digits check (public_id is null or public_id ~ '^[0-9]+$'),
  constraint fencers_person_or_nickname check (
    (
      user_id is null
      and role is null
      and public_id is null
      and club_id is not null
    )
    or
    (
      user_id is not null
      and public_id is not null
      and (
        (club_id is null and role is null)
        or (club_id is not null and role is not null)
      )
    )
  )
);

create unique index fencers_club_active_name_unique
  on public.fencers (club_id, lower(trim(name)))
  where archived_at is null and club_id is not null;

create unique index fencers_user_unique
  on public.fencers (user_id)
  where user_id is not null;

create unique index fencers_public_id_unique
  on public.fencers (public_id)
  where public_id is not null;

create trigger fencers_set_updated_at
  before update on public.fencers
  for each row
  execute procedure public.set_updated_at();

create or replace function public.fencers_freeze_link()
returns trigger
language plpgsql
as $$
begin
  if current_setting('fencing.fencer_link', true) = '1' then
    return new;
  end if;

  new.user_id := old.user_id;
  new.role := old.role;
  new.club_id := old.club_id;
  new.public_id := old.public_id;

  if old.user_id is not null then
    if new.name is distinct from old.name then
      raise exception 'linked fencer name can only be changed from the profile';
    end if;
    if new.archived_at is distinct from old.archived_at then
      raise exception 'linked fencer must be unlinked to archive';
    end if;
  end if;

  return new;
end;
$$;

create trigger fencers_freeze_link
  before update on public.fencers
  for each row
  execute procedure public.fencers_freeze_link();

create or replace function public.fencers_protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  leaving boolean;
begin
  if tg_op = 'DELETE' then
    if old.club_id is not null
      and current_setting('fencing.deleting_club_id', true) = old.club_id::text
    then
      return old;
    end if;
    leaving := old.role = 'owner' and old.user_id is not null and old.archived_at is null;
    if leaving
      and not exists (
        select 1
        from public.fencers
        where club_id = old.club_id
          and role = 'owner'
          and user_id is not null
          and archived_at is null
          and id <> old.id
      )
    then
      raise exception 'club % must keep at least one owner', old.club_id;
    end if;
    return old;
  end if;

  if old.club_id is not null
    and current_setting('fencing.deleting_club_id', true) = old.club_id::text
  then
    return new;
  end if;

  leaving :=
    (old.role = 'owner' and old.user_id is not null and old.archived_at is null)
    and not (new.role = 'owner' and new.user_id is not null and new.archived_at is null);

  if leaving
    and not exists (
      select 1
      from public.fencers
      where club_id = old.club_id
        and role = 'owner'
        and user_id is not null
        and archived_at is null
        and id <> old.id
    )
  then
    raise exception 'club % must keep at least one owner', old.club_id;
  end if;

  return new;
end;
$$;

create trigger fencers_protect_last_owner
  before delete or update of role, user_id, archived_at on public.fencers
  for each row
  execute procedure public.fencers_protect_last_owner();

create or replace function public.link_fencer_to_profile(p_fencer_id uuid, p_public_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  profile_user uuid;
  profile_name text;
  profile_public_id text;
  target public.fencers%rowtype;
  existing_fencer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_fencer_id is null then
    raise exception 'Fencer not found';
  end if;

  normalized := nullif(trim(p_public_id), '');
  if normalized is null or normalized !~ '^[0-9]+$' then
    raise exception 'ID is required';
  end if;

  select *
  into target
  from public.fencers
  where id = p_fencer_id;

  if target.id is null or target.club_id is null or not public.is_club_member(target.club_id) then
    raise exception 'Fencer not found';
  end if;

  if target.archived_at is not null then
    raise exception 'Fencer is archived';
  end if;

  if target.user_id is not null then
    raise exception 'Fencer is already linked';
  end if;

  select user_id, name, public_id
  into profile_user, profile_name, profile_public_id
  from public.profiles
  where public_id = normalized;

  if profile_user is null then
    raise exception 'Profile not found';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(profile_user::text));
  perform pg_advisory_xact_lock(871234003, hashtext(p_fencer_id::text));

  select id
  into existing_fencer_id
  from public.fencers
  where user_id = profile_user
  limit 1;

  if existing_fencer_id is not null then
    raise exception 'Already in a club';
  end if;

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set user_id = profile_user,
      role = 'member',
      name = profile_name,
      public_id = profile_public_id
  where id = p_fencer_id;

  return p_fencer_id;
end;
$$;

create or replace function public.unlink_and_archive(p_fencer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.fencers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_fencer_id is null then
    raise exception 'Fencer not found';
  end if;

  select *
  into target
  from public.fencers
  where id = p_fencer_id;

  if target.id is null or target.club_id is null or not public.is_club_member(target.club_id) then
    raise exception 'Fencer not found';
  end if;

  if target.user_id is null then
    raise exception 'Fencer is not linked';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(target.user_id::text));
  perform pg_advisory_xact_lock(871234003, hashtext(p_fencer_id::text));

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set user_id = null,
      role = null,
      public_id = null,
      archived_at = coalesce(archived_at, now())
  where id = p_fencer_id;

  return p_fencer_id;
end;
$$;

create or replace function public.add_linked_fencer(p_public_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  profile_user uuid;
  profile_name text;
  profile_public_id text;
  my_club uuid;
  existing public.fencers%rowtype;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized := nullif(trim(p_public_id), '');
  if normalized is null or normalized !~ '^[0-9]+$' then
    raise exception 'ID is required';
  end if;

  select club_id
  into my_club
  from public.fencers
  where user_id = auth.uid()
    and archived_at is null
    and club_id is not null
  limit 1;

  if my_club is null then
    raise exception 'Not a club member';
  end if;

  select user_id, name, public_id
  into profile_user, profile_name, profile_public_id
  from public.profiles
  where public_id = normalized;

  if profile_user is null then
    raise exception 'Profile not found';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(profile_user::text));

  select *
  into existing
  from public.fencers
  where user_id = profile_user
  limit 1;

  if existing.id is not null and existing.club_id is not null then
    raise exception 'Already in a club';
  end if;

  perform set_config('fencing.fencer_link', '1', true);

  if existing.id is not null then
    update public.fencers
    set club_id = my_club,
        role = 'member',
        name = profile_name,
        public_id = coalesce(public_id, profile_public_id),
        archived_at = null
    where id = existing.id;
    return existing.id;
  end if;

  insert into public.fencers (club_id, name, user_id, role, public_id)
  values (my_club, profile_name, profile_user, 'member', profile_public_id)
  returning id into new_id;

  return new_id;
end;
$$;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,

  blue_fencer_id uuid not null references public.fencers (id),
  red_fencer_id uuid not null references public.fencers (id),
  blue_name text not null,
  red_name text not null,

  blue_score integer not null check (blue_score >= 0),
  red_score integer not null check (red_score >= 0),
  blue_result text not null,
  red_result text not null,
  time_limit_sec integer not null check (time_limit_sec > 0),
  points_limit integer not null check (points_limit > 0),
  remaining_sec integer not null check (remaining_sec >= 0),

  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint matches_distinct_fencers check (blue_fencer_id <> red_fencer_id),
  constraint matches_names_not_blank check (
    char_length(trim(blue_name)) > 0
    and char_length(trim(red_name)) > 0
  ),
  constraint matches_blue_result_check
    check (blue_result in ('win', 'lose', 'draw')),
  constraint matches_red_result_check
    check (red_result in ('win', 'lose', 'draw')),
  constraint matches_results_consistent check (
    (blue_score > red_score and blue_result = 'win' and red_result = 'lose')
    or (red_score > blue_score and blue_result = 'lose' and red_result = 'win')
    or (blue_score = red_score and blue_result = 'draw' and red_result = 'draw')
  )
);

create index matches_club_finished_at_idx
  on public.matches (club_id, finished_at desc);

create index matches_blue_fencer_idx
  on public.matches (blue_fencer_id);

create index matches_red_fencer_idx
  on public.matches (red_fencer_id);

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.fencers enable row level security;
alter table public.matches enable row level security;

create policy "clubs_select_member"
  on public.clubs for select
  to authenticated
  using (public.is_club_member(id));

create policy "clubs_update_owner"
  on public.clubs for update
  to authenticated
  using (public.is_club_owner(id))
  with check (public.is_club_owner(id));

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "fencers_select_member"
  on public.fencers for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "fencers_select_own"
  on public.fencers for select
  to authenticated
  using (user_id = auth.uid());

create policy "fencers_insert_member"
  on public.fencers for insert
  to authenticated
  with check (public.is_club_member(club_id) and user_id is null);

create policy "fencers_update_member"
  on public.fencers for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

-- No delete policy: archive via update. History rows keep fencer ids.

create policy "matches_select_member"
  on public.matches for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "matches_insert_member"
  on public.matches for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.fencers f
      where f.id = blue_fencer_id and f.club_id = matches.club_id
    )
    and exists (
      select 1 from public.fencers f
      where f.id = red_fencer_id and f.club_id = matches.club_id
    )
  );

-- Matches are append-only. No update/delete policies.

revoke all on function public.is_club_member(uuid) from public;
revoke all on function public.is_club_owner(uuid) from public;
revoke all on function public.save_own_profile(text) from public;
revoke all on function public.create_own_club(text) from public;
revoke all on function public.rename_own_club(text) from public;
revoke all on function public.link_fencer_to_profile(uuid, text) from public;
revoke all on function public.unlink_and_archive(uuid) from public;
revoke all on function public.add_linked_fencer(text) from public;
revoke all on function public.profiles_assign_public_id() from public;
revoke all on function public.fencers_freeze_link() from public;
revoke all on function public.fencers_protect_last_owner() from public;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.is_club_owner(uuid) to authenticated;
grant execute on function public.save_own_profile(text) to authenticated;
grant execute on function public.create_own_club(text) to authenticated;
grant execute on function public.rename_own_club(text) to authenticated;
grant execute on function public.link_fencer_to_profile(uuid, text) to authenticated;
grant execute on function public.unlink_and_archive(uuid) to authenticated;
grant execute on function public.add_linked_fencer(text) to authenticated;

grant usage on type public.club_member_role to authenticated;

revoke all on public.clubs from anon;
revoke all on public.profiles from anon;
revoke all on public.fencers from anon;
revoke all on public.matches from anon;
grant select, update on public.clubs to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.fencers to authenticated;
grant select, insert on public.matches to authenticated;

-- Tournaments: club events with check-in, brackets, and bouts that are not club matches.

create type public.tournament_status as enum ('setup', 'live', 'done');
create type public.tournament_format as enum (
  'round_robin',
  'playoff',
  'groups_playoff',
  'swiss',
  'king_of_hill'
);
create type public.tournament_points_scheme as enum ('half', 'binary', 'football');
create type public.tournament_bout_stage as enum ('rr', 'group', 'swiss', 'playoff', 'koth');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  status public.tournament_status not null default 'setup',
  format public.tournament_format,
  points_scheme public.tournament_points_scheme,
  time_limit_sec integer not null,
  points_limit integer not null,
  group_count integer,
  advancers_per_group integer,
  swiss_rounds integer,
  koth_exit_limit integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  live_at timestamptz,
  finished_at timestamptz,
  constraint tournaments_name_not_blank check (char_length(trim(name)) > 0),
  constraint tournaments_time_limit_sec_check
    check (time_limit_sec >= 60 and time_limit_sec <= 300),
  constraint tournaments_points_limit_check
    check (points_limit >= 5 and points_limit <= 20),
  constraint tournaments_koth_exit_limit_check check (koth_exit_limit >= 1)
);

create index tournaments_club_created_at_idx
  on public.tournaments (club_id, created_at desc);

create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row
  execute procedure public.set_updated_at();

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  fencer_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  club_name text,
  is_guest boolean not null default false,
  group_no integer,
  primary key (tournament_id, fencer_id),
  constraint tournament_participants_name_not_blank
    check (char_length(trim(name)) > 0),
  constraint tournament_participants_club_name_not_blank
    check (club_name is null or char_length(trim(club_name)) > 0)
);

create index tournament_participants_club_id_idx
  on public.tournament_participants (club_id);

create or replace function public.tournament_participant_fencer_ok(
  p_fencer_id uuid,
  p_club_id uuid,
  p_is_guest boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_is_guest then
    return
      not exists (
        select 1 from public.fencers as fencer where fencer.id = p_fencer_id
      )
      or exists (
        select 1
        from public.fencers as fencer
        where fencer.id = p_fencer_id
          and fencer.user_id is not null
          and fencer.archived_at is null
          and fencer.club_id is distinct from p_club_id
      );
  end if;

  return exists (
    select 1
    from public.fencers as fencer
    where fencer.id = p_fencer_id
      and fencer.club_id = p_club_id
  );
end;
$$;

create or replace function public.lookup_checkin_by_public_id(p_public_id text, p_club_id uuid)
returns table (
  user_id uuid,
  name text,
  club_name text,
  fencer_id uuid,
  in_host_club boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_club_id is null or not public.is_club_member(p_club_id) then
    raise exception 'Not a club member';
  end if;

  normalized := nullif(trim(p_public_id), '');
  if normalized is null or normalized !~ '^[0-9]+$' then
    raise exception 'ID is required';
  end if;

  return query
  select
    profile.user_id,
    profile.name,
    (
      select club.name
      from public.fencers as linked
      join public.clubs as club on club.id = linked.club_id
      where linked.user_id = profile.user_id
        and linked.archived_at is null
        and linked.club_id is not null
      limit 1
    ) as club_name,
    (
      select person.id
      from public.fencers as person
      where person.user_id = profile.user_id
      limit 1
    ) as fencer_id,
    exists (
      select 1
      from public.fencers as hosted
      where hosted.user_id = profile.user_id
        and hosted.club_id = p_club_id
        and hosted.archived_at is null
    ) as in_host_club
  from public.profiles as profile
  where profile.public_id = normalized;
end;
$$;

create table public.tournament_bouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,

  stage public.tournament_bout_stage not null,
  group_no integer,
  round_code text,
  sort_order integer not null,

  blue_fencer_id uuid,
  red_fencer_id uuid,
  blue_placeholder text,
  red_placeholder text,

  winner_next_id uuid references public.tournament_bouts (id) on delete set null,
  loser_next_id uuid references public.tournament_bouts (id) on delete set null,

  blue_name text,
  red_name text,
  blue_score integer,
  red_score integer,
  blue_result text,
  red_result text,

  time_limit_sec integer,
  points_limit integer,
  remaining_sec integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),

  koth_king_id uuid,

  constraint tournament_bouts_blue_result_check
    check (blue_result is null or blue_result in ('win', 'lose', 'draw')),
  constraint tournament_bouts_red_result_check
    check (red_result is null or red_result in ('win', 'lose', 'draw')),
  constraint tournament_bouts_finished_complete check (
    finished_at is null
    or (
      blue_fencer_id is not null
      and red_fencer_id is not null
      and blue_fencer_id <> red_fencer_id
      and blue_name is not null
      and char_length(trim(blue_name)) > 0
      and red_name is not null
      and char_length(trim(red_name)) > 0
      and blue_score is not null
      and blue_score >= 0
      and red_score is not null
      and red_score >= 0
      and blue_result in ('win', 'lose', 'draw')
      and red_result in ('win', 'lose', 'draw')
      and (
        (blue_score > red_score and blue_result = 'win' and red_result = 'lose')
        or (red_score > blue_score and blue_result = 'lose' and red_result = 'win')
        or (blue_score = red_score and blue_result = 'draw' and red_result = 'draw')
      )
      and time_limit_sec is not null
      and time_limit_sec > 0
      and points_limit is not null
      and points_limit > 0
      and remaining_sec is not null
      and remaining_sec >= 0
      and started_at is not null
      and not (stage = 'playoff' and blue_result = 'draw')
    )
  )
);

create index tournament_bouts_tournament_sort_idx
  on public.tournament_bouts (tournament_id, sort_order);

create index tournament_bouts_tournament_finished_idx
  on public.tournament_bouts (tournament_id, finished_at);

alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_bouts enable row level security;

create policy "tournaments_select_member"
  on public.tournaments for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournaments_insert_member"
  on public.tournaments for insert
  to authenticated
  with check (public.is_club_member(club_id));

create policy "tournaments_update_member"
  on public.tournaments for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

create policy "tournaments_delete_member"
  on public.tournaments for delete
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_participants_select_member"
  on public.tournament_participants for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_participants_insert_member"
  on public.tournament_participants for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_participants.club_id
    )
    and public.tournament_participant_fencer_ok(fencer_id, club_id, is_guest)
  );

create policy "tournament_participants_update_member"
  on public.tournament_participants for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_participants.club_id
    )
    and public.tournament_participant_fencer_ok(fencer_id, club_id, is_guest)
  );

create policy "tournament_participants_delete_member"
  on public.tournament_participants for delete
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_bouts_select_member"
  on public.tournament_bouts for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_bouts_insert_member"
  on public.tournament_bouts for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_bouts.club_id
    )
    and (
      blue_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = blue_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = red_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
  );

create policy "tournament_bouts_update_member"
  on public.tournament_bouts for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_bouts.club_id
    )
    and (
      blue_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = blue_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = red_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
  );

create policy "tournament_bouts_delete_member"
  on public.tournament_bouts for delete
  to authenticated
  using (public.is_club_member(club_id));

revoke all on public.tournaments from anon;
revoke all on public.tournament_participants from anon;
revoke all on public.tournament_bouts from anon;

grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.tournament_participants to authenticated;
grant select, insert, update, delete on public.tournament_bouts to authenticated;

revoke all on function public.lookup_checkin_by_public_id(text, uuid) from public;
grant execute on function public.lookup_checkin_by_public_id(text, uuid) to authenticated;
revoke all on function public.tournament_participant_fencer_ok(uuid, uuid, boolean) from public;
grant execute on function public.tournament_participant_fencer_ok(uuid, uuid, boolean) to authenticated;

grant usage on type public.tournament_status to authenticated;
grant usage on type public.tournament_format to authenticated;
grant usage on type public.tournament_points_scheme to authenticated;
grant usage on type public.tournament_bout_stage to authenticated;
