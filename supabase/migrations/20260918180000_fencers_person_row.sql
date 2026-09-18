-- Person row on fencers: named accounts keep a permanent id, club optional.
-- profiles stays; public_id is dual-written. Nickname merge, leave-club, and
-- dropping profiles are later steps.

alter table public.fencers
  drop constraint fencers_role_matches_user;

alter table public.fencers
  alter column club_id drop not null;

alter table public.fencers
  drop constraint fencers_club_id_fkey;

alter table public.fencers
  add constraint fencers_club_id_fkey
  foreign key (club_id) references public.clubs (id) on delete set null;

alter table public.fencers
  add column public_id text;

alter table public.fencers
  add constraint fencers_public_id_digits
  check (public_id is null or public_id ~ '^[0-9]+$');

update public.fencers as fencer
set public_id = profile.public_id
from public.profiles as profile
where fencer.user_id = profile.user_id
  and fencer.public_id is null;

do $backfill$
begin
  perform set_config('fencing.fencer_link', '1', true);

  insert into public.fencers (club_id, user_id, role, name, public_id)
  select
    null,
    profile.user_id,
    null,
    profile.name,
    profile.public_id
  from public.profiles as profile
  where not exists (
    select 1
    from public.fencers as fencer
    where fencer.user_id = profile.user_id
  );
end;
$backfill$;

alter table public.fencers
  add constraint fencers_person_or_nickname check (
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
  );

drop index public.fencers_club_active_name_unique;

create unique index fencers_club_active_name_unique
  on public.fencers (club_id, lower(trim(name)))
  where archived_at is null and club_id is not null;

create unique index fencers_public_id_unique
  on public.fencers (public_id)
  where public_id is not null;

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

drop policy if exists "fencers_select_own" on public.fencers;

create policy "fencers_select_own"
  on public.fencers for select
  to authenticated
  using (user_id = auth.uid());
