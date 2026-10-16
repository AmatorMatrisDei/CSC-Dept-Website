# CSC-BUS-Dept-Website
The website for Franciscan University's Department of Computing and Engineering: a place to
showcase student, capstone and class projects, and for students and faculty to keep profiles.

**Working site: https://staging.csc-dept-website.pages.dev** (use this one). It runs the `staging`
branch on the dev database, with student sign-in and submissions, the review queue, admin editing
and the degree planner.

**Production address:** https://csc-dept-website.pages.dev runs `main`, an older version without
accounts. It will catch up when the team releases `staging`.

> **This branch is behind.** The team works on `staging` for now. The current README, status and
> docs are on the [`staging` branch](https://github.com/AmatorMatrisDei/CSC-Dept-Website/blob/staging/README.md).

Built with [React](https://react.dev) and [Vite](https://vite.dev), hosted on
[Cloudflare Pages](https://developers.cloudflare.com/pages/), with [Supabase](https://supabase.com) as the
backend (Postgres database, logins, photo storage, and the carousel function). Requirement IDs
(FR-…) refer to the Requirements and Team Guide v1.4.

## Status

See the [README on `staging`](https://github.com/AmatorMatrisDei/CSC-Dept-Website/blob/staging/README.md#status).
`main` will be updated when the project is released.

## Getting started

Requires **Node.js 22+**, and **Docker Desktop** if you run the database locally.

```bash
npm install
cp .env.example .env.local   # fill in a Supabase URL and publishable key (below)
npm run db:start             # optional: a local Supabase with test accounts and sample content
npm run dev                  # the site at http://localhost:5173
```

For `.env.local`, use either:

- **the local stack:** `http://127.0.0.1:54321` and the "Publishable" key from `npx supabase status`.
  Test accounts are listed in [docs/backend-setup.md](docs/backend-setup.md#1-local-harness-everyone).
- **the hosted dev project:** `https://zekufoxhojjqqbmcxmtu.supabase.co` and its publishable key
  from the Supabase dashboard (Project Settings > API Keys). No Docker needed.

Never put the secret key (`sb_secret_...`) in `.env.local` or anywhere in the site's code.

| Command | Does |
| --- | --- |
| `npm run dev` | Run the site with live reload |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Lint the site's code |
| `npm run db:start`, `db:test`, `test:api`, … | The backend harness; see [docs/backend-setup.md](docs/backend-setup.md) |

## Project layout

| Path | What it is |
| --- | --- |
| `src/pages/` | One component per page |
| `src/components/` | Shared UI: header, navigation, carousel, project browser, directory |
| `src/lib/content.ts` | Every database read the site makes. It applies the public rules itself (published projects, confirmed members, `listed_students`), so pages look the same when someone is signed in |
| `src/lib/supabase.ts` | The Supabase client (publishable key only) and photo URLs |
| `src/lib/database.types.ts` | Types generated from the schema (`npm run db:types`); don't edit by hand |
| `public/_headers` | Security headers Cloudflare sends with every page |
| `supabase/` | The backend: migrations, the carousel function, seed and dev content, tests |
| `docs/` | [backend-setup.md](docs/backend-setup.md) and [testing.md](docs/testing.md) |

## Deploying

**The site.** Cloudflare Pages builds every push to this repository:

| Branch | Deploys to | Uses |
| --- | --- | --- |
| `main` | https://csc-dept-website.pages.dev | the production Supabase project |
| `staging` | https://staging.csc-dept-website.pages.dev (the working site) | the dev Supabase project |
| any other branch | a preview link, posted on its pull request | the dev Supabase project |

The Pages project's build settings: build command `npm run build`, output directory `dist`, and
the environment variables `NODE_VERSION=22`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (set separately for Production and Preview). Branches in forks
get no preview, so push branches to this repository.

If the site ever talks to a new address (another Supabase project, an image host), add it to the
`Content-Security-Policy` in `public/_headers`, or the browser will block it.

**The database and carousel function.** Supabase's GitHub integration deploys them: merges into
`staging` go to the dev project, and merges into `main` to production. It applies new migrations
and deploys the `carousel` function. It doesn't run `seed.sql` or change Auth settings. See
[docs/backend-setup.md](docs/backend-setup.md), section 3.

## Contributing

1. Create a branch from `staging` in this repository (not a fork), so the pull request gets a
   preview link.
2. Open the pull request **against `staging`, not `main`**. CI runs the tests, and Cloudflare builds
   a preview against dev.
3. Get a review, then merge. Merging into `staging` updates the working site and applies new
   migrations to the dev database. `main` (production) only changes when `staging` is released.
   A migration can't be undone by reverting the pull request, so try it locally first.

Keep secrets out of git. `.env.local` and `supabase/functions/.env` are ignored.
