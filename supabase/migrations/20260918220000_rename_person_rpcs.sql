-- Cosmetic rename: RPCs and messages no longer say "profile".
-- Old names are removed (no wrappers). Ship with the frontend.

alter function public.save_own_profile(text) rename to save_own_name;
alter function public.link_fencer_to_profile(uuid, text) rename to merge_nickname_into_person;
alter function public.unlink_and_archive(uuid) rename to detach_from_club;

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
      raise exception 'linked fencer name can only be changed from the account';
    end if;
    if new.archived_at is distinct from old.archived_at then
      raise exception 'linked fencer must be unlinked to archive';
    end if;
  end if;

  return new;
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
    raise exception 'Name is required';
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

create or replace function public.merge_nickname_into_person(p_fencer_id uuid, p_public_id text)
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
    raise exception 'Account not found';
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
    raise exception 'Account not found';
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

create or replace function public.leave_own_club()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select id
  into target_id
  from public.fencers
  where user_id = auth.uid()
    and club_id is not null
    and archived_at is null
  limit 1;

  if target_id is null then
    raise exception 'Not a club member';
  end if;

  return public.detach_from_club(target_id);
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
    raise exception 'Account not found';
  end if;

  existing_id := existing.id;

  perform pg_advisory_xact_lock(871234001, hashtext(existing.user_id::text));

  select *
  into existing
  from public.fencers
  where id = existing_id;

  if existing.id is null or existing.user_id is null then
    raise exception 'Account not found';
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

revoke all on function public.save_own_name(text) from public;
revoke all on function public.merge_nickname_into_person(uuid, text) from public;
revoke all on function public.detach_from_club(uuid) from public;
grant execute on function public.save_own_name(text) to authenticated;
grant execute on function public.merge_nickname_into_person(uuid, text) to authenticated;
grant execute on function public.detach_from_club(uuid) to authenticated;
