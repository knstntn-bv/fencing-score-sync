-- Club role on fencers. club_members stays until a later step.
-- Members without a linked roster row get a new fencer (name from profiles).
-- Existing unlinked roster names are left unchanged.

do $$
begin
  if exists (
    select 1
    from public.club_members as membership
    where not exists (
      select 1
      from public.profiles as profile
      where profile.user_id = membership.user_id
    )
  ) then
    raise exception 'club_members without profiles; create profiles first';
  end if;

  if exists (
    select 1
    from public.club_members as membership
    join public.profiles as profile on profile.user_id = membership.user_id
    join public.fencers as fencer
      on fencer.club_id = membership.club_id
     and fencer.archived_at is null
     and lower(trim(fencer.name)) = lower(trim(profile.name))
    where not exists (
      select 1
      from public.fencers as linked
      where linked.club_id = membership.club_id
        and linked.user_id = membership.user_id
    )
  ) then
    raise exception 'active fencer name collides with a member profile; link by hand';
  end if;
end;
$$;

alter table public.fencers
  add column role public.club_member_role;

insert into public.fencers (club_id, name, user_id, role)
select
  membership.club_id,
  profile.name,
  membership.user_id,
  membership.role
from public.club_members as membership
join public.profiles as profile on profile.user_id = membership.user_id
where not exists (
  select 1
  from public.fencers as fencer
  where fencer.club_id = membership.club_id
    and fencer.user_id = membership.user_id
);

update public.fencers as fencer
set role = membership.role
from public.club_members as membership
where fencer.club_id = membership.club_id
  and fencer.user_id = membership.user_id
  and fencer.role is distinct from membership.role;

alter table public.fencers
  add constraint fencers_role_matches_user
  check ((user_id is null) = (role is null));

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

  insert into public.fencers (club_id, name, user_id, role)
  values (new_club_id, profile_name, auth.uid(), 'owner');

  return new_club_id;
end;
$$;
