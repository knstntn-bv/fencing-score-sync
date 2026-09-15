-- Add a profile to the caller's club roster in one step (insert + link).
-- Clients cannot INSERT fencers.user_id; this RPC is security definer.

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

  insert into public.club_members (club_id, user_id, role)
  values (my_club, profile_user, 'member')
  on conflict (club_id, user_id) do nothing;

  return new_id;
end;
$$;

revoke all on function public.add_linked_fencer(text) from public;
grant execute on function public.add_linked_fencer(text) to authenticated;
