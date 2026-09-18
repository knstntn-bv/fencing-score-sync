-- Leaving a club keeps the person fencers.id. Roster Archive of an account
-- detaches club_id/role; nicknames still archive in place.

create or replace function public.fencers_protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  leaving boolean;
begin
  if tg_op = 'DELETE' then
    if old.club_id is not null
      and current_setting('fencing.deleting_club_id', true) = old.club_id::text
    then
      return old;
    end if;
    leaving := old.role = 'owner' and old.user_id is not null and old.archived_at is null;
    if leaving
      and not exists (
        select 1
        from public.fencers
        where club_id = old.club_id
          and role = 'owner'
          and user_id is not null
          and archived_at is null
          and id <> old.id
      )
    then
      raise exception 'club % must keep at least one owner', old.club_id;
    end if;
    return old;
  end if;

  if old.club_id is not null
    and current_setting('fencing.deleting_club_id', true) = old.club_id::text
  then
    return new;
  end if;

  leaving :=
    (
      old.role = 'owner'
      and old.user_id is not null
      and old.archived_at is null
      and old.club_id is not null
    )
    and not (
      new.role = 'owner'
      and new.user_id is not null
      and new.archived_at is null
      and new.club_id is not null
    );

  if leaving
    and not exists (
      select 1
      from public.fencers
      where club_id = old.club_id
        and role = 'owner'
        and user_id is not null
        and archived_at is null
        and id <> old.id
    )
  then
    raise exception 'club % must keep at least one owner', old.club_id;
  end if;

  return new;
end;
$$;

drop trigger if exists fencers_protect_last_owner on public.fencers;

create trigger fencers_protect_last_owner
  before delete or update of role, user_id, archived_at, club_id on public.fencers
  for each row
  execute procedure public.fencers_protect_last_owner();

create or replace function public.unlink_and_archive(p_fencer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.fencers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_fencer_id is null then
    raise exception 'Fencer not found';
  end if;

  select *
  into target
  from public.fencers
  where id = p_fencer_id;

  if target.id is null or target.club_id is null or not public.is_club_member(target.club_id) then
    raise exception 'Fencer not found';
  end if;

  if target.user_id is null then
    raise exception 'Fencer is not linked';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(target.user_id::text));
  perform pg_advisory_xact_lock(871234003, hashtext(p_fencer_id::text));

  perform set_config('fencing.fencer_link', '1', true);

  update public.fencers
  set club_id = null,
      role = null
  where id = p_fencer_id;

  return p_fencer_id;
end;
$$;

create or replace function public.leave_own_club()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select id
  into target_id
  from public.fencers
  where user_id = auth.uid()
    and club_id is not null
    and archived_at is null
  limit 1;

  if target_id is null then
    raise exception 'Not a club member';
  end if;

  return public.unlink_and_archive(target_id);
end;
$$;

revoke all on function public.leave_own_club() from public;
grant execute on function public.leave_own_club() to authenticated;
