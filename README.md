# Fencing Scorer

Club fencing scoreboard: timer and scores on the device, roster and saved bouts in Supabase.

Live site: [fencing-scorer.konbo.me](https://fencing-scorer.konbo.me/)

## What it does

- Scoreboard with blue/red sides, period timer, and a 1-second hold Reset
- Email/password login to manage fencers and save named bouts
- **Quick bout** from the login screen: anonymous timer and scores, no Save, no roster
- Local time/points limits (default 90 seconds / 12 points)
- Offline Save queue: named results wait in `localStorage` and upload when the network is back
- History and per-fencer stats from saved scorelines (`win` / `lose` / `draw`)

The running bout never depends on Wi-Fi. Only roster CRUD and saved matches talk to the database.

Longer notes (in Russian) live in [`docs/general/`](docs/general/overview.md):

- [Overview](docs/general/overview.md)
- [Bout-end rules](docs/general/bout-end-rules.md)
- [Fencers, history, stats](docs/general/fencers-and-match-history.md)

## Stack

- Vite, React 18, TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query, React Router
- Supabase (Postgres, Auth, RLS)
- Capacitor 7 (optional native shell; `android/` and `ios/` are not in git)

## Local development

Node.js and npm are required.

```sh
git clone https://github.com/knstntn-bv/fencing-score-sync.git
cd fencing-score-sync
npm i
cp .env.example .env.local   # optional; see below
npm run dev
```

Dev server: [http://localhost:8080/](http://localhost:8080/).

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the app stays fully local: scoreboard and settings work, club pages show a “connect Supabase” message, and there is no login screen.

## Supabase

Create a project, then either:

- paste [`supabase/final_schema.sql`](supabase/final_schema.sql) into the SQL Editor on an **empty** database, or
- apply new files from [`supabase/migrations/`](supabase/migrations/) on a database that already ran older SQL

Details: [`supabase/README.md`](supabase/README.md).

`.env.local`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Only the anon key belongs in the client. Do not put `service_role` in Vite env or GitHub Actions.

Roster and matches belong to a `clubs` row. A named account is a `fencers` row with `user_id` and a digit-only `public_id` (assigned from 1001, then max+1). Club access is that row with a `club_id` (`owner`, `trainer`, `member`). Linked roster names follow the account. The roster can add an account by that ID (`add_linked_fencer`) or merge a nickname into the account (`merge_nickname_into_person`: history ids rewrite, nickname row deleted). Archive of a linked row detaches `club_id`/`role` and keeps the person id (`detach_from_club`). Account can leave the same way (`leave_own_club`). The last owner cannot leave. Signup does not create a club. After sign-in the user enters a name, then may create a club (they become `owner` and a roster row) or skip. Account settings show the public ID as read-only. RLS keeps members to their club's `fencers` and `matches`. The UI does not switch clubs or show roles yet.

## Deploy

Pushes to `main` build with GitHub Actions and publish GitHub Pages (`.github/workflows/deploy-pages.yml`).

Repo secrets used at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Pages source: GitHub Actions. Custom domain is in [`CNAME`](CNAME). The workflow copies `index.html` to `404.html` so client-side routes work.

## Native app (optional)

```sh
npm run build
npx cap add android   # once, locally
npx cap add ios       # once, locally
npx cap sync
```

The WebView loads the production `dist` bundle. Do not commit a permanent `server.url` in `capacitor.config.ts` (that would load a remote site instead of packaged assets). For device live-reload only, set `CAPACITOR_LIVE_RELOAD_URL` before `cap sync`.
