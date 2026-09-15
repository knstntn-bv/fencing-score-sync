-- Club access is fencers.user_id. Drop club_members and stop dual-write.

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
  from public.fencers
  where user_id = auth.uid()
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

  insert into public.fencers (club_id, name, user_id, role)
  values (new_club_id, profile_name, auth.uid(), 'owner');

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

  if target.id is null or not public.is_club_member(target.club_id) then
    raise exception 'Fencer not found';
  end if;

  if target.archived_at is not null then
    raise exception 'Fencer is archived';
  end if;

  if target.user_id is not null then
    raise exception 'Fencer is already linked';
  end if;

  select user_id, name
  into profile_user, profile_name
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
      name = profile_name
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

  if target.id is null or not public.is_club_member(target.club_id) then
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
  my_club uuid;
  existing_fencer_id uuid;
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
  limit 1;

  if my_club is null then
    raise exception 'Not a club member';
  end if;

  select user_id, name
  into profile_user, profile_name
  from public.profiles
  where public_id = normalized;

  if profile_user is null then
    raise exception 'Profile not found';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(profile_user::text));

  select id
  into existing_fencer_id
  from public.fencers
  where user_id = profile_user
  limit 1;

  if existing_fencer_id is not null then
    raise exception 'Already in a club';
  end if;

  insert into public.fencers (club_id, name, user_id, role)
  values (my_club, profile_name, profile_user, 'member')
  returning id into new_id;

  return new_id;
end;
$$;

drop trigger if exists club_members_protect_last_owner on public.club_members;
drop trigger if exists club_members_cleanup_empty_club on public.club_members;
drop function if exists public.club_members_protect_last_owner();
drop function if exists public.club_members_cleanup_empty_club();
drop table if exists public.club_members;
