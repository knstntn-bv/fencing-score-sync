-- Name and public_id live only on fencers. Drop profiles.

do $copy$
begin
  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers as person
  set public_id = profile.public_id
  from public.profiles as profile
  where person.user_id = profile.user_id
    and person.public_id is null
    and profile.public_id is not null;
end;
$copy$;

create or replace function public.fencers_assign_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.public_id := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.public_id is not null then
    new.public_id := old.public_id;
    return new;
  end if;

  if new.public_id is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(871234002);

  select (coalesce(max(public_id::bigint), 1000) + 1)::text
  into new.public_id
  from public.fencers
  where public_id is not null;

  return new;
end;
$$;

drop trigger if exists fencers_assign_public_id on public.fencers;

create trigger fencers_assign_public_id
  before insert or update on public.fencers
  for each row
  execute procedure public.fencers_assign_public_id();

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

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));
  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set name = normalized
  where user_id = auth.uid();

  if not found then
    insert into public.fencers (club_id, name, user_id, role)
    values (null, normalized, auth.uid(), null);
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

  if existing_id is null then
    raise exception 'Profile name is required';
  end if;

  if existing_club_id is not null then
    raise exception 'Already in a club';
  end if;

  insert into public.clubs (name)
  values (club_name)
  returning id into new_club_id;

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set club_id = new_club_id,
      role = 'owner',
      archived_at = null
  where id = existing_id;

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
  target public.fencers%rowtype;
  existing public.fencers%rowtype;
  existing_id uuid;
  lock_a uuid;
  lock_b uuid;
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

  select *
  into existing
  from public.fencers
  where public_id = normalized
    and user_id is not null
  limit 1;

  if existing.id is null then
    raise exception 'Profile not found';
  end if;

  existing_id := existing.id;

  perform pg_advisory_xact_lock(871234001, hashtext(existing.user_id::text));

  if existing_id < p_fencer_id then
    lock_a := existing_id;
    lock_b := p_fencer_id;
  else
    lock_a := p_fencer_id;
    lock_b := existing_id;
  end if;
  perform pg_advisory_xact_lock(871234003, hashtext(lock_a::text));
  perform pg_advisory_xact_lock(871234003, hashtext(lock_b::text));

  select *
  into target
  from public.fencers
  where id = p_fencer_id;

  if target.id is null or target.club_id is null or not public.is_club_member(target.club_id)
     or target.archived_at is not null or target.user_id is not null then
    raise exception 'Fencer not found';
  end if;

  select *
  into existing
  from public.fencers
  where id = existing_id;

  if existing.id is null or existing.user_id is null then
    raise exception 'Profile not found';
  end if;

  perform set_config('fencing.fencer_link', '1', true);

  if existing.club_id is not null then
    if existing.club_id = target.club_id then
      raise exception 'Already on this roster';
    end if;
    raise exception 'Already in a club';
  end if;

  if exists (
    select 1
    from public.fencers
    where club_id = target.club_id
      and archived_at is null
      and id <> target.id
      and lower(trim(name)) = lower(trim(existing.name))
  ) then
    raise exception 'A fencer with this name already exists';
  end if;

  if exists (
    select 1
    from public.matches
    where (blue_fencer_id = target.id and red_fencer_id = existing.id)
       or (blue_fencer_id = existing.id and red_fencer_id = target.id)
  ) then
    raise exception 'Cannot merge: this fencer and that account appear in the same bout';
  end if;

  if exists (
    select 1
    from public.tournament_bouts
    where (blue_fencer_id = target.id and red_fencer_id = existing.id)
       or (blue_fencer_id = existing.id and red_fencer_id = target.id)
  ) then
    raise exception 'Cannot merge: this fencer and that account appear in the same bout';
  end if;

  if exists (
    select 1
    from public.tournament_participants as nick
    join public.tournament_participants as person
      on person.tournament_id = nick.tournament_id
     and person.fencer_id = existing.id
    where nick.fencer_id = target.id
  ) then
    raise exception 'Cannot merge: this fencer and that account are both in the same tournament';
  end if;

  update public.matches
  set blue_fencer_id = existing.id
  where blue_fencer_id = target.id;

  update public.matches
  set red_fencer_id = existing.id
  where red_fencer_id = target.id;

  update public.tournament_bouts
  set blue_fencer_id = existing.id
  where blue_fencer_id = target.id;

  update public.tournament_bouts
  set red_fencer_id = existing.id
  where red_fencer_id = target.id;

  update public.tournament_bouts
  set koth_king_id = existing.id
  where koth_king_id = target.id;

  update public.tournament_participants
  set fencer_id = existing.id
  where fencer_id = target.id;

  delete from public.fencers
  where id = target.id;

  update public.fencers
  set club_id = target.club_id,
      role = 'member',
      archived_at = null
  where id = existing.id;

  return existing.id;
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
  my_club uuid;
  existing public.fencers%rowtype;
  existing_id uuid;
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

  select *
  into existing
  from public.fencers
  where public_id = normalized
    and user_id is not null
  limit 1;

  if existing.id is null then
    raise exception 'Profile not found';
  end if;

  existing_id := existing.id;

  perform pg_advisory_xact_lock(871234001, hashtext(existing.user_id::text));

  select *
  into existing
  from public.fencers
  where id = existing_id;

  if existing.id is null or existing.user_id is null then
    raise exception 'Profile not found';
  end if;

  if existing.club_id is not null then
    raise exception 'Already in a club';
  end if;

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set club_id = my_club,
      role = 'member',
      archived_at = null
  where id = existing.id;

  return existing.id;
end;
$$;

drop function if exists public.lookup_checkin_by_public_id(text, uuid);

create function public.lookup_checkin_by_public_id(p_public_id text, p_club_id uuid)
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
    person.user_id,
    person.name,
    club.name as club_name,
    person.id as fencer_id,
    coalesce(person.club_id = p_club_id and person.archived_at is null, false) as in_host_club
  from public.fencers as person
  left join public.clubs as club on club.id = person.club_id
  where person.public_id = normalized
    and person.user_id is not null;
end;
$$;

revoke all on function public.lookup_checkin_by_public_id(text, uuid) from public;
grant execute on function public.lookup_checkin_by_public_id(text, uuid) to authenticated;

revoke all on function public.fencers_assign_public_id() from public;

drop trigger if exists profiles_assign_public_id on public.profiles;
drop trigger if exists profiles_set_updated_at on public.profiles;
drop function if exists public.profiles_assign_public_id();
drop table if exists public.profiles;
