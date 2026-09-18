select
  f.id as fencer_id,
  f.club_id,
  c.name as club_name,
  f.name,
  f.archived_at,
  f.created_at,
  (
    select count(*)
    from public.matches m
    where m.blue_fencer_id = f.id
       or m.red_fencer_id = f.id
  ) as match_count,
  (
    select count(*)
    from public.tournament_participants p
    where p.fencer_id = f.id
  ) as tournament_checkins,
  (
    select count(*)
    from public.tournament_bouts b
    where b.blue_fencer_id = f.id
       or b.red_fencer_id = f.id
       or b.koth_king_id = f.id
  ) as bout_refs,
  exists (
    select 1
    from public.profiles p
    where lower(trim(p.name)) = lower(trim(f.name))
  ) as name_matches_a_profile
from public.fencers f
join public.clubs c on c.id = f.club_id
where f.user_id is null
order by
  f.archived_at nulls first,
  c.name,
  f.name;
