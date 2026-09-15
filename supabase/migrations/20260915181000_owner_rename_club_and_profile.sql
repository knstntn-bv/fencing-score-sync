-- Owners can rename the club. Saving a display name also updates the linked roster row.

create or replace function public.is_club_owner(p_club_id uuid)
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
      and role = 'owner'
  );
$$;

create or replace function public.save_own_profile(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if normalized is null then
    raise exception 'Name is required';
  end if;

  insert into public.profiles (user_id, name)
  values (auth.uid(), normalized)
  on conflict (user_id) do update
    set name = excluded.name;

  update public.fencers
  set name = normalized
  where user_id = auth.uid()
    and archived_at is null;

  return normalized;
end;
$$;

create or replace function public.rename_own_club(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  club_name text;
  target_club_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  club_name := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  if club_name is null then
    raise exception 'Club name is required';
  end if;

  perform pg_advisory_xact_lock(871234001, hashtext(auth.uid()::text));

  select club_id
  into target_club_id
  from public.club_members
  where user_id = auth.uid()
    and role = 'owner'
  order by created_at asc
  limit 1;

  if target_club_id is null then
    raise exception 'Only the owner can rename the club';
  end if;

  update public.clubs
  set name = club_name
  where id = target_club_id;

  return club_name;
end;
$$;

create policy "clubs_update_owner"
  on public.clubs for update
  to authenticated
  using (public.is_club_owner(id))
  with check (public.is_club_owner(id));

revoke all on function public.is_club_owner(uuid) from public;
revoke all on function public.rename_own_club(text) from public;
grant execute on function public.is_club_owner(uuid) to authenticated;
grant execute on function public.rename_own_club(text) to authenticated;

grant update on public.clubs to authenticated;
