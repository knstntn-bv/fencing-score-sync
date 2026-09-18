-- Tournament Add-by-ID guests store the permanent fencers.id, not auth.users.id.
-- Typed-name guests keep a random uuid that is not a fencers row.

create or replace function public.tournament_participant_fencer_ok(
  p_fencer_id uuid,
  p_club_id uuid,
  p_is_guest boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_is_guest then
    return
      not exists (
        select 1 from public.fencers as fencer where fencer.id = p_fencer_id
      )
      or exists (
        select 1
        from public.fencers as fencer
        where fencer.id = p_fencer_id
          and fencer.user_id is not null
          and fencer.archived_at is null
          and fencer.club_id is distinct from p_club_id
      );
  end if;

  return exists (
    select 1
    from public.fencers as fencer
    where fencer.id = p_fencer_id
      and fencer.club_id = p_club_id
  );
end;
$$;

revoke all on function public.tournament_participant_fencer_ok(uuid, uuid, boolean) from public;
grant execute on function public.tournament_participant_fencer_ok(uuid, uuid, boolean) to authenticated;

drop policy "tournament_participants_insert_member" on public.tournament_participants;
drop policy "tournament_participants_update_member" on public.tournament_participants;

create policy "tournament_participants_insert_member"
  on public.tournament_participants for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments as tournament
      where tournament.id = tournament_id
        and tournament.club_id = tournament_participants.club_id
    )
    and public.tournament_participant_fencer_ok(fencer_id, club_id, is_guest)
  );

create policy "tournament_participants_update_member"
  on public.tournament_participants for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments as tournament
      where tournament.id = tournament_id
        and tournament.club_id = tournament_participants.club_id
    )
    and public.tournament_participant_fencer_ok(fencer_id, club_id, is_guest)
  );

do $rewrite$
declare
  collisions integer;
begin
  select count(*)
  into collisions
  from public.tournament_participants as guest
  join public.fencers as person
    on person.user_id = guest.fencer_id
  join public.tournament_participants as roster
    on roster.tournament_id = guest.tournament_id
   and roster.fencer_id = person.id
  where guest.is_guest;

  if collisions > 0 then
    raise exception 'guest rewrite collision: % tournament(s)', collisions;
  end if;

  update public.tournament_bouts as bout
  set blue_fencer_id = person.id
  from public.tournament_participants as guest
  join public.fencers as person
    on person.user_id = guest.fencer_id
  where guest.is_guest
    and bout.tournament_id = guest.tournament_id
    and bout.blue_fencer_id = guest.fencer_id;

  update public.tournament_bouts as bout
  set red_fencer_id = person.id
  from public.tournament_participants as guest
  join public.fencers as person
    on person.user_id = guest.fencer_id
  where guest.is_guest
    and bout.tournament_id = guest.tournament_id
    and bout.red_fencer_id = guest.fencer_id;

  update public.tournament_bouts as bout
  set koth_king_id = person.id
  from public.tournament_participants as guest
  join public.fencers as person
    on person.user_id = guest.fencer_id
  where guest.is_guest
    and bout.tournament_id = guest.tournament_id
    and bout.koth_king_id = guest.fencer_id;

  update public.tournament_participants as guest
  set fencer_id = person.id
  from public.fencers as person
  where guest.is_guest
    and person.user_id = guest.fencer_id;
end;
$rewrite$;

drop function public.lookup_checkin_by_public_id(text, uuid);

create function public.lookup_checkin_by_public_id(p_public_id text, p_club_id uuid)
returns table (
  user_id uuid,
  name text,
  club_name text,
  fencer_id uuid,
  in_host_club boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_club_id is null or not public.is_club_member(p_club_id) then
    raise exception 'Not a club member';
  end if;

  normalized := nullif(trim(p_public_id), '');
  if normalized is null or normalized !~ '^[0-9]+$' then
    raise exception 'ID is required';
  end if;

  return query
  select
    profile.user_id,
    profile.name,
    (
      select club.name
      from public.fencers as linked
      join public.clubs as club on club.id = linked.club_id
      where linked.user_id = profile.user_id
        and linked.archived_at is null
        and linked.club_id is not null
      limit 1
    ) as club_name,
    (
      select person.id
      from public.fencers as person
      where person.user_id = profile.user_id
      limit 1
    ) as fencer_id,
    exists (
      select 1
      from public.fencers as hosted
      where hosted.user_id = profile.user_id
        and hosted.club_id = p_club_id
        and hosted.archived_at is null
    ) as in_host_club
  from public.profiles as profile
  where profile.public_id = normalized;
end;
$$;

revoke all on function public.lookup_checkin_by_public_id(text, uuid) from public;
grant execute on function public.lookup_checkin_by_public_id(text, uuid) to authenticated;
