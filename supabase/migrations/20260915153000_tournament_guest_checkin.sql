-- Guests can check in without a roster row. Affiliation is a display string.

alter table public.tournament_participants
  add column name text,
  add column club_name text,
  add column is_guest boolean not null default false;

update public.tournament_participants as participant
set
  name = fencer.name,
  club_name = club.name
from public.fencers as fencer, public.clubs as club
where participant.fencer_id = fencer.id
  and participant.club_id = club.id;

alter table public.tournament_participants
  alter column name set not null;

alter table public.tournament_participants
  add constraint tournament_participants_name_not_blank
    check (char_length(trim(name)) > 0);

alter table public.tournament_participants
  add constraint tournament_participants_club_name_not_blank
    check (club_name is null or char_length(trim(club_name)) > 0);

alter table public.tournament_participants
  drop constraint tournament_participants_fencer_id_fkey;

alter table public.tournament_bouts
  drop constraint tournament_bouts_blue_fencer_id_fkey,
  drop constraint tournament_bouts_red_fencer_id_fkey,
  drop constraint tournament_bouts_koth_king_id_fkey;

drop policy "tournament_participants_insert_member" on public.tournament_participants;
drop policy "tournament_participants_update_member" on public.tournament_participants;
drop policy "tournament_bouts_insert_member" on public.tournament_bouts;
drop policy "tournament_bouts_update_member" on public.tournament_bouts;

create policy "tournament_participants_insert_member"
  on public.tournament_participants for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_participants.club_id
    )
    and (
      (
        is_guest = false
        and exists (
          select 1 from public.fencers f
          where f.id = fencer_id and f.club_id = tournament_participants.club_id
        )
      )
      or (
        is_guest = true
        and not exists (
          select 1 from public.fencers f
          where f.id = fencer_id
        )
      )
    )
  );

create policy "tournament_participants_update_member"
  on public.tournament_participants for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_participants.club_id
    )
    and (
      (
        is_guest = false
        and exists (
          select 1 from public.fencers f
          where f.id = fencer_id and f.club_id = tournament_participants.club_id
        )
      )
      or (
        is_guest = true
        and not exists (
          select 1 from public.fencers f
          where f.id = fencer_id
        )
      )
    )
  );

create policy "tournament_bouts_insert_member"
  on public.tournament_bouts for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_bouts.club_id
    )
    and (
      blue_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = blue_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = red_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
  );

create policy "tournament_bouts_update_member"
  on public.tournament_bouts for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_bouts.club_id
    )
    and (
      blue_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = blue_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.tournament_participants p
        where p.tournament_id = tournament_bouts.tournament_id
          and p.fencer_id = red_fencer_id
          and p.club_id = tournament_bouts.club_id
      )
    )
  );
