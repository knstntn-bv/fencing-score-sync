-- Clubs as a real entity. fencers/matches.club_id no longer equals auth.uid().
-- Existing users keep their uuid as clubs.id and become owner of that club.
-- New users get a fresh club named 'Fencing Club' via a trigger on auth.users.

create type public.club_member_role as enum ('owner', 'trainer', 'member');

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Fencing Club',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_name_not_blank check (char_length(trim(name)) > 0)
);

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row
  execute procedure public.set_updated_at();

create or replace function public.clubs_mark_deleting()
returns trigger
language plpgsql
as $$
begin
  perform set_config('fencing.deleting_club_id', old.id::text, true);
  return old;
end;
$$;

create trigger clubs_mark_deleting
  before delete on public.clubs
  for each row
  execute procedure public.clubs_mark_deleting();

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.club_member_role not null,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index club_members_user_id_idx
  on public.club_members (user_id);

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members
    where club_id = p_club_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.club_members_protect_last_owner()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('fencing.deleting_club_id', true) = old.club_id::text then
      return old;
    end if;

    if old.role = 'owner'
      and not exists (
        select 1 from public.club_members
        where club_id = old.club_id
          and role = 'owner'
          and user_id <> old.user_id
      )
      and exists (
        select 1 from public.club_members
        where club_id = old.club_id
          and user_id <> old.user_id
      )
    then
      raise exception 'club % must keep at least one owner', old.club_id;
    end if;

    return old;
  end if;

  if old.role = 'owner'
    and new.role is distinct from 'owner'
    and not exists (
      select 1 from public.club_members
      where club_id = old.club_id
        and role = 'owner'
        and user_id <> old.user_id
    )
  then
    raise exception 'club % must keep at least one owner', old.club_id;
  end if;

  return new;
end;
$$;

create trigger club_members_protect_last_owner
  before delete or update of role on public.club_members
  for each row
  execute procedure public.club_members_protect_last_owner();

create or replace function public.club_members_cleanup_empty_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('fencing.deleting_club_id', true) = old.club_id::text then
    return old;
  end if;

  if not exists (
    select 1 from public.club_members where club_id = old.club_id
  ) then
    delete from public.clubs where id = old.club_id;
  end if;

  return old;
end;
$$;

create trigger club_members_cleanup_empty_club
  after delete on public.club_members
  for each row
  execute procedure public.club_members_cleanup_empty_club();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club_id uuid;
begin
  if exists (
    select 1 from public.club_members where user_id = new.id
  ) then
    return new;
  end if;

  insert into public.clubs (name)
  values ('Fencing Club')
  returning id into new_club_id;

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, new.id, 'owner');

  return new;
end;
$$;

create or replace function public.ensure_own_club()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_club_id uuid;
  new_club_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select club_id
  into existing_club_id
  from public.club_members
  where user_id = auth.uid()
  order by (role = 'owner') desc, created_at asc
  limit 1;

  if existing_club_id is not null then
    return existing_club_id;
  end if;

  insert into public.clubs (name)
  values ('Fencing Club')
  returning id into new_club_id;

  insert into public.club_members (club_id, user_id, role)
  values (new_club_id, auth.uid(), 'owner');

  return new_club_id;
end;
$$;

-- Preserve current club_id values (they already equal auth.users.id).
insert into public.clubs (id, name)
select distinct src.id, 'Fencing Club'
from (
  select id from auth.users
  union
  select club_id from public.fencers
  union
  select club_id from public.matches
) as src;

insert into public.club_members (club_id, user_id, role)
select u.id, u.id, 'owner'::public.club_member_role
from auth.users u;

alter table public.fencers drop constraint if exists fencers_club_id_fkey;
alter table public.fencers
  add constraint fencers_club_id_fkey
  foreign key (club_id) references public.clubs (id) on delete cascade;

alter table public.matches drop constraint if exists matches_club_id_fkey;
alter table public.matches
  add constraint matches_club_id_fkey
  foreign key (club_id) references public.clubs (id) on delete cascade;

drop policy if exists "fencers_select_own" on public.fencers;
drop policy if exists "fencers_insert_own" on public.fencers;
drop policy if exists "fencers_update_own" on public.fencers;
drop policy if exists "matches_select_own" on public.matches;
drop policy if exists "matches_insert_own" on public.matches;

create policy "fencers_select_member"
  on public.fencers for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "fencers_insert_member"
  on public.fencers for insert
  to authenticated
  with check (public.is_club_member(club_id));

create policy "fencers_update_member"
  on public.fencers for update
  to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

create policy "matches_select_member"
  on public.matches for select
  to authenticated
  using (public.is_club_member(club_id));

create policy "matches_insert_member"
  on public.matches for insert
  to authenticated
  with check (
    public.is_club_member(club_id)
    and exists (
      select 1 from public.fencers f
      where f.id = blue_fencer_id and f.club_id = matches.club_id
    )
    and exists (
      select 1 from public.fencers f
      where f.id = red_fencer_id and f.club_id = matches.club_id
    )
  );

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

create policy "clubs_select_member"
  on public.clubs for select
  to authenticated
  using (public.is_club_member(id));

create policy "club_members_select_own"
  on public.club_members for select
  to authenticated
  using (user_id = auth.uid());

revoke all on function public.is_club_member(uuid) from public;
revoke all on function public.ensure_own_club() from public;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.ensure_own_club() to authenticated;

grant usage on type public.club_member_role to authenticated;

revoke all on public.clubs from anon;
revoke all on public.club_members from anon;
grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
