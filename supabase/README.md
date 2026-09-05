# Supabase schema

`final_schema.sql` is the current database: tables, indexes, RLS, grants. Paste it into the SQL Editor on a **new** (empty) project.

Do not also replay `migrations/` on a database that was created from `final_schema.sql`.

## Existing project

If the project already applied older SQL, run only the new files in `migrations/` that have not been applied yet (in timestamp order). Then update `final_schema.sql` so it still matches live Postgres.

## Changing the schema

1. Add `migrations/YYYYMMDDHHMMSS_short_name.sql` — the delta from the current live schema (`ALTER` / `DROP` / `CREATE`).
2. Update `final_schema.sql` so a blank database still ends up identical.
3. Leave already-applied migration files unchanged.
