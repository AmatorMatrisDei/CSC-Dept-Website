# CSC-Dept-Website
The website for Franciscan University's Department of Engineering and Computing: a place to
showcase student, capstone and class projects, and for students and faculty to keep profiles.

The full name is **Department of Engineering and Computing**, as in the university catalog. Use
**Engineering & Computing** only where space is short: the header, browser tabs, the home page
heading.

**Live site:** https://csc-dept-website.pages.dev (the `main` branch, on the production database)

**Developer site:** https://staging.csc-dept-website.pages.dev (the `staging` branch, on the dev
database with sample content). Every change is checked here before it goes live.

Built with [React](https://react.dev) and [Vite](https://vite.dev), hosted on
[Cloudflare Pages](https://developers.cloudflare.com/pages/), with [Supabase](https://supabase.com) as the
backend (Postgres database, logins, photo storage, and the carousel function). Requirement IDs
(FR-…) refer to the Requirements and Team Guide v1.4.

## Status

As of October 15, 2026.

| Area | Status |
| --- | --- |
| Website | **Live.** Home (carousel and project browser), projects, faculty, students and about pages, with security headers. Production has no content yet, and the About text is a placeholder |
| Student accounts and review | **Built.** Students sign in with their university email, choose what they share, and submit their profile, projects (team, advisors, partners, photos) and internships. Reviewers approve, return with a note, or reject at `/review`, seeing what's on the site beside what's proposed. Works on the developer site; production sign-up waits on email delivery (below) |
| Admin editing | **Built.** Admins turn on Edit mode from the bar at the bottom of the page to change page wording and project, student and faculty details right on the page, and set people's roles on the People page (under My account) |
| Backend | **Done.** Students, faculty, projects, members and advisors, consent, a review queue for every student submission, an audit log, the carousel, the student directory and URL slugs. Visitors only see published projects and students who opted in. Hardened after a security review. See [docs/backend-setup.md](docs/backend-setup.md) |
| Tests and CI | **Backend:** 394 database tests, 19 API tests and 6 carousel tests. **Site:** lint, 70 unit tests, the type-check and build, and two browser tests (35 steps) of the student forms and review queue (`npm run test:e2e`). All run on every pull request |
| Hosted databases | **Both current.** Production ("Franciscan Site") is empty. Dev ("Franciscan Site Dev") has sample content and skips email confirmation so the team can sign up. Both refuse sign-ups from non-university addresses |
| Carousel | **Runner done; pick pending.** An hourly job picks the day's projects and admins can re-shuffle. The pick is a placeholder until the Algorithms team delivers theirs |
| Still to build | Adding faculty and partners, news, alumni stories and the monthly carousel pool (FR-6). Email notifications to students when a submission is reviewed (FR-3.6) |
| Open | Email delivery with ITS (Microsoft sign-in or university SMTP). Until it's settled, students can't confirm new accounts on production |

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
| `npm run test:e2e` | The student forms and review queue in Chrome, against the local stack; see [docs/testing.md](docs/testing.md) |
| `npm run icons` | Remake `public/favicon.ico` and `apple-touch-icon.png` from `public/favicon.svg`, in Chrome |
| `npm run test:unit` | Unit tests of the site's pure helpers (planner rules, formatting, sign-in redirects) |
| `npm run changes` | List what was merged into `staging` since the latest version tag (or `-- v0`, or a date), for the change-log; see [docs/change-log.md](docs/change-log.md) |

## Project layout

| Path | What it is |
| --- | --- |
| `src/pages/` | One component per page. `account/` holds sign-in and the student forms, `review/` the reviewer queue |
| `src/components/` | Shared UI: header, navigation, carousel, project browser, directory, form fields and photo pickers (`Form.tsx`) |
| `src/lib/content.ts` | Every database read the site makes. It applies the public rules itself (published projects, confirmed members, `listed_students`), so pages look the same when someone is signed in |
| `src/lib/account.ts`, `auth.ts`, `review.ts` | Signing in, and everything students and reviewers send: consents, submissions to the review queue, photo uploads (resized in the browser) and review decisions |
| `src/lib/supabase.ts` | The Supabase client (publishable key only) and photo URLs |
| `src/lib/database.types.ts` | Types generated from the schema (`npm run db:types`); don't edit by hand |
| `public/_headers` | Security headers Cloudflare sends with every page |
| `supabase/` | The backend: migrations, the carousel function, seed and dev content, tests |
| `tests/e2e/` | The browser test of the student forms |
| `src/components/Editable.tsx`, `SiteText.tsx`, `EditProvider.tsx` | Click-to-edit for admins; page wording is stored in the `site_content` table |
| `docs/` | [contributing.md](docs/contributing.md) (how we work; the AI version is [AGENTS.md](AGENTS.md)), [backend-explained.md](docs/backend-explained.md) and [frontend-explained.md](docs/frontend-explained.md) (how the site works, with the code), [backend-setup.md](docs/backend-setup.md), [testing.md](docs/testing.md) and [repository-settings.md](docs/repository-settings.md) (GitHub settings only the owner can change) |

## How changes go live

Every change takes the same path: **feature branch → `staging` → `main`**.

| Step | Branch | Site | Database |
| --- | --- | --- | --- |
| 1. Build it | your feature branch | a preview link on its pull request | dev |
| 2. Check it | `staging` | the developer site, https://staging.csc-dept-website.pages.dev | dev |
| 3. Publish it | `main` | the live site, https://csc-dept-website.pages.dev | production |

1. **Pick an issue and start from `staging`.** Comment on the issue first ("Working on this one.")
   so no one else starts it. Then:
   ```bash
   git switch staging && git pull
   git switch -c feature/short-description
   ```
   Push the branch to this repository, not a fork, so it gets a preview link.
2. **Open a pull request into `staging`**, not `main`. CI runs the front-end and backend checks and
   Cloudflare builds a preview. Get a teammate's review.
3. **Merge it into `staging`.** Cloudflare updates the developer site, and Supabase applies any
   new migrations to the dev database.
4. **Check it on the developer site** with teammates and faculty
   ([docs/testing.md](docs/testing.md#testing-with-people-developer-site)).
5. **When `staging` is ready to go live, open a pull request from `staging` into `main`.** Merging
   it publishes the site and applies the new migrations to the production database. A migration
   can't be undone by reverting, which is why it runs on dev first.

Don't merge feature branches straight into `main`, and don't push to `staging` or `main` directly.

A pull request's preview uses the dev database as `staging` left it, so a branch that changes the
database can only be tried fully after it merges into `staging`; test it locally before that
(`npm run db:start`). **Don't push a branch's migrations to dev by hand.** Supabase then finds a
migration on dev that `staging` doesn't have, and refuses every later deploy to dev ("Remote
migration versions not found in local migrations directory") until that branch is merged.

### Deployment settings

**The site.** Cloudflare Pages builds every push. `main` is the production deployment and uses
the production Supabase project; every other branch, `staging` included, is a preview and uses
the dev project. Build command `npm run build`, output directory `dist`, and the environment
variables `NODE_VERSION=22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and, for the
CAPTCHA, `VITE_TURNSTILE_SITE_KEY` (set separately for Production and Preview).

If the site ever talks to a new address (another Supabase project, an image host), add it to the
`Content-Security-Policy` in `public/_headers`, or the browser will block it.

**The databases and the carousel function.** Supabase's GitHub integration deploys them: merging
into `staging` updates the dev project, and merging into `main` updates production. It applies new
migrations and deploys the `carousel` function; it doesn't run `seed.sql` or change Auth settings.
See [docs/backend-setup.md](docs/backend-setup.md), section 3.

Keep secrets out of git. `.env.local` and `supabase/functions/.env` are ignored.
