-- E — tournament_participants.fencer_id: roster fencers.id vs guest profiles.user_id.
-- SELECT-only. Run as postgres. One result set.
-- Add-by-ID without a club stores auth.users.id (profiles.user_id) and is_guest = true.

select
  p.tournament_id,
  t.name as tournament_name,
  t.status as tournament_status,
  p.club_id as host_club_id,
  host.name as host_club_name,
  p.fencer_id,
  p.name as participant_name,
  p.club_name as participant_club_name,
  p.is_guest,
  case
    when f.id is not null then 'fencer_row'
    when pr.user_id is not null then 'profile_user'
    else 'neither'
  end as id_kind,
  f.user_id as fencer_user_id,
  f.archived_at as fencer_archived_at,
  pr.public_id,
  case
    when p.is_guest
      and pr.user_id is not null
      and exists (
        select 1
        from public.tournament_participants roster
        join public.fencers linked
          on linked.id = roster.fencer_id
         and linked.user_id = p.fencer_id
        where roster.tournament_id = p.tournament_id
      )
      then 'rewrite_collision'
    when p.is_guest and pr.user_id is not null then 'rewrite_to_person_fencer'
    when p.is_guest and f.id is not null then 'guest_flag_mismatch'
    when p.is_guest then 'orphan_guest'
    when not p.is_guest and f.id is null then 'roster_missing_fencer'
    else 'ok_roster'
  end as action
from public.tournament_participants p
join public.tournaments t on t.id = p.tournament_id
join public.clubs host on host.id = p.club_id
left join public.fencers f on f.id = p.fencer_id
left join public.profiles pr on pr.user_id = p.fencer_id
order by
  case
    when p.is_guest
      and pr.user_id is not null
      and exists (
        select 1
        from public.tournament_participants roster
        join public.fencers linked
          on linked.id = roster.fencer_id
         and linked.user_id = p.fencer_id
        where roster.tournament_id = p.tournament_id
      )
      then 0
    when p.is_guest and f.id is not null then 1
    when p.is_guest and pr.user_id is null then 2
    when not p.is_guest and f.id is null then 3
    when p.is_guest then 4
    else 5
  end,
  t.created_at,
  p.name;
