-- Linking a nickname to an account merges into the person fencers.id:
-- rewrite bout/tournament ids, attach club+role on the person row, delete
-- the nickname. Irreversible. If the account has no person row yet, the
-- nickname keeps its id (stamp user_id onto it).

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
  existing public.fencers%rowtype;
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

  if existing.id is not null then
    if existing.id < p_fencer_id then
      lock_a := existing.id;
      lock_b := p_fencer_id;
    else
      lock_a := p_fencer_id;
      lock_b := existing.id;
    end if;
    perform pg_advisory_xact_lock(871234003, hashtext(lock_a::text));
    perform pg_advisory_xact_lock(871234003, hashtext(lock_b::text));
  else
    perform pg_advisory_xact_lock(871234003, hashtext(p_fencer_id::text));
  end if;

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
  where user_id = profile_user
  limit 1;

  perform set_config('fencing.fencer_link', '1', true);

  if existing.id is null then
    update public.fencers
    set user_id = profile_user,
        role = 'member',
        name = profile_name,
        public_id = profile_public_id
    where id = p_fencer_id;

    return p_fencer_id;
  end if;

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
      and lower(trim(name)) = lower(trim(profile_name))
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
      name = profile_name,
      public_id = coalesce(public_id, profile_public_id),
      archived_at = null
  where id = existing.id;

  return existing.id;
end;
$$;
