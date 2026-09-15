-- Club members can resolve another account's public ID for tournament check-in.
-- If that account has an active roster row in the given club, return its fencer_id
-- so check-in by ID and from the roster use the same participant.

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
      from public.club_members as membership
      join public.clubs as club on club.id = membership.club_id
      where membership.user_id = profile.user_id
      order by (membership.role = 'owner') desc, membership.created_at asc
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

revoke all on function public.lookup_checkin_by_public_id(text, uuid) from public;
grant execute on function public.lookup_checkin_by_public_id(text, uuid) to authenticated;
