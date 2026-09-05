-- Result is per fencer from the scoreline. How the clock stopped does not matter.

alter table public.matches drop constraint if exists matches_winner_consistency;
alter table public.matches drop constraint if exists matches_ended_by_check;

drop index if exists public.matches_winner_fencer_idx;

drop policy if exists "matches_insert_own" on public.matches;

alter table public.matches drop column if exists winner_fencer_id;
alter table public.matches drop column if exists winner_name;
alter table public.matches drop column if exists ended_by;

alter table public.matches
  add column if not exists blue_result text,
  add column if not exists red_result text;

update public.matches
set
  blue_result = case
    when blue_score > red_score then 'win'
    when blue_score < red_score then 'lose'
    else 'draw'
  end,
  red_result = case
    when red_score > blue_score then 'win'
    when red_score < blue_score then 'lose'
    else 'draw'
  end
where blue_result is null or red_result is null;

alter table public.matches
  alter column blue_result set not null,
  alter column red_result set not null;

alter table public.matches
  drop constraint if exists matches_blue_result_check,
  drop constraint if exists matches_red_result_check,
  drop constraint if exists matches_results_consistent;

alter table public.matches
  add constraint matches_blue_result_check
    check (blue_result in ('win', 'lose', 'draw')),
  add constraint matches_red_result_check
    check (red_result in ('win', 'lose', 'draw')),
  add constraint matches_results_consistent check (
    (blue_score > red_score and blue_result = 'win' and red_result = 'lose')
    or (red_score > blue_score and blue_result = 'lose' and red_result = 'win')
    or (blue_score = red_score and blue_result = 'draw' and red_result = 'draw')
  );

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
