-- Link/unlink RPCs (bypass fencers_freeze_link via fencing.fencer_link = 1).
-- Linked roster names can only change through save_own_profile.
-- Archive of a linked row must go through unlink_and_archive.

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

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set name = normalized
  where user_id = auth.uid()
    and archived_at is null;

  return normalized;
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

  insert into public.club_members (club_id, user_id, role)
  values (target.club_id, profile_user, 'member')
  on conflict (club_id, user_id) do nothing;

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

  delete from public.club_members
  where club_id = target.club_id
    and user_id = target.user_id;

  return p_fencer_id;
end;
$$;

-- Archived linked rows would block that account from joining another club.
do $$
begin
  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set user_id = null,
      role = null
  where user_id is not null
    and archived_at is not null;
end;
$$;

revoke all on function public.link_fencer_to_profile(uuid, text) from public;
revoke all on function public.unlink_and_archive(uuid) from public;
grant execute on function public.link_fencer_to_profile(uuid, text) to authenticated;
grant execute on function public.unlink_and_archive(uuid) to authenticated;
