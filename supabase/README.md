# The realm ledger — Supabase setup

The game keeps a local save in `localStorage` (`td-dsalgo:progress:v1`) and, when a
ledger is configured, a copy in Postgres. The cloud copy is what makes a name
unique across players and what the shared ranking reads.

Nothing here needs an account password: a player picks a commander name and the
browser mints a random `device_key` that proves ownership of that row. The name
is claimed once; afterwards the ledger refuses it for everyone else.

---

## 1. Apply the migration

One file, idempotent, wrapped in a transaction:

```
supabase/migrations/0001_cloud_save.sql
```

**Dashboard:** SQL editor → New query → paste the file → Run.

**CLI:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

It creates `public.players`, `public.progress`, `public.player_achievements`,
the `clean_username` helper, and seven `security definer` functions:

| function | what it does |
| --- | --- |
| `cloud_ping` | liveness + `{ ok, schema: 1 }`; also the version handshake |
| `check_username` | is this name free? (case-insensitive, no side effects) |
| `register_player` | claims a name for a `device_key`, or refuses with `taken` |
| `sync_progress` | writes the save blob + the ranking metrics for the caller's device |
| `pull_progress` | reads back the save for the caller's device |
| `leaderboard_page` | one page of the ranking (power → level → stars → best score) |
| `my_rank` | the caller's own rank, power, level, stars and medal count |

The client is only ever allowed to call those seven. Tables are locked down:
RLS is enabled with **no policies** and all table privileges are revoked from
`anon` / `authenticated`, so the anon key cannot read or write rows directly —
it can only execute the functions, which are `security definer` with a pinned
`search_path`.

## 2. Point the game at the project

First match wins:

1. **URL parameters** (per link, not stored): `?supabase=https://xyz.supabase.co&key=<anon key>`
2. **Build-time env vars**:

   ```bash
   VITE_SUPABASE_URL=https://xyz.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   npm run build
   ```

3. **Local stand-in** — with neither of the above, the dev server and
   `vite preview` proxy `/supabase-dev` to `http://127.0.0.1:8791`.

Use the **anon** key. The service-role key grants full table access and must
never reach a browser bundle; it is not used anywhere in this repository.

## 3. Run it locally

```bash
npm run dev:cloud     # stand-in ledger on :8791 + vite dev server
npm run cloud:dev     # stand-in ledger alone
```

The stand-in (`server/cloud-dev.mjs`) is a JSON-file implementation of the same
seven functions, so the whole gate → claim → sync → ranking path can be
exercised without a Supabase project. Its store lives in
`.dev-data/cloud-dev.json` (git-ignored); delete that file to start from an
empty ledger.

It is **not** Supabase: it does not run the SQL, it does not enforce RLS, and it
does not prove the migration is valid Postgres.

## 4. What is stored

- `players` — commander name (`username` + lower-cased `username_key`, unique),
  `device_key`, and the four ranking numbers: `power`, `level`, `stars`,
  `best_score`.
- `progress` — the save file as `jsonb`, plus a `revision` that only increases.
  `sync_progress` clamps the metrics so they can never be lowered by a stale
  push, and rejects payloads over 128 KB.
- `player_achievements` — one row per unlocked medal, counted for the ranking
  and available for a future medal list.

Ranking order is fixed in SQL: **power DESC, level DESC, stars DESC,
best_score DESC, created_at ASC, id ASC** (the last two only break ties, so a
name never jumps around between two reads).

## 5. Limits worth knowing

- **One browser per name.** The `device_key` lives in `localStorage`. Clearing
  site data loses the ability to write that row; the name stays taken (which is
  the requested behaviour) but the save behind it becomes read-only. Cross-device
  restore would need a real auth provider or a recovery code — out of scope here.
- **No moderation.** Names are 3–16 characters of `[A-Za-z0-9 ._-]` and the four
  reserved words `admin`, `administrator`, `system`, `supabase` are refused, but
  there is no profanity filter.
- **Leaderboard is read-only for now.** It shows rank, power, level, stars and
  medals. The in-battle screens do not yet push a live scoreboard; that is the
  next pass.

## 6. Key hygiene

Two keys are visible in a Supabase project's API settings, and only one may ever
leave the dashboard for a browser:

- **anon / publishable** — public by design. It can only execute the seven
  functions the migration grants; RLS keeps it away from the tables. This is the
  key the game builds with.
- **service_role** — owns the database and bypasses RLS. It belongs to trusted
  server code only. This repository never reads it, and the client has no code
  path for it: `resolveSupabaseConfig()` accepts exactly one key and the
  migration never grants table privileges to `anon`.

If a service-role key is ever pasted into a chat, a ticket, a screenshot or a
commit, treat it as compromised and rotate it — Dashboard → **Project Settings**
→ **API** → JWT settings → rotate the JWT secret (this re-issues both keys), then
update whatever server-side tooling held the old one. Rotating costs nothing
here because the game only ever uses the anon key.

## 7. Deploying to Vercel

`vercel.json` already carries the only two settings the build needs
(`buildCommand: npm run build`, `outputDirectory: dist`). `.env.local` is
git-ignored and is never read by Vercel — the project gets its own variables:

1. **Project → Settings → Environment Variables**, add both names for
   *Production* (and *Preview* if you deploy branches):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. **Redeploy.** Vite inlines `import.meta.env` at build time, so an existing
   deployment keeps the empty pair until it is rebuilt. *Deployments → ⋯ →
   Redeploy* is enough; `git push` alone is not.
3. **Check the gate line.** It must read `LEDGER · SUPABASE`. If it reads
   `LEDGER · LOCAL ONLY`, the build did not see the pair: check the `VITE_`
   prefix (a bare `SUPABASE_URL` also works, but only those two names), the
   chosen environment (Production vs Preview), and that the deployment was
   actually rebuilt.
4. **`?supabase=<url>&key=<anon key>`** still works on any deployment and needs
   no rebuild — useful for testing a second project without touching settings.

Without the pair the site is **not** broken: the client falls back to "no ledger
configured", the game runs local-only and the gate says so. The `/supabase-dev`
proxy exists only on a loopback origin (`localhost`, `127.0.0.1`, `[::1]`), so a
public host can never end up posting to a path that does not exist.

### If Vercel reports the deployment as blocked

On a **Hobby** account Vercel only deploys commits whose author is the account
owner. A commit authored by anything else — a teammate, a bot, an AI agent, or a
`Co-authored-by` trailer — fails with `TEAM_ACCESS_REQUIRED` / "the commit
author does not have contributing access to the project" and the deployment sits
in `BLOCKED` without build logs. Every commit in this repository is therefore
authored as the account owner:

```
ronnvincent <304915513+ronnvincent@users.noreply.github.com>
```

If a bad author slips in, the fix is on the commit, not in `vercel.json`:
`git commit --amend --no-edit --reset-author` on the tip (or rewriting the
branch) with `user.email` set to the address on the Vercel account, then push.
Deploying a copy of the tree without `.git` also bypasses the check.
