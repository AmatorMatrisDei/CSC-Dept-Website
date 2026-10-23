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

## Documentation

Start with the first row; the rest are there when you need them.

| Read this | When |
| --- | --- |
| [docs/contributing.md](docs/contributing.md) | Before your first change: the branch, pull request and review path, and the rules for code |
| [docs/backend-setup.md](docs/backend-setup.md) | Setting up the local database, the test accounts, and how the hosted databases are deployed |
| [docs/testing.md](docs/testing.md) | Which tests exist, how to run them, and how to try the developer site with people |
| [docs/frontend-explained.md](docs/frontend-explained.md) | How the site's pages, components and data files fit together |
| [docs/backend-explained.md](docs/backend-explained.md) | How the database, the access rules and the review queue work, with the code |
| [docs/issue-sizes.md](docs/issue-sizes.md) | Choosing an issue: what the priority and size labels mean |
| [docs/change-log.md](docs/change-log.md) | How each pull request records what changed, and how to list changes for a release |
| [docs/cms-testing.md](docs/cms-testing.md) | The page-editor test plan, for picking a test to write |
| [docs/repository-settings.md](docs/repository-settings.md) | GitHub rules that live in settings, not files (only the owner can change them) |
| [docs/supabase-upgrade.md](docs/supabase-upgrade.md) | A draft comparing the Supabase Free and Pro plans |
| [docs/Website-Content-Guide.docx](docs/Website-Content-Guide.docx) and [docs/Website-Content-Import.xlsx](docs/Website-Content-Import.xlsx) | Writing and importing page content (Word and Excel files) |

AI assistants read [AGENTS.md](AGENTS.md), which says the same thing as the contributing guide.

## Getting started

Requires **Node.js 22+** and **Git**. There are two ways to run the site:

- **With a local database (recommended).** Everything runs on your computer, with sample content and
  test accounts, so you can edit, sign in as any role and break things safely. Needs **Docker**
  ([setup below](#setting-up-docker)).
- **With the shared hosted dev project.** No Docker, but you share one database with the team
  ([steps below](#using-the-hosted-dev-project-instead)).

### Run it with a local database

1. **Install and start Docker.** See [Setting up Docker](#setting-up-docker) (Docker Desktop on
   Windows and macOS, Docker Engine from the terminal on Linux). Check it with `docker info`; an
   error means Docker isn't running.

2. **Get the code and install its packages:**

   ```bash
   git clone https://github.com/AmatorMatrisDei/CSC-Dept-Website.git
   cd CSC-Dept-Website
   npm install
   ```

   `npm install` downloads the libraries the site is built with.

3. **Start the local database:**

   ```bash
   npm run db:start
   ```

   This starts Supabase (the database, sign-in and file storage) in Docker, builds the tables and
   access rules from `supabase/migrations/`, and fills them with the sample projects, people and test
   accounts from `supabase/seed.sql`. The first run downloads several GB and can take 10 minutes;
   later runs take seconds. When it finishes it prints the local addresses. Leave Docker running.

4. **Create your settings files:**

   ```bash
   npm run setup:local
   ```

   The site and its server-side functions each read a settings file that isn't in git, because real
   ones can hold secrets. This command asks the running database for its local address and
   publishable key and writes them to `.env.local` (read by the site), and copies
   `supabase/functions/.env.example` to `supabase/functions/.env` (read by the edge functions). It
   never overwrites a file you already have, and never reads a secret key. If you already have a
   `.env.local` (for the hosted dev project, say), it prints the two lines to swap in instead. Without
   this step the site has no database to talk to and every page says "Content could not be loaded".

5. **Start the site:**

   ```bash
   npm run dev
   ```

   Open http://localhost:5173. It reloads when you save a file.

6. **Sign in** as `admin@franciscan.edu` with the password `password123`. That account is an admin,
   so you can turn on Edit mode from the bar at the bottom of the page. The other test accounts
   (reviewer, faculty, students) all use the same password and are listed in
   [docs/backend-setup.md](docs/backend-setup.md#1-local-harness-everyone). To make your own sign-up
   an admin, use the SQL under "Make the first admin" in the same file.

**Day to day:** start Docker, then `npm run db:start` and `npm run dev`. After you pull new
migrations, run `npm run db:reset`, which rebuilds the database from the migrations and reloads the
sample data (your local data is wiped, which is fine). `npm run db:stop` stops the database and keeps
its data.

Also running locally: Studio, a web view of the database, at http://127.0.0.1:54323, and Mailpit,
where the emails the site "sends" land, at http://127.0.0.1:54324.

**If pages say "Content could not be loaded":**

| Check | Fix |
| --- | --- |
| Is the database running? `npx supabase status` | Start Docker, then `npm run db:start` |
| Does `.env.local` hold `http://127.0.0.1:54321` and the key from `npx supabase status`? | Delete `.env.local` and run `npm run setup:local`, then restart `npm run dev` (it reads the file only at startup) |
| Did you pull new migrations? | `npm run db:reset` |

What doesn't work out of the box:

- **The edge functions** (the carousel's daily pick, reviewer messages, email verification, password
  reset) aren't started by `db:start`. Run `npm run functions:serve` in a second terminal to
  try them.
- **Email verification and password reset** go through Google Firebase, so they answer
  "unavailable" locally. You can still sign up and sign in, because local sign-up needs no email
  confirmation.

### Using the hosted dev project instead

```bash
npm install
cp .env.example .env.local   # then fill in the two values below
npm run dev                  # the site at http://localhost:5173
```

In `.env.local`, set `VITE_SUPABASE_URL` to `https://zekufoxhojjqqbmcxmtu.supabase.co` and
`VITE_SUPABASE_PUBLISHABLE_KEY` to its publishable key from the Supabase dashboard (Project Settings
> API Keys). Never put the secret key (`sb_secret_...`) in `.env.local` or anywhere in the site's code.

### Setting up Docker

The local database (`npm run db:start`) runs in Docker. You only need it for database work; the
hosted dev project needs no Docker (see above). Check it first:

```bash
docker info          # prints details if Docker is running; an error means it isn't
```

**Windows and macOS:** install [Docker Desktop](https://docs.docker.com/desktop/), start it, and
wait for it to say it is running. On Windows, turn on the WSL 2 backend (Settings > General).

**Linux:** you don't need Docker Desktop. Install Docker Engine for your distribution by following
[the official steps](https://docs.docker.com/engine/install/), then:

```bash
sudo systemctl enable --now docker    # start Docker now and at every boot
sudo usermod -aG docker "$USER"       # run docker without sudo
```

Log out and back in (or run `newgrp docker`) so the group change applies, then check it:

```bash
docker run --rm hello-world
```

Then `npm run db:start` works as above. The first start downloads several GB of images and can
take 10 minutes. To stop the local database, run `npm run db:stop`.

If it fails:

| You see | Try |
| --- | --- |
| `permission denied` on `/var/run/docker.sock` | You aren't in the `docker` group yet; do the `usermod` step and log in again |
| `Cannot connect to the Docker daemon` | Start Docker (`sudo systemctl start docker`, or open Docker Desktop) |
| A port is already in use (54321 to 54324) | Another local database is running; stop it, or run `npm run db:stop` and start again |

More about the local database, its test accounts and resetting it:
[docs/backend-setup.md](docs/backend-setup.md#1-local-harness-everyone).

| Command | Does |
| --- | --- |
| `npm run dev` | Run the site with live reload |
| `npm run build` | Type-check and build the site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Lint the site's code |
| `npm run db:start`, `db:test`, `test:api`, … | The backend harness; see [docs/backend-setup.md](docs/backend-setup.md) |
| `npm run test:e2e` | The student forms and review queue in Chrome, against the local stack; see [docs/testing.md](docs/testing.md) |
| `npm run icons` | Remake `public/favicon.ico` and `apple-touch-icon.png` from `public/favicon.svg`, in Chrome |
| `npm run setup:local` | After `db:start`: create `.env.local` and `supabase/functions/.env` for the local database |
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
