-- Allow manual draw saves. Time expiry no longer auto-closes a bout.

alter table public.matches
  drop constraint if exists matches_ended_by_check;

alter table public.matches
  add constraint matches_ended_by_check
  check (ended_by in ('points', 'time', 'draw'));
