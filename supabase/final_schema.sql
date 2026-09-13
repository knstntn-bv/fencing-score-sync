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
as $$
begin
  perform set_config('fencing.deleting_club_id', old.id::text, true);
  return old;
end;
$$;

create trigger clubs_mark_deleting
  before delete on public.clubs
  for each row
  execute procedure public.clubs_mark_deleting();

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.club_member_role not null,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index club_members_user_id_idx
  on public.club_members (user_id);

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members
    where club_id = p_club_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.club_members_protect_last_owner()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('fencing.deleting_club_id', true) = old.club_id::text then
      return old;
    end if;

    if old.role = 'owner'
      and not exists (
        select 1 from public.club_members
        where club_id = old.club_id
          and role = 'owner'
          and user_id <> old.user_id
      )
      and exists (
        select 1 from public.club_members
        where club_id = old.club_id
          and user_id <> old.user_id
      )
    then
      raise exception 'club % must keep at least one owner', old.club_id;
    end if;

    return old;
  end if;

  if old.role = 'owner'
    and new.role is distinct from 'owner'
    and not exists (
      select 1 from public.club_members
      where club_id = old.club_id
        and role = 'owner'
        and user_id <> old.user_id
    )
  then
    raise exception 'club % must keep at least one owner', old.club_id;
  end if;

  return new;
end;
$$;

create trigger club_members_protect_last_owner
  before delete or update of role on public.club_members
  for each row
  execute procedure public.club_members_protect_last_owner();

create or replace function public.club_members_cleanup_empty_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('fencing.deleting_club_id', true) = old.club_id::text then
    return old;
  end if;

  if not exists (
    select 1 from public.club_members where club_id = old.club_id
  ) then
    delete from public.clubs where id = old.club_id;
  end if;

  return old;
end;
$$;

create trigger club_members_cleanup_empty_club
  after delete on public.club_members
  for each row
  execute procedure public.club_members_cleanup_empty_club();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club_id uuid;
begin
  if exists (
    select 1 from public.club_members where user_id = new.id
  ) then
    return new;
  end if;

  insert into public.clubs (name)
  values ('Fencing Club')
  returning id into new_club_id;

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, new.id, 'owner');

  return new;
end;
$$;

create or replace function public.ensure_own_club()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_club_id uuid;
  new_club_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select club_id
  into existing_club_id
  from public.club_members
  where user_id = auth.uid()
  order by (role = 'owner') desc, created_at asc
  limit 1;

  if existing_club_id is not null then
    return existing_club_id;
  end if;

  insert into public.clubs (name)
  values ('Fencing Club')
  returning id into new_club_id;

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, auth.uid(), 'owner');

  return new_club_id;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

create table public.fencers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fencers_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index fencers_club_active_name_unique
  on public.fencers (club_id, lower(trim(name)))
  where archived_at is null;

create trigger fencers_set_updated_at
  before update on public.fencers
  for each row
  execute procedure public.set_updated_at();

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
alter table public.club_members enable row level security;
alter table public.fencers enable row level security;
alter table public.matches enable row level security;

create policy "clubs_select_member"
  on public.clubs for select
  to authenticated
  using (public.is_club_member(id));

create policy "club_members_select_own"
  on public.club_members for select
  to authenticated
  using (user_id = auth.uid());

create policy "fencers_select_member"
  on public.fencers for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "fencers_insert_member"
  on public.fencers for insert
  to authenticated
  with check (public.is_club_member(club_id));

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
revoke all on function public.ensure_own_club() from public;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.ensure_own_club() to authenticated;

grant usage on type public.club_member_role to authenticated;

revoke all on public.clubs from anon;
revoke all on public.club_members from anon;
revoke all on public.fencers from anon;
revoke all on public.matches from anon;
grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;
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
  fencer_id uuid not null references public.fencers (id),
  club_id uuid not null references public.clubs (id) on delete cascade,
  group_no integer,
  primary key (tournament_id, fencer_id)
);

create index tournament_participants_club_id_idx
  on public.tournament_participants (club_id);

create table public.tournament_bouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,

  stage public.tournament_bout_stage not null,
  group_no integer,
  round_code text,
  sort_order integer not null,

  blue_fencer_id uuid references public.fencers (id),
  red_fencer_id uuid references public.fencers (id),
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

  koth_king_id uuid references public.fencers (id),

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
    and exists (
      select 1 from public.fencers f
      where f.id = fencer_id and f.club_id = tournament_participants.club_id
    )
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
    and exists (
      select 1 from public.fencers f
      where f.id = fencer_id and f.club_id = tournament_participants.club_id
    )
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
        select 1 from public.fencers f
        where f.id = blue_fencer_id and f.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.fencers f
        where f.id = red_fencer_id and f.club_id = tournament_bouts.club_id
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
        select 1 from public.fencers f
        where f.id = blue_fencer_id and f.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.fencers f
        where f.id = red_fencer_id and f.club_id = tournament_bouts.club_id
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

grant usage on type public.tournament_status to authenticated;
grant usage on type public.tournament_format to authenticated;
grant usage on type public.tournament_points_scheme to authenticated;
grant usage on type public.tournament_bout_stage to authenticated;
