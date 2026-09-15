-- A profile may be linked to at most one fencer, across all clubs.
-- Includes archived rows: unlink must clear user_id, or the account cannot join elsewhere.

do $$
begin
  if exists (
    select 1
    from public.fencers
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'a profile is linked to more than one fencer';
  end if;
end;
$$;

drop index public.fencers_club_user_unique;
drop index public.fencers_user_id_idx;

create unique index fencers_user_unique
  on public.fencers (user_id)
  where user_id is not null;
