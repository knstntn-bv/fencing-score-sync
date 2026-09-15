-- Digit-only public IDs on profiles. Existing rows get 1001, 1002, … by created_at.
-- New rows get max(existing)+1. Clients cannot set or change the value.

alter table public.profiles
  add column public_id text;

with numbered as (
  select
    user_id,
    (1000 + row_number() over (order by created_at, user_id))::text as public_id
  from public.profiles
)
update public.profiles as profile
set public_id = numbered.public_id
from numbered
where profile.user_id = numbered.user_id;

alter table public.profiles
  alter column public_id set not null,
  add constraint profiles_public_id_digits check (public_id ~ '^[0-9]+$'),
  add constraint profiles_public_id_unique unique (public_id);

create or replace function public.profiles_assign_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.public_id := old.public_id;
    return new;
  end if;

  perform pg_advisory_xact_lock(871234002);

  select (coalesce(max(public_id::bigint), 1000) + 1)::text
  into new.public_id
  from public.profiles;

  return new;
end;
$$;

create trigger profiles_assign_public_id
  before insert or update on public.profiles
  for each row
  execute procedure public.profiles_assign_public_id();

revoke all on function public.profiles_assign_public_id() from public;
