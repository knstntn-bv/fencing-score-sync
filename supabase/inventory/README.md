# Inventory (person-fencers, step 0)

SELECT-only snapshots of live data **after** `#53` (`profiles` + `fencers`, no `club_members`). Not a migration: do not put these files in `migrations/` and do not apply them as schema changes.

Run in the **Supabase SQL Editor** as `postgres` (the editor default). That role bypasses RLS. An authenticated session would only see the caller’s club.

The editor shows **one result set per run**. Start with `00_counts.sql`. If a `review` / `rewrite` count is non-zero, open the matching detail file.

| File | When to run |
| --- | --- |
| [`00_counts.sql`](./00_counts.sql) | Always. One row per check. |
| [`01_people.sql`](./01_people.sql) | Named accounts vs `fencers`, leftover `user_id` on archive, name drift. |
| [`02_nicknames.sql`](./02_nicknames.sql) | Club-only rows (`user_id` is null) and how much history they carry. |
| [`03_tournament_ids.sql`](./03_tournament_ids.sql) | Guest `fencer_id` = `profiles.user_id` vs roster `fencers.id`. |
| [`04_merge_collisions.sql`](./04_merge_collisions.sql) | Rows that would collide if a nickname were merged onto an account fencer. |
| [`05_history_fks.sql`](./05_history_fks.sql) | `matches` / `tournament_bouts` ids vs current `fencers`. |

## How to read `00_counts`

`kind` is `info` (volume), `rewrite` (rows the backfill must retarget), or `review` (decide or repair before backfill). Empty `review` rows (`n = 0`) mean that class is clean.

Expected shape after `#53` for a small club app:

- **A** (`profiles` with no `fencers` row) is normal: named account, no club yet. Backfill will insert a person row with null `club_id`.
- **C** (archived + `user_id`) should be 0: unlink already clears `user_id`. Non-zero occupies the global unique `user_id` slot.
- **E_guest_profile** is the Add-by-ID path: `tournament_participants.fencer_id` is `auth.users.id`. Backfill rewrites those to the person `fencers.id`.
- **E_rewrite_collision** must be 0 (or resolved by hand) before that rewrite: same tournament already has both the roster id and the account id.
- **F_same_match / F_same_bout** must be 0 before deleting a nickname whose history is rewritten onto an account that already fences in that bout.

`auth.users` appears only in A2. The editor can read it as `postgres`.
