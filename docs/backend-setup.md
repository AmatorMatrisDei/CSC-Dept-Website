# Backend setup (Supabase)

The backend is Supabase: a Postgres database with access rules, Supabase Auth for logins,
Supabase Storage for photos, and Edge Functions for the carousel, reviewer notices, email
verification and password resets. Everything about it lives in
`supabase/` and is applied from git, so each hosted database matches the repository. The design
follows the Requirements and Team Guide v1.4; requirement IDs such as FR-3.4 refer to it.

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | The schema, access rules, review queue and carousel tables, in order |
| `supabase/functions/carousel/` | The Edge Function that picks the daily carousel |
| `supabase/functions/_shared/carousel-pick.ts` | The pick itself, owned by the Algorithms team |
| `supabase/functions/verify-email/`, `password-reset/` | Email verification and forgotten passwords, through Google Firebase |
| `supabase/functions/_shared/account-email.ts` | How those two work, step by step, with their unit tests beside it |
| `supabase/functions/_shared/turnstile.ts` | Checks the CAPTCHA token on the password-reset form |
| `supabase/seed.sql` | Test accounts and sample content, **local only** |
| `supabase/dev-content.sql` | Sample content for the hosted dev project, without sign-in accounts (see 3.5) |
| `supabase/config.toml` | Settings for the local stack (ports, auth, hooks, functions) |
| `supabase/tests/` | Database tests (pgTAP) and end-to-end API tests |
| `src/lib/database.types.ts` | TypeScript types generated from the schema, for the frontend |

How to run the tests is in [testing.md](testing.md).

## What the database holds

Names follow the guide (section 3) where SQL allows.

| Table | Guide name | Holds |
| --- | --- | --- |
| `profiles` | Student | One per account: name, `slug` for URLs, role, background, major, class year, skills, club roles, photo, contact email and phone, `visible` (listed in the directory) |
| `listed_students` (view) | Student directory | The students the public may see: approved and consenting. Use it for every public page, even when someone is signed in |
| `consents` | Consent | A student's permission per scope: `directory`, `photo`, `email`, `phone`. Append-only |
| `faculty` | Faculty | Professors, with a `slug` for URLs, linked to the projects they advise. `profile_id` links one to their login if they have one |
| `projects` | Project | Title, summary, description (Markdown), status, category, sub-department, dates, priority (1–10), pinned, thumbnail with required alt text, links, contact, open to contributors, published |
| `contributions` | Contribution | A student (or an outside person's name) on a project, with role, term, and whether they confirmed |
| `advising` | Advising | Faculty advisor ↔ project |
| `project_images` | images[] | Project photos in order, each with required alt text |
| `organizations`, `project_organizations` | Organization | Grants and partner organizations, and the projects they're on |
| `sub_departments`, `categories` | SubDepartment, category tree | Admin-managed lists. Categories can nest (`parent_id`) |
| `internships`, `alumni_stories` | Internship, AlumniStory | `alumni_stories.job_title` is the guide's `current_role`, a reserved word in SQL |
| `pending_changes` | PendingChange | Student submissions waiting for review |
| `audit_log` | AuditLog | Approvals, rejections, removals, re-shuffles and role changes. Append-only |
| `monthly_pool`, `daily_carousel`, `carousel_state` | MonthlyPool, DailyCarousel | The carousel's input and output |
| `posts` | (not in the guide) | Department news, kept by team decision |
| `planner_catalogs` | (not in the guide) | Degree planner: one row per catalog year (`2025-2026`), the year a student started |
| `planner_courses`, `planner_degrees` | (not in the guide) | Each catalog year's courses (credits, prerequisites, when offered) and programs (majors, pre-engineering, minors: requirements, notes, suggested semesters). Admin-edited |
| `planner_plans` | (not in the guide) | A signed-in person's own planner: their catalog year, program, completed courses and plans. Private to them |

Who can do what:

| | Visitors | Students | Reviewers (TA) | Admins |
| --- | --- | --- | --- | --- |
| See published projects, posts, faculty, alumni stories | ✓ | ✓ | ✓ | ✓ |
| See student profiles | listed ones | listed ones and their own | all | all |
| Grant or revoke their own consent | | ✓ | ✓ | ✓ |
| Submit profile, project and internship changes | | ✓ | ✓ | ✓ |
| Confirm or decline being listed on a project | | ✓ | ✓ | ✓ |
| Approve, reject or send back submissions (their own too, logged as self-reviews) | | | ✓ | ✓ |
| Edit anything directly, set priority and pins, publish | | | | ✓ |
| Manage faculty, sub-departments, categories, monthly pool | | | | ✓ |
| Change roles, re-shuffle the carousel | | | | ✓ |

### Privacy rules the database enforces

- **Sign-up** is limited to `franciscan.edu` and its subdomains, such as `student.franciscan.edu`
  (`private.allowed_email_domains`).
- **A student is public only when listed:** `visible` (a reviewer approved their request to be
  added) **and** an active `directory` consent. Withdrawing that consent hides them at once.
  `listed_students` applies this rule for everyone, including signed-in reviewers, who can see
  every profile in `profiles`.
- **Slugs** (`faculty.slug`, `profiles.slug`) are made from the name when the row is created,
  numbered if taken (`dr-ada-lovelace-2`). Admins may change them; students can't.
- **Photo, email and phone** are only stored on the profile while the matching consent is
  active. Revoking a consent clears the field, so a hidden field can't leak through any query.
- **On projects**, visitors only see students who are listed and who confirmed being on that
  project. Unlisted or unconfirmed students are left out of the results, not just hidden by
  the site.
- **Photos** go in the public `media` bucket. Users upload to `avatars/<their id>/` and
  `submissions/<their id>/`; other folders are for admins. JPEG, PNG and WebP, 5 MB maximum.
  Anyone with a file's URL can load it, including photos in submissions not yet approved.
  Moving pending uploads to a private bucket is an open item.
- **Links** (website, GitHub, LinkedIn, repo, demo, poster, organization) must start with
  `https://`, so no `javascript:` links can be stored. Emails and phone numbers must be
  well-formed. Text fields have length limits, such as 200 characters for a title and 20,000 for
  a description.

### Security model

- **Row level security** is on for every table, and a test fails if a new table skips it.
  Visitors can't write anything.
- **Internal functions** in the `private` schema can only be called by the database itself,
  except the small set of helpers the access rules need. A test fails if that list grows by
  accident. New functions are private by default, so a new RPC for the site needs an explicit
  `grant execute`.
- **Two functions run with the owner's rights on purpose:** `review_change` and
  `respond_to_listing`. Each checks its caller (reviewers and admins only, including for their own
  submissions, which the audit log marks as self-reviews; only your own listing). The Supabase Security Advisor flags them as warnings, which is expected.
- **The carousel function** accepts browser calls only from `CAROUSEL_ALLOWED_ORIGINS`, checks the
  cron secret in constant time, and never returns database error details.
- **Unverified accounts** can't submit, give permissions, confirm listings, or use a reviewer or
  admin role (next section). The helpers the verification functions use can only be called with
  the secret key, and a test fails if that changes.

### How a submission works (guide 2.4)

Students never change live data. They insert a row into `pending_changes`, and a reviewer approves
it with `review_change`, which applies it. The table of submission types is at the top of
`supabase/migrations/*_review_queue.sql`. In short:

| target_type | action | Means |
| --- | --- | --- |
| `profile` | `create` | Request to be added to the directory (needs `directory` consent first) |
| `profile` | `update` | Edit my profile |
| `profile` | `delete` | Remove me. Hidden immediately; approval clears the profile, listings and consents |
| `project` | `create` / `update` / `delete` | A project, with optional `members`, `advisor_ids`, `organization_ids` and `images` |
| `internship` | `create` / `update` / `delete` | My internships |

Approved projects are published and credited to the submitter. Other students they listed must
confirm with `respond_to_listing` before their names appear (FR-3.7).

A submission waiting for review can't be edited, so a reviewer always approves exactly what they
saw. To change it, withdraw it and submit again, or wait until a reviewer sends it back, then edit
and resubmit. Each student can have at most 20 submissions open, and each is limited to 64 KB.

### The carousel (guide section 4)

- An admin fills `monthly_pool` for the month. If the pool is empty, the 15 most recently updated
  published projects are used.
- Every hour, a scheduled job calls the `carousel` Edge Function. The first call after midnight
  Eastern picks the day's 5–7 projects and saves them; later calls that day do nothing.
- The admin panel's Re-shuffle button calls the same function, which picks again.
- The pick is `pickCarousel()` in `supabase/functions/_shared/carousel-pick.ts`, owned by the
  Algorithms team. Until they replace it, a placeholder takes pinned projects, then the highest
  priority. Its seed is `"<day>:<re-shuffle count>"`.
- The home page reads the `carousel_today` view: the day's cards in order, with members and
  advisors.

### Reviewer notifications (#54)

- **On the site:** reviewers and admins see how many submissions are waiting, in a bar under the
  header and as a count on **My account**. The site reads the queue itself (`countWaiting()` in
  `src/lib/review.ts`) on every page change, when the tab comes back into view, and every two
  minutes.
- **In chat:** a trigger on `pending_changes` calls the `notify-reviewers` Edge Function for each
  new submission and each resubmission after changes were requested. Decisions and withdrawals
  send nothing. The function posts through a GroupMe bot, or a Discord webhook if one is set.
  Messages say what kind of submission it is and its project or internship title, with a link to
  its review page, and never who sent it (`supabase/functions/_shared/review-message.ts`).
- pg_net sends the request after the submission commits, so a slow or failing chat never holds
  up a submission. Until the secrets in 3.3, step 7, are set, nothing is sent.

### Account verification

Sign-ups are confirmed at once, so an account's address is only proven once it's **verified**:
by "Continue with Google" or "Continue with GitHub", by a link that the `verify-email` function
has Google Firebase email (it usually lands in Junk), or by hand:

```sql
select public.mark_account_verified('<account id>', 'admin');
```

Until then the account can browse and plan, but the database refuses its submissions,
permissions, listing confirmations and reviews. Reviewers and admins who existed before the
migration were marked verified by it. Changing an account's address needs a Franciscan address
and a new verification. Forgotten passwords go through Firebase too
(`password-reset`), because Supabase's own emails can't reach students. The full story, including
the safeguard for Google and GitHub sign-ins, is in
[backend-explained.md](backend-explained.md), section 3.4. Setup is 3.3, step 10.

### The degree planner

- Courses, credits and requirements follow the catalog of the academic year a student started
  in, so each catalog year (`planner_catalogs`) has its own copy of every course and program. A
  spring start follows the catalog from the fall before it (spring 2025 uses 2024-2025); the
  planner then begins in that spring, with the catalog's fall-start plan from the next fall. A course is
  keyed by `(catalog_year, id)`, and its prerequisites name courses of the same year. Editing a
  course or a suggested plan changes that year only.
- The 2022-2023 through 2026-2027 undergraduate catalogs were loaded from
  franciscan.smartcatalogiq.com by migration `20261016000000_planner_catalog_years.sql`: the
  department's majors, minors and pre-engineering transfer programs (one program per track where
  the second year differs by discipline), each with the catalog's own semester plan.
- A program's `requirements` list what it requires: each item is met by all the courses of any
  one of its `options`, and an item with only a `label` (an elective, a core area) is left to the
  student. The planner checks a student's plan against them.
- `planner_catalog_issues()` lists problems in the suggested plans of every year: a course before
  its prerequisites, a corequisite not alongside, a course in a term or year (odd/even) it isn't
  offered, a semester over 18 credits. Most of what it reports today is in the catalogs'
  own plans (the pre-engineering plans list CSC 144 without its lab, CSC 142, for example), which
  faculty may want to look at.
- To add a catalog year: insert its `planner_catalogs` row, then its courses, then its programs,
  in one migration (the course checks run at the end of the transaction, so courses can name each
  other in any order).

## 1. Local harness (everyone)

You need:

- **Node.js 22 or later**
- **Docker Desktop**, running. On Windows, turn on the WSL 2 backend (Docker Desktop >
  Settings > General).
- Git

Then, from the repository root:

```bash
npm install
npm run db:start
```

The first start downloads several GB of Docker images and can take 10 minutes. Later starts take
seconds. When it finishes you have:

| | |
| --- | --- |
| API (Auth, Data API, Storage, Functions) | http://127.0.0.1:54321 |
| Studio, a web UI for the database | http://127.0.0.1:54323 |
| Mailpit, where local "sent" emails land | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`npx supabase status` prints these again, with the local keys.

**Test accounts** (password `password123` for all):

| Email | Role |
| --- | --- |
| `admin@franciscan.edu` | admin |
| `reviewer@franciscan.edu` | reviewer (TA) |
| `faculty@franciscan.edu` | reviewer, linked to the faculty record "Dr. Pat Faculty" |
| `student1@franciscan.edu` | student, listed, shows an email address |
| `student2@franciscan.edu` | student, not listed; has asked to be added |
| `student3@student.franciscan.edu` | student, listed |

The seed also has six projects across all four sub-departments, a partner organization, an
alumni story, this month's pool, today's carousel, and three submissions waiting for review.

**Frontend settings** for local development, in `.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=   # "Publishable" key from `npx supabase status`
```

For the hosted dev project, use its URL (`https://zekufoxhojjqqbmcxmtu.supabase.co`) and its
publishable key from the dashboard instead.

Everyday commands:

| Command | Does |
| --- | --- |
| `npm run db:start` / `npm run db:stop` | Start or stop the local stack. Data survives a stop |
| `npm run db:reset` | Rebuild the database from the migrations and seed. Run it after pulling new migrations |
| `npm run functions:serve` | Run the carousel function locally (copy `supabase/functions/.env.example` to `.env` first) |
| `npm run db:test` | Lint the schema and run the database tests |
| `npm run test:api` | Run the end-to-end tests |
| `npm run test:carousel` | Run the carousel pick's tests |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` |

After changing `supabase/config.toml`, run `npm run db:stop` then `npm run db:start`.
`db:reset` does not reload it.

## 2. Changing the database

All schema changes go through migration files. Don't create or change tables in a hosted
project's Table Editor or SQL editor: that change is not in git, the next deploy will not know
about it, and it can make the deploy fail.

1. Create a migration file:

   ```bash
   npx supabase migration new add_events
   ```

2. Write the SQL in the new file under `supabase/migrations/`. For a new table:
   - turn on row level security (`alter table ... enable row level security`)
   - grant only what's needed, following the grants in the existing migrations
   - add policies for each operation
   - add tests; `01_schema.test.sql` already fails if a table has no row level security

3. Apply it locally and test:

   ```bash
   npm run db:reset
   npm run db:test
   npm run test:api
   ```

4. Regenerate the types and commit them with the migration:

   ```bash
   npm run db:types
   ```

5. Open a pull request. CI runs the same tests. Merging deploys it to production (section 3.1).

Never edit a migration that has already been merged. Write a new one that changes what you need.

## 3. Hosted projects (backend pair)

Both are in the Supabase organization **Franciscan Computing and Engineering Dept Site** (Free
plan):

| Project | Ref | Use |
| --- | --- | --- |
| **Franciscan Site** | `rhvvvurfpzblbpsipgen` | Production |
| **Franciscan Site Dev** | `zekufoxhojjqqbmcxmtu` | Shared development: frontend work without Docker, and PR previews, so previews never touch production |

Give the professor (or whoever will own the site after this semester) Owner access to the
organization, and keep both database passwords in a shared password manager. Frontend teammates
who need the dev dashboard can be invited with the Developer role.

### 3.1 Connect GitHub

Supabase dashboard > Project Settings > Integrations > GitHub, on each project:

| Setting | Value |
| --- | --- |
| GitHub repository | `AmatorMatrisDei/CSC-Dept-Website`, the shared repository, not a fork |
| Working directory | `.` |
| Deploy to production | On |
| Production branch name | `main` on Franciscan Site, `staging` on Franciscan Site Dev |

Connecting the shared repository requires its owner to approve the Supabase GitHub app. Connecting
a fork does not work: the integration deploys when a pull request is merged in the connected
repository, and syncing a fork does not count.

So **merging into `staging` updates the dev project, and merging into `main` updates
production**, matching the branch workflow in the README. Production has followed `main` since
October 15, 2026; dev follows `staging`.

On each merge, the integration applies new migrations and deploys the Edge Functions
declared in `config.toml` (`carousel`). It ignores `seed.sql` and the Auth and API settings in
`config.toml` (there is no `[remotes]` block), so the local test accounts and localhost URLs
never reach a hosted project. After a merge, check that the change arrived (Database >
Migrations lists the applied versions). If it didn't, deploy by hand as in 3.2.

### 3.2 Deploying by hand

Only to recover when the integration's deploy didn't arrive. Don't push an unmerged branch's
migrations to dev: the integration then stops deploying to dev until that branch is merged (see
"How changes go live" in the README).

```bash
npx supabase login                              # opens a browser; run it in your own terminal
npx supabase link --project-ref <project ref>   # see the table above
npx supabase db push --dry-run                  # lists the migrations it would apply
npx supabase db push
npx supabase functions deploy carousel
```

Run it from an up-to-date `main`: `db push` sends every migration in your working folder,
including ones on an unmerged branch. `cat supabase/.temp/project-ref` shows which project you're
linked to.

`link` and `push` connect to the database on port 5432 with encryption. Some campus and public
networks block that, and the commands then fail with `ECONNRESET` or `SSL SYSCALL error`. Use
another network, such as a phone hotspot. The dashboard, GitHub and the local stack are not
affected.

### 3.3 After the first deploy, on each project

1. **Turn on the sign-up rule.** Authentication > Hooks > add **Before User Created** > Postgres
   function > `public.hook_before_user_created`. Without this, anyone can sign up.
2. **URLs.** Authentication > URL Configuration:
   - Site URL: the site's address (production), or `http://localhost:5173` (dev).
   - Redirect URLs: `http://localhost:5173/**`, `http://localhost:4173/**`,
     `https://csc-dept-website.pages.dev/**`, and a wildcard for preview deployments,
     `https://*.csc-dept-website.pages.dev/**`. Google and GitHub sign-in come back to
     `/account/sign-in`, so it must be allowed.
3. **Passwords and email.** Authentication > Sign In / Providers > Email: minimum password
   length 8, and **"Confirm email" off**. Supabase's own emails can't reach students, so
   verification (step 10) takes the place of confirmation.
4. **Email delivery.** Supabase's built-in email only reaches members of the Supabase
   organization, about two messages an hour. Verification and password resets don't need it:
   Google Firebase sends those (step 10). Emails to students for FR-3.6 notifications would still
   need custom SMTP (Authentication > Emails > SMTP Settings).
5. **Password for the read-only login** (only needed if server-side code reads through
   Hyperdrive; the Vite site doesn't). In the SQL editor, with a long random password that you
   then store in the password manager:

   ```sql
   alter role web_reader with login password '<long random password>';
   ```

6. **The carousel function.** Deploy it, give it a secret, and tell the hourly job where it is:

   ```bash
   npx supabase functions deploy carousel
   npx supabase secrets set CAROUSEL_CRON_SECRET=<long random value>
   npx supabase secrets set CAROUSEL_ALLOWED_ORIGINS=https://<site>,https://*.csc-dept-website.pages.dev
   ```

   On dev, also allow `http://localhost:5173` so the admin panel works from a laptop.

   Then in the SQL editor, with the same secret:

   ```sql
   select vault.create_secret('https://<project ref>.supabase.co/functions/v1/carousel', 'carousel_function_url');
   select vault.create_secret('<the same long random value>', 'carousel_cron_secret');
   ```

   Until both Vault secrets exist, the hourly job does nothing.
7. **Reviewer notifications.** Messages go to a GroupMe group's main chat; bots can't post into
   a topic. Make a group for the reviewers if there isn't one, then at
   https://dev.groupme.com/bots choose **Create Bot**, pick that group, name it (for example
   "Site reviews") and leave the callback URL empty. Keep its **Bot ID** secret: anyone with it
   can post as the bot. Then, with `SITE_URL` the site this project serves (the developer site
   on dev, the live site on production):

   ```bash
   npx supabase functions deploy notify-reviewers
   npx supabase secrets set NOTIFY_SECRET=<long random value> SITE_URL=https://<site> GROUPME_BOT_ID=<bot id>
   ```

   For a Discord channel instead of, or as well as, GroupMe, also set `DISCORD_WEBHOOK_URL`
   (channel settings > Integrations > Webhooks). Then in the SQL editor, with the same secret:

   ```sql
   select vault.create_secret('https://<project ref>.supabase.co/functions/v1/notify-reviewers', 'notify_function_url');
   select vault.create_secret('<the same long random value>', 'notify_secret');
   ```

   Until both Vault secrets exist, nothing is sent. To check it, submit something from a test
   account and look for the message; the function's logs are under Edge Functions >
   notify-reviewers > Logs.
8. **Make the first admin.** Sign up on the site (or Authentication > Users > Add user), then in
   the SQL editor (only verified accounts can be admins):

   ```sql
   select public.mark_account_verified(id, 'admin') from auth.users where email = 'you@franciscan.edu';
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@franciscan.edu');
   ```

   After that, admins change roles from the site's admin screens.
9. **Keep-alive** (production). Free projects pause after a week without activity. In GitHub,
   shared repository > Settings > Secrets and variables > Actions > **Variables**, add
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The "Keep Supabase awake" workflow then reads
   one row every three days. If a project pauses anyway, restore it from the dashboard; no data
   is lost.
10. **Verification and password resets.** Everything below belongs to the team's shared Google
    account (franciscan.eac@gmail.com), never a personal one.
    - **Firebase:** in a Firebase project (console.firebase.google.com), Authentication > Sign-in
      method > enable **Email/Password**. Its emails come from
      `noreply@<firebase project>.firebaseapp.com`. Production should have its own Firebase
      project, so an email in flight on dev can't block the same address on production.
    - **Secrets** (the web API key is under Project settings > General; it isn't secret, but each
      project should name its own):

      ```bash
      npx supabase secrets set FIREBASE_API_KEY=<web API key> FIREBASE_LINK_SECRET=<long random value>
      npx supabase secrets set ALLOWED_ORIGINS=https://<site>,https://*.csc-dept-website.pages.dev
      ```

      On dev, also allow `http://localhost:5173`. Never change `FIREBASE_LINK_SECRET` once set:
      emails already sent would stop working. The integration deploys both functions on merge
      (they're declared in `config.toml`); by hand, `npx supabase functions deploy verify-email
      password-reset`.
    - **Google:** Google Auth Platform (console.cloud.google.com, the Firebase project's Google
      Cloud project) > Clients > a Web client with the redirect URI
      `https://<project ref>.supabase.co/auth/v1/callback`. Branding needs the site's home,
      privacy (`/privacy`) and terms (`/terms`) pages before **Publish app**; until then only
      listed test users can use it. Don't upload a logo, which needs Google's review.
    - **GitHub:** the shared account's GitHub > Settings > Developer settings > OAuth Apps, with
      the same callback URL.
    - **Supabase:** Authentication > Sign In / Providers > Google and GitHub: paste each client
      ID and secret.
    - **Check it:** sign up with a test address, press "Send the email" on `/account/verify`,
      and look in that inbox's Junk folder.
11. **CAPTCHA (Cloudflare Turnstile).** Sam owns the Turnstile widget, in Sam's Cloudflare account.
    It protects sign-up, password sign-in and both steps of a password reset. **Do these in order:
    turning on Supabase's check before the site sends tokens locks everyone out of signing in.**
    1. **Sam:** Cloudflare dashboard > Turnstile > **Add widget**. Name it "EAC Website", add the
       hostname `csc-dept-website.pages.dev` (its subdomains, `staging.` and the previews, are
       covered), and choose **Managed**. It shows a **site key** (public) and a **secret key**
       (private: share it only through a password manager or by entering it yourself, never in
       chat or git).
    2. **Site key → Cloudflare Pages:** in the Pages project, Settings > Variables and Secrets, add
       `VITE_TURNSTILE_SITE_KEY` to **Preview** and **Production**, then redeploy (Vite builds the
       key into the site, so it takes effect on the next build).
    3. **Secret key → our function:**

       ```bash
       npx supabase secrets set TURNSTILE_SECRET_KEY=<secret key> --project-ref <project ref>
       ```

    4. **Check the site:** on the deployed sign-in page, the check appears above the button, and
       the button turns on once it passes.
    5. **Secret key → Supabase Auth, last:** Authentication > Attack Protection > **Enable Captcha
       protection**, provider Turnstile, paste the secret key. From then on Supabase refuses
       sign-ups and password sign-ins without a token. (Google and GitHub sign-in aren't affected.)

    Undo in reverse order: turn Supabase's check off before removing the site key.

### 3.4 Keys

Project Settings > API Keys:

| Key | Where it goes |
| --- | --- |
| Project URL and **publishable** key (`sb_publishable_...`) | Frontend environment variables. Safe to expose: the access rules protect the data |
| **Secret** key (`sb_secret_...`) | Nowhere in the frontend or git. Only trusted server code or admin scripts |

### 3.5 Sample content on dev

`supabase/dev-content.sql` loads made-up projects, faculty, students, posts and a few
submissions waiting for review into the dev project, and picks the day's carousel from them. The
students are fake `@sample.invalid` accounts with random passwords, so nobody can sign in as them;
sign up with your own university address to try signed-in features. With the repo linked to dev:

```bash
npx supabase db query --linked -f supabase/dev-content.sql
```

It refuses to run on production, or when the content is already there.

## 4. Using the backend from the frontend

Use `@supabase/supabase-js` with the project URL and publishable key. Every request carries the
signed-in user's session (or none), and the access rules decide what it may see and do.

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./lib/database.types";

const supabase = createClient<Database>(url, publishableKey);

// Home page: today's carousel, in order (FR-5.8)
const { data: cards } = await supabase.from("carousel_today").select("*");

// Public pages filter for public rows themselves: a signed-in reviewer or admin can read drafts,
// unlisted students and unconfirmed listings, which the public site must not show.

// Project browser: published projects in a sub-department, newest first (FR-4.4, FR-4.5),
// with confirmed members named only if they are listed students
const { data: projects } = await supabase
  .from("projects")
  .select(`slug, title, summary, status, thumbnail_path, thumbnail_alt, sub_departments(name),
    advising(faculty(slug, name)),
    contributions(role, external_name, sort_order, listed_students(slug, name))`)
  .eq("published", true)
  .eq("contributions.confirmed", true)
  .eq("sub_department_id", subDepartmentId)
  .order("date_started", { ascending: false });
// A contribution with neither listed_students nor external_name is an unlisted student: skip it.

// Student directory and profile pages (FR-2.1, FR-2.2)
const { data: students } = await supabase.from("listed_students").select("*").order("name");
const { data: student } = await supabase.from("listed_students").select("*").eq("slug", slug).maybeSingle();

// Title and keyword search (FR-4.3)
await supabase.from("projects").select("slug, title").textSearch("search", query, { type: "websearch" });

// A student asks to be added (FR-3.1): consent first, then the request
await supabase.from("consents").insert({ scope: "directory" });
await supabase.from("pending_changes").insert({
  target_type: "profile", action: "create", proposed_data: { headline, background, major, class_year },
});

// A reviewer works the queue (FR-3.4, FR-3.5)
const { data: queue } = await supabase.from("pending_changes").select("*").eq("status", "pending");
await supabase.rpc("review_change", { change_id, decision: "approved" });
await supabase.rpc("review_change", { change_id, decision: "changes_requested", note: "Add alt text" });

// A student confirms being listed on a project (FR-3.7)
await supabase.rpc("respond_to_listing", { listing_id, accept: true });

// An admin re-shuffles the carousel (FR-5.7)
await supabase.functions.invoke("carousel", { body: { action: "reshuffle" } });
```

- **Images:** a file's public address is
  `<SUPABASE_URL>/storage/v1/object/public/media/<path>`. Students upload to
  `submissions/<their id>/` and put the path in their submission. Resize photos in the browser
  before uploading (about 2000px on the long side): the Free plan has 1 GB of file storage in
  total and no image resizing.
- **Markdown:** `projects.description`, `posts.body` and `alumni_stories.story` are Markdown.
  Render them without allowing raw HTML.
- **Server-side reads:** the Vite site has none; it calls Supabase from the browser. The
  `web_reader` login stays in the schema in case server code is added later (for example a
  Cloudflare Worker through Hyperdrive). It is a member of `anon`, so it sees exactly what a
  visitor sees and cannot write. Never connect server code as `postgres`, which bypasses every
  access rule.

## 5. Open items

| Item | Owner |
| --- | --- |
| Email to students for FR-3.6 notifications needs SMTP (3.3, step 4). Verification and resets are done (step 10) | Back End |
| Verification emails land in Junk at franciscan.edu, and Firebase's email wording can't be edited on our project yet | Back End |
| Which fields are FERPA directory information | Registrar |
| Pending uploads are readable by URL before approval; move them to a private bucket | Back End |
| Guide clarifications: thumbnail field vs first gallery image; whether Internships and Alumni Stories are project categories; pinned cap (target size or 7); who confirms a removal (assumed: the reviewer who approves it) | Requirements team |
| Replace the placeholder carousel pick | Algorithms team |
| Sign-in settings on production: minimum password 8 with letters and digits; Cloudflare Turnstile on sign-up; two-factor sign-in required for reviewers and admins once the admin panel supports enrolling | Back End + Front End |
| Account email changes are now held to the university-domain rule and need verifying again. Alumni with personal addresses (#76) will need their own route, with an admin confirming they studied here | Team |
| CAPTCHA keys: the Turnstile code is in, but each project needs its keys (3.3, step 11). Until then someone who knows a classmate's address can use up that account's daily reset emails | Sam (Turnstile owner) + Back End |

## 6. Free plan limits

| Limit | What to do |
| --- | --- |
| Pauses after a week without activity | The keep-alive workflow |
| 500 MB database, 1 GB file storage | Resize photos before upload |
| No automatic backups | Before launch, ask the department about the Pro plan |
| Built-in email only reaches organization members | Microsoft sign-in or custom SMTP (3.3, step 4) |
| Two active free projects | Production and dev use both |

Check current limits at https://supabase.com/pricing before relying on them.
