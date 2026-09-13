-- Tournaments: club events with check-in, brackets, and bouts that are not club matches.

create type public.tournament_status as enum ('setup', 'live', 'done');
create type public.tournament_format as enum (
  'round_robin',
  'playoff',
  'groups_playoff',
  'swiss',
  'king_of_hill'
);
create type public.tournament_points_scheme as enum ('half', 'binary', 'football');
create type public.tournament_bout_stage as enum ('rr', 'group', 'swiss', 'playoff', 'koth');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null,
  status public.tournament_status not null default 'setup',
  format public.tournament_format,
  points_scheme public.tournament_points_scheme,
  time_limit_sec integer not null,
  points_limit integer not null,
  group_count integer,
  advancers_per_group integer,
  swiss_rounds integer,
  koth_exit_limit integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  live_at timestamptz,
  finished_at timestamptz,
  constraint tournaments_name_not_blank check (char_length(trim(name)) > 0),
  constraint tournaments_time_limit_sec_check
    check (time_limit_sec >= 60 and time_limit_sec <= 300),
  constraint tournaments_points_limit_check
    check (points_limit >= 5 and points_limit <= 20),
  constraint tournaments_koth_exit_limit_check check (koth_exit_limit >= 1)
);

create index tournaments_club_created_at_idx
  on public.tournaments (club_id, created_at desc);

create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row
  execute procedure public.set_updated_at();

create table public.tournament_participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  fencer_id uuid not null references public.fencers (id),
  club_id uuid not null references public.clubs (id) on delete cascade,
  group_no integer,
  primary key (tournament_id, fencer_id)
);

create index tournament_participants_club_id_idx
  on public.tournament_participants (club_id);

create table public.tournament_bouts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,

  stage public.tournament_bout_stage not null,
  group_no integer,
  round_code text,
  sort_order integer not null,

  blue_fencer_id uuid references public.fencers (id),
  red_fencer_id uuid references public.fencers (id),
  blue_placeholder text,
  red_placeholder text,

  winner_next_id uuid references public.tournament_bouts (id) on delete set null,
  loser_next_id uuid references public.tournament_bouts (id) on delete set null,

  blue_name text,
  red_name text,
  blue_score integer,
  red_score integer,
  blue_result text,
  red_result text,

  time_limit_sec integer,
  points_limit integer,
  remaining_sec integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),

  koth_king_id uuid references public.fencers (id),

  constraint tournament_bouts_blue_result_check
    check (blue_result is null or blue_result in ('win', 'lose', 'draw')),
  constraint tournament_bouts_red_result_check
    check (red_result is null or red_result in ('win', 'lose', 'draw')),
  constraint tournament_bouts_finished_complete check (
    finished_at is null
    or (
      blue_fencer_id is not null
      and red_fencer_id is not null
      and blue_fencer_id <> red_fencer_id
      and blue_name is not null
      and char_length(trim(blue_name)) > 0
      and red_name is not null
      and char_length(trim(red_name)) > 0
      and blue_score is not null
      and blue_score >= 0
      and red_score is not null
      and red_score >= 0
      and blue_result in ('win', 'lose', 'draw')
      and red_result in ('win', 'lose', 'draw')
      and (
        (blue_score > red_score and blue_result = 'win' and red_result = 'lose')
        or (red_score > blue_score and blue_result = 'lose' and red_result = 'win')
        or (blue_score = red_score and blue_result = 'draw' and red_result = 'draw')
      )
      and time_limit_sec is not null
      and time_limit_sec > 0
      and points_limit is not null
      and points_limit > 0
      and remaining_sec is not null
      and remaining_sec >= 0
      and started_at is not null
      and not (stage = 'playoff' and blue_result = 'draw')
    )
  )
);

create index tournament_bouts_tournament_sort_idx
  on public.tournament_bouts (tournament_id, sort_order);

create index tournament_bouts_tournament_finished_idx
  on public.tournament_bouts (tournament_id, finished_at);

alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_bouts enable row level security;

create policy "tournaments_select_member"
  on public.tournaments for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournaments_insert_member"
  on public.tournaments for insert
  to authenticated
  with check (public.is_club_member(club_id));

create policy "tournaments_update_member"
  on public.tournaments for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

create policy "tournaments_delete_member"
  on public.tournaments for delete
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_participants_select_member"
  on public.tournament_participants for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_participants_insert_member"
  on public.tournament_participants for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.club_id = tournament_participants.club_id
    )
    and exists (
      select 1 from public.fencers f
      where f.id = fencer_id and f.club_id = tournament_participants.club_id
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
    and exists (
      select 1 from public.fencers f
      where f.id = fencer_id and f.club_id = tournament_participants.club_id
    )
  );

create policy "tournament_participants_delete_member"
  on public.tournament_participants for delete
  to authenticated
  using (public.is_club_member(club_id));

create policy "tournament_bouts_select_member"
  on public.tournament_bouts for select
  to authenticated
  using (public.is_club_member(club_id));

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
        select 1 from public.fencers f
        where f.id = blue_fencer_id and f.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.fencers f
        where f.id = red_fencer_id and f.club_id = tournament_bouts.club_id
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
        select 1 from public.fencers f
        where f.id = blue_fencer_id and f.club_id = tournament_bouts.club_id
      )
    )
    and (
      red_fencer_id is null
      or exists (
        select 1 from public.fencers f
        where f.id = red_fencer_id and f.club_id = tournament_bouts.club_id
      )
    )
  );

create policy "tournament_bouts_delete_member"
  on public.tournament_bouts for delete
  to authenticated
  using (public.is_club_member(club_id));

revoke all on public.tournaments from anon;
revoke all on public.tournament_participants from anon;
revoke all on public.tournament_bouts from anon;

grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.tournament_participants to authenticated;
grant select, insert, update, delete on public.tournament_bouts to authenticated;

grant usage on type public.tournament_status to authenticated;
grant usage on type public.tournament_format to authenticated;
grant usage on type public.tournament_points_scheme to authenticated;
grant usage on type public.tournament_bout_stage to authenticated;
