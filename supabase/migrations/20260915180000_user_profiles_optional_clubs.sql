-- Accounts are independent of clubs.
-- Signup no longer creates a club. Users save a display name, then may create a club
-- (owner membership + roster row) or skip and stay on settings only.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.ensure_own_club();

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (char_length(trim(name)) > 0)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_updated_at();

alter table public.fencers
  add column user_id uuid references auth.users (id) on delete set null;

create unique index fencers_club_user_unique
  on public.fencers (club_id, user_id)
  where user_id is not null;

create index fencers_user_id_idx
  on public.fencers (user_id)
  where user_id is not null;

create or replace function public.save_own_profile(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if normalized is null then
    raise exception 'Name is required';
  end if;

  insert into public.profiles (user_id, name)
  values (auth.uid(), normalized)
  on conflict (user_id) do update
    set name = excluded.name;

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

  select club_id
  into existing_club_id
  from public.club_members
  where user_id = auth.uid()
  order by (role = 'owner') desc, created_at asc
  limit 1;

  if existing_club_id is not null then
    raise exception 'Already in a club';
  end if;

  select name
  into profile_name
  from public.profiles
  where user_id = auth.uid();

  if profile_name is null then
    raise exception 'Profile name is required';
  end if;

  insert into public.clubs (name)
  values (club_name)
  returning id into new_club_id;

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, auth.uid(), 'owner');

  insert into public.fencers (club_id, name, user_id)
  values (new_club_id, profile_name, auth.uid());

  return new_club_id;
end;
$$;

alter table public.profiles enable row level security;

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

drop policy if exists "fencers_insert_member" on public.fencers;
create policy "fencers_insert_member"
  on public.fencers for insert
  to authenticated
  with check (public.is_club_member(club_id) and user_id is null);

revoke all on function public.save_own_profile(text) from public;
revoke all on function public.create_own_club(text) from public;
grant execute on function public.save_own_profile(text) to authenticated;
grant execute on function public.create_own_club(text) to authenticated;

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;
