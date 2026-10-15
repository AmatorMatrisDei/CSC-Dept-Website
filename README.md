# CSC-BUS-Dept-Website
The website for Franciscan University's Department of Computing and Engineering: a place to
showcase student, capstone and class projects, and for students and faculty to keep profiles.

**Live:** https://csc-dept-website.pages.dev (the production database)

**Developer site:** https://frontend-initial-layout.csc-dept-website.pages.dev (the latest build of the
`frontend/initial-layout` branch, against the dev database and its sample content)

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
| Backend | **Done.** Students, faculty, projects, members and advisors, consent, a review queue for every student submission, an audit log, the carousel, the student directory and URL slugs. Visitors only see published projects and students who opted in. Hardened after a security review. See [docs/backend-setup.md](docs/backend-setup.md) |
| Tests and CI | **Backend:** 137 database tests, 6 API tests and 6 carousel tests on every pull request. **Site:** a 15-step browser test of the student forms and review queue (`npm run test:e2e`), run by hand for now; lint and build only run in Cloudflare's build |
| Hosted databases | **Both current.** Production ("Franciscan Site") is empty. Dev ("Franciscan Site Dev") has sample content and skips email confirmation so the team can sign up. Both refuse sign-ups from non-university addresses |
| Carousel | **Runner done; pick pending.** An hourly job picks the day's projects and admins can re-shuffle. The pick is a placeholder until the Algorithms team delivers theirs |
| Still to build | The admin panel: faculty, partners, news, alumni stories, roles and the monthly carousel pool (FR-6). Email notifications to students when a submission is reviewed (FR-3.6) |
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
| `docs/` | [backend-setup.md](docs/backend-setup.md) and [testing.md](docs/testing.md) |

## Deploying

**The site.** Cloudflare Pages builds every push to this repository:

| Branch | Deploys to | Uses |
| --- | --- | --- |
| `main` | https://csc-dept-website.pages.dev | the production Supabase project |
| any other branch | a preview link, posted on its pull request | the dev Supabase project |

The Pages project's build settings: build command `npm run build`, output directory `dist`, and
the environment variables `NODE_VERSION=22`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (set separately for Production and Preview). Branches in forks
get no preview, so push branches to this repository.

If the site ever talks to a new address (another Supabase project, an image host), add it to the
`Content-Security-Policy` in `public/_headers`, or the browser will block it.

**The database and carousel function.** Supabase's GitHub integration deploys them to production
when a pull request merges into `main`: it applies new migrations and deploys the `carousel`
function. It doesn't run `seed.sql` or change Auth settings. The dev project is updated by hand.
See [docs/backend-setup.md](docs/backend-setup.md), section 3.

## Contributing

1. Create a branch in this repository (not a fork), so the pull request gets a preview link.
2. Open a pull request. CI runs the backend tests, and Cloudflare builds a preview against dev.
3. Get a review, then merge. Merging deploys to production right away: Cloudflare publishes the
   site, and Supabase applies new migrations and deploys the carousel function. A migration can't
   be undone by reverting the pull request, so try it locally and on dev first.

Keep secrets out of git. `.env.local` and `supabase/functions/.env` are ignored.
