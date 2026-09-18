(
  select
    'F_same_club_name'::text as check_id,
    n.club_id,
    c.name as club_name,
    n.id as nickname_id,
    n.name as nickname_name,
    n.archived_at as nickname_archived_at,
    linked.id as linked_fencer_id,
    linked.user_id as account_user_id,
    p.public_id as account_public_id,
    p.name as account_name,
    null::uuid as match_or_bout_id,
    'active nickname shares club name with linked fencer'::text as note
  from public.fencers n
  join public.clubs c on c.id = n.club_id
  join public.fencers linked
    on linked.club_id = n.club_id
   and linked.user_id is not null
   and linked.archived_at is null
   and n.user_id is null
   and n.archived_at is null
   and lower(trim(linked.name)) = lower(trim(n.name))
  left join public.profiles p on p.user_id = linked.user_id
  order by c.name, n.name
  limit 200
)
union all
(
  select
    'F_name_like_profile',
    n.club_id,
    c.name,
    n.id,
    n.name,
    n.archived_at,
    null,
    p.user_id,
    p.public_id,
    p.name,
    null,
    'nickname name matches a profile (any club); coincidence possible'
  from public.fencers n
  join public.clubs c on c.id = n.club_id
  join public.profiles p
    on lower(trim(p.name)) = lower(trim(n.name))
  where n.user_id is null
    and n.archived_at is null
  order by c.name, n.name, p.public_id
  limit 200
)
union all
(
  select
    'F_merge_same_match',
    m.club_id,
    c.name,
    case when blue.user_id is null then blue.id else red.id end,
    case when blue.user_id is null then blue.name else red.name end,
    case when blue.user_id is null then blue.archived_at else red.archived_at end,
    case when blue.user_id is not null then blue.id else red.id end,
    case when blue.user_id is not null then blue.user_id else red.user_id end,
    p.public_id,
    p.name,
    m.id,
    'match would have the same person on both sides after merge'
  from public.matches m
  join public.clubs c on c.id = m.club_id
  join public.fencers blue on blue.id = m.blue_fencer_id
  join public.fencers red on red.id = m.red_fencer_id
  left join public.profiles p
    on p.user_id = coalesce(blue.user_id, red.user_id)
  where (
      blue.user_id is null
      and red.user_id is not null
      and lower(trim(blue.name)) = lower(trim(red.name))
      and blue.club_id = red.club_id
    )
    or (
      red.user_id is null
      and blue.user_id is not null
      and lower(trim(blue.name)) = lower(trim(red.name))
      and blue.club_id = red.club_id
    )
  order by m.finished_at desc
  limit 200
)
union all
(
  select
    'F_merge_same_bout',
    b.club_id,
    c.name,
    case when blue.user_id is null then blue.id else red.id end,
    case when blue.user_id is null then blue.name else red.name end,
    case when blue.user_id is null then blue.archived_at else red.archived_at end,
    case when blue.user_id is not null then blue.id else red.id end,
    case when blue.user_id is not null then blue.user_id else red.user_id end,
    p.public_id,
    p.name,
    b.id,
    'bout would have the same person on both sides after merge'
  from public.tournament_bouts b
  join public.clubs c on c.id = b.club_id
  join public.fencers blue on blue.id = b.blue_fencer_id
  join public.fencers red on red.id = b.red_fencer_id
  left join public.profiles p
    on p.user_id = coalesce(blue.user_id, red.user_id)
  where b.blue_fencer_id is not null
    and b.red_fencer_id is not null
    and (
      (
        blue.user_id is null
        and red.user_id is not null
        and lower(trim(blue.name)) = lower(trim(red.name))
        and blue.club_id = red.club_id
      )
      or (
        red.user_id is null
        and blue.user_id is not null
        and lower(trim(blue.name)) = lower(trim(red.name))
        and blue.club_id = red.club_id
      )
    )
  order by b.created_at desc
  limit 200
)
order by check_id, club_name, nickname_name;
