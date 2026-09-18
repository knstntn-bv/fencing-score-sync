with
people as (
  select * from public.fencers where user_id is not null
),
nicknames as (
  select * from public.fencers where user_id is null
)
select check_id, kind, n, meaning
from (
  select
    'totals_profiles'::text as check_id,
    'info'::text as kind,
    (select count(*) from public.profiles)::bigint as n,
    'named accounts in profiles'::text as meaning
  union all select 'totals_people', 'info',
    (select count(*) from people),
    'fencers rows with user_id (club or none)'
  union all select 'totals_people_no_club', 'info',
    (select count(*) from people where club_id is null),
    'people with null club_id'
  union all select 'totals_people_in_club', 'info',
    (select count(*) from people where club_id is not null and archived_at is null),
    'people currently on a club roster'
  union all select 'totals_nicknames_active', 'info',
    (select count(*) from nicknames where archived_at is null),
    'active club-only nicknames (no profiles row)'
  union all select 'totals_synced', 'info',
    (
      select count(*)
      from public.profiles as profile
      join people as person on person.user_id = profile.user_id
      where person.public_id = profile.public_id
        and person.name = profile.name
    ),
    'profile and person agree on public_id and name'
  union all select 'A_profile_without_person', 'review',
    (
      select count(*)
      from public.profiles as profile
      where not exists (
        select 1 from people as person where person.user_id = profile.user_id
      )
    ),
    'profile has no fencers row; insert person before drop or data is lost'
  union all select 'A2_users_neither', 'info',
    (
      select count(*)
      from auth.users as usr
      where not exists (
        select 1 from public.profiles as profile where profile.user_id = usr.id
      )
      and not exists (
        select 1 from people as person where person.user_id = usr.id
      )
    ),
    'auth user with no profile and no person (onboarding not finished)'
  union all select 'B_person_without_profile', 'info',
    (
      select count(*)
      from people as person
      where not exists (
        select 1 from public.profiles as profile where profile.user_id = person.user_id
      )
    ),
    'person already lives only on fencers; ok to drop if C is 0'
  union all select 'C_person_without_public_id', 'review',
    (
      select count(*)
      from people as person
      where person.public_id is null
    ),
    'person missing public_id; copy from profile or assign before drop'
  union all select 'D_public_id_mismatch', 'review',
    (
      select count(*)
      from public.profiles as profile
      join people as person on person.user_id = profile.user_id
      where person.public_id is distinct from profile.public_id
    ),
    'same user, different public_id on profiles vs fencers'
  union all select 'E_name_mismatch', 'info',
    (
      select count(*)
      from public.profiles as profile
      join people as person on person.user_id = profile.user_id
      where person.name is distinct from profile.name
    ),
    'same user, different name; fencers.name wins on drop'
  union all select 'F_duplicate_user_id', 'review',
    (
      select count(*)
      from (
        select user_id
        from people
        group by user_id
        having count(*) > 1
      ) as dup
    ),
    'one user_id on more than one fencers row'
  union all select 'I_duplicate_person_public_id', 'review',
    (
      select count(*)
      from (
        select public_id
        from people
        where public_id is not null
        group by public_id
        having count(*) > 1
      ) as dup
    ),
    'one public_id on more than one person row'
) as snapshot;
