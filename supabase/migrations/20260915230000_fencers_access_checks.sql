-- Access checks read active linked fencers. club_members is still written.
-- Clients cannot change user_id or role on UPDATE (set fencing.fencer_link = 1 in RPCs later).

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fencers
    where club_id = p_club_id
      and user_id = auth.uid()
      and archived_at is null
  );
$$;

create or replace function public.is_club_owner(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fencers
    where club_id = p_club_id
      and user_id = auth.uid()
      and role = 'owner'
      and archived_at is null
  );
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
  club uuid;
begin
  if tg_op = 'DELETE' then
    if current_setting('fencing.deleting_club_id', true) = old.club_id::text then
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

  if current_setting('fencing.deleting_club_id', true) = new.club_id::text then
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

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, auth.uid(), 'owner');

  insert into public.fencers (club_id, name, user_id, role)
  values (new_club_id, profile_name, auth.uid(), 'owner');

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

create or replace function public.lookup_checkin_by_public_id(p_public_id text, p_club_id uuid)
returns table (
  user_id uuid,
  name text,
  club_name text,
  fencer_id uuid
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
      limit 1
    ) as club_name,
    (
      select fencer.id
      from public.fencers as fencer
      where fencer.user_id = profile.user_id
        and fencer.club_id = p_club_id
        and fencer.archived_at is null
      limit 1
    ) as fencer_id
  from public.profiles as profile
  where profile.public_id = normalized;
end;
$$;

revoke all on function public.fencers_freeze_link() from public;
revoke all on function public.fencers_protect_last_owner() from public;
