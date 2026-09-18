-- G — history FKs: matches and tournament_bouts vs current fencers / participants.
-- SELECT-only. Run as postgres. One result set.
-- matches.blue/red_fencer_id reference fencers.id (real FK).
-- tournament_bouts ids are not FKs to fencers; they must match tournament_participants.

(
  select
    'G_match_club_mismatch'::text as check_id,
    m.id as history_id,
    m.club_id as history_club_id,
    mc.name as history_club_name,
    f.id as fencer_id,
    f.club_id as fencer_club_id,
    fc.name as fencer_club_name,
    f.name as fencer_name,
    f.user_id,
    f.archived_at,
    case
      when f.id = m.blue_fencer_id then 'blue'
      else 'red'
    end as side,
    m.finished_at as at
  from public.matches m
  join public.clubs mc on mc.id = m.club_id
  join public.fencers f
    on f.id in (m.blue_fencer_id, m.red_fencer_id)
   and f.club_id <> m.club_id
  join public.clubs fc on fc.id = f.club_id
  order by m.finished_at desc
  limit 200
)
union all
(
  select
    'G_bout_id_not_participant',
    b.id,
    b.club_id,
    c.name,
    missing.fencer_id,
    null,
    null,
    coalesce(missing.snapshot_name, missing.fencer_id::text),
    null,
    null,
    missing.side,
    coalesce(b.finished_at, b.created_at)
  from public.tournament_bouts b
  join public.clubs c on c.id = b.club_id
  join lateral (
    select b.blue_fencer_id as fencer_id, 'blue'::text as side, b.blue_name as snapshot_name
    where b.blue_fencer_id is not null
      and not exists (
        select 1
        from public.tournament_participants p
        where p.tournament_id = b.tournament_id
          and p.fencer_id = b.blue_fencer_id
      )
    union all
    select b.red_fencer_id, 'red', b.red_name
    where b.red_fencer_id is not null
      and not exists (
        select 1
        from public.tournament_participants p
        where p.tournament_id = b.tournament_id
          and p.fencer_id = b.red_fencer_id
      )
    union all
    select b.koth_king_id, 'koth_king', null
    where b.koth_king_id is not null
      and not exists (
        select 1
        from public.tournament_participants p
        where p.tournament_id = b.tournament_id
          and p.fencer_id = b.koth_king_id
      )
  ) missing on true
  order by coalesce(b.finished_at, b.created_at) desc
  limit 200
)
union all
(
  select
    'G_match_uses_nickname',
    m.id,
    m.club_id,
    c.name,
    f.id,
    f.club_id,
    c.name,
    f.name,
    f.user_id,
    f.archived_at,
    case
      when f.id = m.blue_fencer_id then 'blue'
      else 'red'
    end,
    m.finished_at
  from public.matches m
  join public.clubs c on c.id = m.club_id
  join public.fencers f
    on f.id in (m.blue_fencer_id, m.red_fencer_id)
   and f.user_id is null
  order by m.finished_at desc
  limit 200
)
union all
(
  select
    'G_match_uses_archived',
    m.id,
    m.club_id,
    c.name,
    f.id,
    f.club_id,
    c.name,
    f.name,
    f.user_id,
    f.archived_at,
    case
      when f.id = m.blue_fencer_id then 'blue'
      else 'red'
    end,
    m.finished_at
  from public.matches m
  join public.clubs c on c.id = m.club_id
  join public.fencers f
    on f.id in (m.blue_fencer_id, m.red_fencer_id)
   and f.archived_at is not null
  order by m.finished_at desc
  limit 200
)
order by check_id, at desc;
