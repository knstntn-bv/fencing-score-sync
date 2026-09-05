-- Fencers roster and match history.
-- Apply in the Supabase SQL editor, or via `supabase db push` after linking the project.
-- club_id is auth.uid() for the first club-account contour.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.fencers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fencers_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index fencers_club_active_name_unique
  on public.fencers (club_id, lower(trim(name)))
  where archived_at is null;

create trigger fencers_set_updated_at
  before update on public.fencers
  for each row
  execute procedure public.set_updated_at();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references auth.users (id) on delete cascade,

  blue_fencer_id uuid not null references public.fencers (id),
  red_fencer_id uuid not null references public.fencers (id),
  blue_name text not null,
  red_name text not null,

  blue_score integer not null check (blue_score >= 0),
  red_score integer not null check (red_score >= 0),
  time_limit_sec integer not null check (time_limit_sec > 0),
  points_limit integer not null check (points_limit > 0),
  remaining_sec integer not null check (remaining_sec >= 0),

  winner_fencer_id uuid references public.fencers (id),
  winner_name text,
  ended_by text not null check (ended_by in ('points', 'time')),

  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint matches_distinct_fencers check (blue_fencer_id <> red_fencer_id),
  constraint matches_names_not_blank check (
    char_length(trim(blue_name)) > 0
    and char_length(trim(red_name)) > 0
  ),
  constraint matches_winner_consistency check (
    (
      winner_fencer_id is null
      and winner_name is null
    )
    or (
      winner_fencer_id is not null
      and winner_name is not null
      and winner_fencer_id in (blue_fencer_id, red_fencer_id)
      and (
        (winner_fencer_id = blue_fencer_id and winner_name = blue_name)
        or (winner_fencer_id = red_fencer_id and winner_name = red_name)
      )
    )
  )
);

create index matches_club_finished_at_idx
  on public.matches (club_id, finished_at desc);

create index matches_blue_fencer_idx
  on public.matches (blue_fencer_id);

create index matches_red_fencer_idx
  on public.matches (red_fencer_id);

create index matches_winner_fencer_idx
  on public.matches (winner_fencer_id);

alter table public.fencers enable row level security;
alter table public.matches enable row level security;

create policy "fencers_select_own"
  on public.fencers for select
  to authenticated
  using (club_id = auth.uid());

create policy "fencers_insert_own"
  on public.fencers for insert
  to authenticated
  with check (club_id = auth.uid());

create policy "fencers_update_own"
  on public.fencers for update
  to authenticated
  using (club_id = auth.uid())
  with check (club_id = auth.uid());

-- No delete policy: archive via update. History rows keep fencer ids.

create policy "matches_select_own"
  on public.matches for select
  to authenticated
  using (club_id = auth.uid());

create policy "matches_insert_own"
  on public.matches for insert
  to authenticated
  with check (
    club_id = auth.uid()
    and exists (
      select 1 from public.fencers f
      where f.id = blue_fencer_id and f.club_id = auth.uid()
    )
    and exists (
      select 1 from public.fencers f
      where f.id = red_fencer_id and f.club_id = auth.uid()
    )
    and (
      winner_fencer_id is null
      or winner_fencer_id in (blue_fencer_id, red_fencer_id)
    )
  );

-- Matches are append-only. No update/delete policies.

revoke all on public.fencers from anon;
revoke all on public.matches from anon;
grant select, insert, update on public.fencers to authenticated;
grant select, insert on public.matches to authenticated;
