(
  select
    'A_profile_without_person'::text as check_id,
    profile.user_id,
    usr.email,
    profile.public_id as profile_public_id,
    null::text as fencer_public_id,
    profile.name as profile_name,
    null::text as fencer_name,
    null::uuid as fencer_id,
    null::uuid as club_id,
    null::text as club_name,
    null::text as role,
    'no fencers row for this profile'::text as note
  from public.profiles as profile
  left join auth.users as usr on usr.id = profile.user_id
  where not exists (
    select 1 from public.fencers as person
    where person.user_id = profile.user_id
  )
  order by profile.created_at
  limit 200
)
union all
(
  select
    'B_person_without_profile',
    person.user_id,
    usr.email,
    null,
    person.public_id,
    null,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'already only on fencers'
  from public.fencers as person
  left join public.clubs as club on club.id = person.club_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id is not null
    and not exists (
      select 1 from public.profiles as profile
      where profile.user_id = person.user_id
    )
  order by person.created_at
  limit 200
)
union all
(
  select
    'C_person_without_public_id',
    person.user_id,
    usr.email,
    profile.public_id,
    person.public_id,
    profile.name,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'copy profiles.public_id onto fencers or assign a new one'
  from public.fencers as person
  left join public.clubs as club on club.id = person.club_id
  left join public.profiles as profile on profile.user_id = person.user_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id is not null
    and person.public_id is null
  order by person.created_at
  limit 200
)
union all
(
  select
    'D_public_id_mismatch',
    person.user_id,
    usr.email,
    profile.public_id,
    person.public_id,
    profile.name,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'profiles.public_id vs fencers.public_id'
  from public.fencers as person
  join public.profiles as profile on profile.user_id = person.user_id
  left join public.clubs as club on club.id = person.club_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id is not null
    and person.public_id is distinct from profile.public_id
  order by person.updated_at desc
  limit 200
)
union all
(
  select
    'E_name_mismatch',
    person.user_id,
    usr.email,
    profile.public_id,
    person.public_id,
    profile.name,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'fencers.name wins on drop'
  from public.fencers as person
  join public.profiles as profile on profile.user_id = person.user_id
  left join public.clubs as club on club.id = person.club_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id is not null
    and person.name is distinct from profile.name
  order by person.updated_at desc
  limit 200
)
union all
(
  select
    'F_duplicate_user_id',
    person.user_id,
    usr.email,
    profile.public_id,
    person.public_id,
    profile.name,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'same user_id on more than one fencers row'
  from public.fencers as person
  left join public.clubs as club on club.id = person.club_id
  left join public.profiles as profile on profile.user_id = person.user_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id in (
    select user_id
    from public.fencers
    where user_id is not null
    group by user_id
    having count(*) > 1
  )
  order by person.user_id, person.created_at
  limit 200
)
union all
(
  select
    'I_duplicate_person_public_id',
    person.user_id,
    usr.email,
    profile.public_id,
    person.public_id,
    profile.name,
    person.name,
    person.id,
    person.club_id,
    club.name,
    person.role::text,
    'same public_id on more than one person row'
  from public.fencers as person
  left join public.clubs as club on club.id = person.club_id
  left join public.profiles as profile on profile.user_id = person.user_id
  left join auth.users as usr on usr.id = person.user_id
  where person.user_id is not null
    and person.public_id in (
      select public_id
      from public.fencers
      where user_id is not null
        and public_id is not null
      group by public_id
      having count(*) > 1
    )
  order by person.public_id, person.created_at
  limit 200
)
order by check_id, fencer_id nulls first;
