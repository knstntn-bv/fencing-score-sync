-- Current desired schema. Apply in the Supabase SQL Editor on an empty project.
-- Do not replay timestamped files in migrations/ on top of this.
--
-- Live projects that already ran older migrations: apply only the new files
-- under migrations/, then keep this file in sync with the result.
--
-- When changing the database:
--   1. Add supabase/migrations/YYYYMMDDHHMMSS_short_name.sql (delta from current).
--   2. Update this file so it still creates the full schema from scratch.
--   3. Do not rewrite migrations that have already been applied.

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
  blue_result text not null,
  red_result text not null,
  time_limit_sec integer not null check (time_limit_sec > 0),
  points_limit integer not null check (points_limit > 0),
  remaining_sec integer not null check (remaining_sec >= 0),

  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint matches_distinct_fencers check (blue_fencer_id <> red_fencer_id),
  constraint matches_names_not_blank check (
    char_length(trim(blue_name)) > 0
    and char_length(trim(red_name)) > 0
  ),
  constraint matches_blue_result_check
    check (blue_result in ('win', 'lose', 'draw')),
  constraint matches_red_result_check
    check (red_result in ('win', 'lose', 'draw')),
  constraint matches_results_consistent check (
    (blue_score > red_score and blue_result = 'win' and red_result = 'lose')
    or (red_score > blue_score and blue_result = 'lose' and red_result = 'win')
    or (blue_score = red_score and blue_result = 'draw' and red_result = 'draw')
  )
);

create index matches_club_finished_at_idx
  on public.matches (club_id, finished_at desc);

create index matches_blue_fencer_idx
  on public.matches (blue_fencer_id);

create index matches_red_fencer_idx
  on public.matches (red_fencer_id);

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
  );

-- Matches are append-only. No update/delete policies.

revoke all on public.fencers from anon;
revoke all on public.matches from anon;
grant select, insert, update on public.fencers to authenticated;
grant select, insert on public.matches to authenticated;
