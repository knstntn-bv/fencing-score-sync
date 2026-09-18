-- A / A2 / B / C / H / J — named accounts vs fencers.
-- SELECT-only. Run as postgres. One result set.

(
  select
    'A_profiles_without_fencers'::text as check_id,
    p.user_id,
    p.public_id,
    p.name,
    p.created_at,
    null::uuid as fencer_id,
    null::uuid as club_id,
    null::text as club_name,
    null::public.club_member_role as role,
    null::timestamptz as archived_at,
    'backfill person row, club_id null'::text as note
  from public.profiles p
  where not exists (
    select 1 from public.fencers f where f.user_id = p.user_id
  )
  order by p.created_at
  limit 200
)
union all
(
  select
    'A2_users_without_profile',
    u.id,
    null,
    coalesce(u.email, u.id::text),
    u.created_at,
    null,
    null,
    null,
    null,
    null,
    'auth only — skip until they save a name'
  from auth.users u
  where not exists (
    select 1 from public.profiles p where p.user_id = u.id
  )
  order by u.created_at
  limit 200
)
union all
(
  select
    'B_linked_without_profile',
    f.user_id,
    null,
    f.name,
    f.created_at,
    f.id,
    f.club_id,
    c.name,
    f.role,
    f.archived_at,
    'fencers.user_id has no profiles row'
  from public.fencers f
  join public.clubs c on c.id = f.club_id
  where f.user_id is not null
    and not exists (
      select 1 from public.profiles p where p.user_id = f.user_id
    )
  order by f.created_at
  limit 200
)
union all
(
  select
    'B2_profile_multiple_fencers',
    f.user_id,
    p.public_id,
    f.name,
    f.created_at,
    f.id,
    f.club_id,
    c.name,
    f.role,
    f.archived_at,
    'same user_id on more than one fencers row'
  from public.fencers f
  join public.clubs c on c.id = f.club_id
  left join public.profiles p on p.user_id = f.user_id
  where f.user_id in (
    select user_id
    from public.fencers
    where user_id is not null
    group by user_id
    having count(*) > 1
  )
  order by f.user_id, f.created_at
  limit 200
)
union all
(
  select
    'C_archived_still_linked',
    f.user_id,
    p.public_id,
    f.name,
    f.archived_at,
    f.id,
    f.club_id,
    c.name,
    f.role,
    f.archived_at,
    'unlink leftover: unique user_id still occupied'
  from public.fencers f
  join public.clubs c on c.id = f.club_id
  left join public.profiles p on p.user_id = f.user_id
  where f.user_id is not null
    and f.archived_at is not null
  order by f.archived_at
  limit 200
)
union all
(
  select
    'H_linked_name_mismatch',
    f.user_id,
    p.public_id,
    f.name || ' / ' || p.name,
    f.updated_at,
    f.id,
    f.club_id,
    c.name,
    f.role,
    f.archived_at,
    'fencers.name vs profiles.name'
  from public.fencers f
  join public.clubs c on c.id = f.club_id
  join public.profiles p on p.user_id = f.user_id
  where f.archived_at is null
    and f.name is distinct from p.name
  order by f.updated_at desc
  limit 200
)
union all
(
  select
    'J_club_without_active_owner',
    null,
    null,
    c.name,
    c.created_at,
    null,
    c.id,
    c.name,
    null,
    null,
    'no active owner on fencers'
  from public.clubs c
  where not exists (
    select 1
    from public.fencers f
    where f.club_id = c.id
      and f.role = 'owner'
      and f.user_id is not null
      and f.archived_at is null
  )
  order by c.created_at
  limit 200
)
order by check_id, created_at;
