-- Person-fencers inventory, step 0. SELECT-only. Schema after #53.
-- Run as postgres in the Supabase SQL Editor (bypasses RLS).
-- One result set: n = 0 on kind = review means that class is clean.

with
linked as (
  select *
  from public.fencers
  where user_id is not null
),
nicknames as (
  select *
  from public.fencers
  where user_id is null
),
guest_kind as (
  select
    p.tournament_id,
    p.fencer_id,
    p.is_guest,
    case
      when exists (
        select 1 from public.fencers f where f.id = p.fencer_id
      ) then 'fencer_row'
      when exists (
        select 1 from public.profiles pr where pr.user_id = p.fencer_id
      ) then 'profile_user'
      else 'neither'
    end as id_kind
  from public.tournament_participants p
)
select
  src.check_id,
  src.kind,
  src.n,
  src.meaning
from (
  select
    'totals_clubs'::text as check_id,
    'info'::text as kind,
    (select count(*) from public.clubs)::bigint as n,
    'clubs'::text as meaning

  union all
  select 'totals_profiles', 'info',
    (select count(*) from public.profiles),
    'named accounts (profiles)'

  union all
  select 'totals_fencers', 'info',
    (select count(*) from public.fencers),
    'all fencers rows (active + archived)'

  union all
  select 'totals_fencers_active', 'info',
    (select count(*) from public.fencers where archived_at is null),
    'active roster + active nicknames + active linked'

  union all
  select 'totals_linked_active', 'info',
    (select count(*) from linked where archived_at is null),
    'active rows with user_id (club access)'

  union all
  select 'totals_nicknames_active', 'info',
    (select count(*) from nicknames where archived_at is null),
    'active club-only nicknames'

  union all
  select 'totals_nicknames_archived', 'info',
    (select count(*) from nicknames where archived_at is not null),
    'archived club-only nicknames (history keepers)'

  union all
  select 'totals_matches', 'info',
    (select count(*) from public.matches),
    'club matches'

  union all
  select 'totals_tournaments', 'info',
    (select count(*) from public.tournaments),
    'tournaments'

  union all
  select 'totals_participants_roster', 'info',
    (
      select count(*)
      from public.tournament_participants
      where is_guest = false
    ),
    'check-ins that claim a club roster id'

  union all
  select 'totals_participants_guest', 'info',
    (
      select count(*)
      from public.tournament_participants
      where is_guest = true
    ),
    'check-ins that claim a guest id (usually profiles.user_id)'

  union all
  select 'totals_bouts', 'info',
    (select count(*) from public.tournament_bouts),
    'tournament_bouts rows'

  union all
  select 'A_profiles_without_fencers', 'review',
    (
      select count(*)
      from public.profiles p
      where not exists (
        select 1 from public.fencers f where f.user_id = p.user_id
      )
    ),
    'named account, no fencers row — backfill person with null club_id'

  union all
  select 'A2_users_without_profile', 'info',
    (
      select count(*)
      from auth.users u
      where not exists (
        select 1 from public.profiles p where p.user_id = u.id
      )
    ),
    'auth only, no name yet — no person row until they save a name'

  union all
  select 'B_linked_without_profile', 'review',
    (
      select count(*)
      from linked f
      where not exists (
        select 1 from public.profiles p where p.user_id = f.user_id
      )
    ),
    'fencers.user_id with no profiles row — repair or unlink before fold'

  union all
  select 'B2_profile_multiple_fencers', 'review',
    (
      select count(*)
      from (
        select user_id
        from public.fencers
        where user_id is not null
        group by user_id
        having count(*) > 1
      ) d
    ),
    'should be 0 (fencers_user_unique)'

  union all
  select 'C_archived_still_linked', 'review',
    (select count(*) from linked where archived_at is not null),
    'archived + user_id — unlink should have cleared user_id; unique slot still taken'

  union all
  select 'E_guest_profile', 'rewrite',
    (
      select count(*)
      from guest_kind
      where is_guest = true
        and id_kind = 'profile_user'
    ),
    'guest fencer_id = profiles.user_id — rewrite to person fencers.id'

  union all
  select 'E_guest_is_fencer', 'review',
    (
      select count(*)
      from guest_kind
      where is_guest = true
        and id_kind = 'fencer_row'
    ),
    'is_guest but id is a fencers.id — policy mismatch'

  union all
  select 'E_guest_neither', 'review',
    (
      select count(*)
      from guest_kind
      where is_guest = true
        and id_kind = 'neither'
    ),
    'guest id is neither profiles.user_id nor fencers.id — orphan'

  union all
  select 'E_roster_missing_fencer', 'review',
    (
      select count(*)
      from public.tournament_participants p
      where p.is_guest = false
        and not exists (
          select 1 from public.fencers f where f.id = p.fencer_id
        )
    ),
    'is_guest = false but fencer_id not in fencers'

  union all
  select 'E_roster_marked_wrong', 'review',
    (
      select count(*)
      from guest_kind
      where is_guest = false
        and id_kind <> 'fencer_row'
    ),
    'is_guest = false but id is not a fencers.id'

  union all
  select 'E_rewrite_collision', 'review',
    (
      select count(*)
      from public.tournament_participants roster
      join public.fencers f
        on f.id = roster.fencer_id
       and f.user_id is not null
      join public.tournament_participants guest
        on guest.tournament_id = roster.tournament_id
       and guest.fencer_id = f.user_id
    ),
    'same tournament has roster fencers.id and guest profiles.user_id for one account — PK collision on rewrite'

  union all
  select 'F_same_club_name', 'review',
    (
      select count(*)
      from nicknames n
      join public.fencers linked_row
        on linked_row.club_id = n.club_id
       and linked_row.user_id is not null
       and linked_row.archived_at is null
       and n.archived_at is null
       and lower(trim(linked_row.name)) = lower(trim(n.name))
    ),
    'active nickname shares a club name with an active linked fencer — eyeball merge'

  union all
  select 'F_name_like_profile', 'info',
    (
      select count(distinct n.id)
      from nicknames n
      join public.profiles p
        on lower(trim(p.name)) = lower(trim(n.name))
      where n.archived_at is null
    ),
    'active nickname name matches some profile (coincidence possible)'

  union all
  select 'F_merge_same_match', 'review',
    (
      select count(*)
      from public.matches m
      join public.fencers blue on blue.id = m.blue_fencer_id
      join public.fencers red on red.id = m.red_fencer_id
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
    ),
    'match between same-club nickname and linked fencer with the same name — merge would violate distinct fencers'

  union all
  select 'F_merge_same_bout', 'review',
    (
      select count(*)
      from public.tournament_bouts b
      join public.fencers blue on blue.id = b.blue_fencer_id
      join public.fencers red on red.id = b.red_fencer_id
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
    ),
    'bout between same-club nickname and linked fencer with the same name — merge would collapse both sides'

  union all
  select 'G_match_club_mismatch', 'review',
    (
      select count(*)
      from public.matches m
      where exists (
          select 1
          from public.fencers f
          where f.id in (m.blue_fencer_id, m.red_fencer_id)
            and f.club_id <> m.club_id
        )
    ),
    'match.club_id differs from blue/red fencers.club_id'

  union all
  select 'G_bout_id_not_participant', 'review',
    (
      select count(*)
      from public.tournament_bouts b
      where (
          b.blue_fencer_id is not null
          and not exists (
            select 1
            from public.tournament_participants p
            where p.tournament_id = b.tournament_id
              and p.fencer_id = b.blue_fencer_id
          )
        )
        or (
          b.red_fencer_id is not null
          and not exists (
            select 1
            from public.tournament_participants p
            where p.tournament_id = b.tournament_id
              and p.fencer_id = b.red_fencer_id
          )
        )
        or (
          b.koth_king_id is not null
          and not exists (
            select 1
            from public.tournament_participants p
            where p.tournament_id = b.tournament_id
              and p.fencer_id = b.koth_king_id
          )
        )
    ),
    'bout blue/red/koth id not on tournament_participants'

  union all
  select 'H_linked_name_mismatch', 'review',
    (
      select count(*)
      from linked f
      join public.profiles p on p.user_id = f.user_id
      where f.archived_at is null
        and f.name is distinct from p.name
    ),
    'active linked fencers.name <> profiles.name'

  union all
  select 'J_club_without_active_owner', 'review',
    (
      select count(*)
      from public.clubs c
      where not exists (
        select 1
        from public.fencers f
        where f.club_id = c.id
          and f.role = 'owner'
          and f.user_id is not null
          and f.archived_at is null
      )
    ),
    'club has no active owner'

  union all
  select 'public_id_max', 'info',
    (
      select coalesce(max(public_id::bigint), 0)
      from public.profiles
    ),
    'max profiles.public_id (person rows will keep these digits)'
) src
order by
  case src.kind
    when 'review' then 0
    when 'rewrite' then 1
    else 2
  end,
  src.check_id;
