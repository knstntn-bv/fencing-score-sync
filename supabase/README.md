# Supabase schema

`final_schema.sql` is the current database: tables, indexes, RLS, grants. Paste it into the SQL Editor on a **new** (empty) project.

Tenant is `clubs`; access is an active `fencers.user_id` with a club. Display names and digit-only `public_id` values live in `profiles` and are copied onto the account’s `fencers` row. Roster and matches use `club_id`. A named account always has a `fencers` row; `club_id` is null until they join a club, and leaving a club clears `club_id`/`role` without changing `id`. Product notes: [`docs/general/fencers-and-match-history.md`](../docs/general/fencers-and-match-history.md). Before dropping `profiles`, run the SELECT-only checks in [`inventory/drop_profiles/`](./inventory/drop_profiles/).

Do not also replay `migrations/` on a database that was created from `final_schema.sql`.

## Existing project

If the project already applied older SQL, run only the new files in `migrations/` that have not been applied yet (in timestamp order). Then update `final_schema.sql` so it still matches live Postgres.

## Changing the schema

1. Add `migrations/YYYYMMDDHHMMSS_short_name.sql` — the delta from the current live schema (`ALTER` / `DROP` / `CREATE`).
2. Update `final_schema.sql` so a blank database still ends up identical.
3. Leave already-applied migration files unchanged.
