# How the backend works

This explains, with the real code, how Supabase runs the website's backend: accounts and
passwords, email verification, the tables and their access rules, the review queue, photo
storage, the carousel, the GroupMe notices, the GitHub workflow, and the tests. Everything here
was checked against the `staging` branch and its database on 2026-10-19; account verification
(3.4) was added on 2026-10-20.

Contents:

1. [The big picture](#1-the-big-picture)
2. [How the website talks to Supabase (GET, POST, PATCH, DELETE)](#2-how-the-website-talks-to-supabase)
3. [Accounts: email restriction, passwords, roles, verification](#3-accounts)
4. [The 30 tables](#4-the-30-tables)
5. [The 57 access rules](#5-the-57-access-rules)
6. [The review queue](#6-the-review-queue)
7. [Photo storage](#7-photo-storage)
8. [The hourly carousel](#8-the-hourly-carousel)
9. [GroupMe notifications](#9-groupme-notifications)
10. [The GitHub workflow, end to end](#10-the-github-workflow-end-to-end)
11. [The tests](#11-the-tests)
12. [Known gaps](#12-known-gaps)

---

## 1. The big picture

```
  Browser (React site on Cloudflare Pages)
     │  HTTPS, with the publishable key and, once signed in, the user's access token
     ▼
  Supabase project ─────────────────────────────────────────────────────────────
     Auth      sign-up, sign-in (password, Google, GitHub), access tokens
     Data API  turns HTTP requests into SQL (PostgREST)
     Postgres  30 tables, 57 access rules, triggers, functions
     Storage   the "media" photo bucket
     Edge Functions   carousel, notify-reviewers, verify-email, password-reset
     pg_cron + pg_net the hourly timer, and calls from the database to the functions
  ──────────────────────────────────────────────────────────────────────────────
     │                        │                               │
     ▼                        ▼                               ▼
  GroupMe (bot posts)    Google Firebase (sends the     GitHub (migrations and
                         verification and reset emails)  functions deploy from here)
```

There is no server of our own. The browser talks to Supabase directly. That is safe only because
the database checks every request itself, in four layers:

| Layer | What it decides | Example |
| --- | --- | --- |
| **Grants** | Which tables and columns a role may touch at all | Visitors (`anon`) may only `SELECT`; nobody but the system can `INSERT` into `profiles` |
| **Row-level security (RLS) rules** | Which *rows* a person may read or change | A visitor sees a project only if it is published |
| **Triggers** | Business rules on every write | A submission waiting for review can only be withdrawn, not edited |
| **Functions** (`security definer`) | The few privileged actions, done one controlled way | `review_change()` is the only way a submission goes live |

Every Supabase request runs as one of three database roles: `anon` (a visitor),
`authenticated` (anyone signed in), or `service_role` (the secret key, which skips RLS and is
only used by our Edge Functions and by the backend pair from the command line).

---

## 2. How the website talks to Supabase

Yes, it is all plain HTTP: `GET`, `POST`, `PATCH`, `PUT` and `DELETE`. The site uses the
`supabase-js` library, which builds these requests. Every request carries two headers:

```
apikey: sb_publishable_...            ← identifies the project; safe to be public
Authorization: Bearer <access token>  ← only when signed in; says who the user is
```

Supabase checks the access token's signature. Inside the database, `auth.uid()` returns the
signed-in user's id from that token. Every access rule below is written in terms of `auth.uid()`.

| What the site does | supabase-js call (our code) | HTTP request it sends |
| --- | --- | --- |
| Read published projects | `client.from("projects").select("title, slug")` | `GET /rest/v1/projects?select=title,slug` |
| Sign up | `client.auth.signUp({ email, password })` (`src/lib/auth.ts`) | `POST /auth/v1/signup` |
| Sign in | `client.auth.signInWithPassword(...)` | `POST /auth/v1/token?grant_type=password` |
| Continue with Google or GitHub | `client.auth.signInWithOAuth({ provider })` | the browser goes to `GET /auth/v1/authorize?provider=google`, then Google, then back |
| Verify the email address | `sendVerificationEmail()`, `checkVerificationEmail()` (`src/lib/auth.ts`) | `POST /functions/v1/verify-email` |
| Reset a forgotten password | `sendResetEmail()`, `finishReset()` | `POST /functions/v1/password-reset` |
| Stay signed in | automatic | `POST /auth/v1/token?grant_type=refresh_token` |
| Agree to be listed | `client.from("consents").insert({ scope })` (`src/lib/account.ts`) | `POST /rest/v1/consents` |
| Submit a profile or project | `client.from("pending_changes").insert(...)` | `POST /rest/v1/pending_changes` |
| Withdraw a submission | `.update({ status: "withdrawn" }).eq("id", id)` | `PATCH /rest/v1/pending_changes?id=eq.<id>` |
| Approve or reject (reviewer) | `client.rpc("review_change", {...})` (`src/lib/review.ts`) | `POST /rest/v1/rpc/review_change` |
| Admin edits page text (saved as a draft) | `client.rpc("save_site_draft", { draft_key, draft_value, seen_updated_at })` (`seen_updated_at` lets publishing spot a change made by someone else; a key ending `.items` holds a list) | `POST /rest/v1/rpc/save_site_draft` |
| Admin saves an edit to a project, student or faculty page, or a project's photo list (as a draft) | `client.rpc("save_record_draft", { draft_table, draft_slug, draft_patch, draft_gallery, seen_updated_at })` | `POST /rest/v1/rpc/save_record_draft` |
| Admin publishes drafts (page text and record edits together; returns `conflicts` and `removed_paths`) | `client.rpc("publish_site_drafts")` | `POST /rest/v1/rpc/publish_site_drafts` |
| Admin discards drafts, or puts an earlier version back as a draft | `client.rpc("discard_site_drafts")`, `client.rpc("discard_record_drafts", { only_rows })` (`only_rows`, such as `["projects/campus-robot"]`, undoes just those; `discard_site_drafts({ only_keys })` likewise; returns uploaded photo files nothing uses; `release_draft_files(paths)` does the same check for files the editor dropped), `client.rpc("restore_site_text", { history_id })`, `client.rpc("restore_record_version", { history_id })` | `POST /rest/v1/rpc/discard_site_drafts`, `POST /rest/v1/rpc/restore_site_text` |
| Upload a photo | `client.storage.from("media").upload(path, blob)` | `POST /storage/v1/object/media/<path>` |
| Show a photo | a plain image link | `GET /storage/v1/object/public/media/<path>` |
| Admin re-shuffles the carousel (the function supports it; the admin button isn't built yet) | Edge Function call | `POST /functions/v1/carousel` |

Calls the browser never makes:

- The hourly carousel: `POST /functions/v1/carousel`, sent by the database itself.
- New-submission notices: `POST /functions/v1/notify-reviewers`, sent by the database itself.
- The GroupMe message: `POST https://api.groupme.com/v3/bots/post`, sent by our Edge Function.
- Firebase's email API: `POST https://identitytoolkit.googleapis.com/v1/accounts:…`, sent by the
  verify-email and password-reset functions (section 3.4).
- Cloudflare's Turnstile check: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`,
  sent by Supabase Auth (sign-up, sign-in) and by `password-reset`, with the token the browser got
  from Cloudflare's widget.

The site's security headers (`public/_headers`) also stop the browser from talking to any other
server: `connect-src` lists only our two Supabase projects.

---

## 3. Accounts

### 3.1 How we restrict sign-ups to university email

Supabase Auth calls a database function **before it creates any account**. If the function
returns an error, no account is made. From `supabase/migrations/20261014190100_auth.sql`:

```sql
-- The allowed domains. Subdomains count too, so franciscan.edu also admits student.franciscan.edu.
create table private.allowed_email_domains (
  domain text primary key check (domain = lower(domain))
);
insert into private.allowed_email_domains (domain) values ('franciscan.edu');

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  email_domain text := lower(split_part(event -> 'user' ->> 'email', '@', 2));
begin
  if exists (
    select 1 from private.allowed_email_domains d
    where email_domain = d.domain or email_domain like '%.' || d.domain
  ) then
    return '{}'::jsonb;                       -- allowed: no error
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Please sign up with your Franciscan University email address.'
  ));
end;
$$;

-- Only Supabase Auth may run it; users can't call it.
grant execute on function public.hook_before_user_created to supabase_auth_admin;
revoke execute on function public.hook_before_user_created from authenticated, anon, public;
```

It is switched on in `supabase/config.toml` for the local copy:

```toml
[auth.hook.before_user_created]
enabled = true
uri = "pg-functions://postgres/public/hook_before_user_created"
```

On each hosted project it is switched on in the dashboard (Authentication > Hooks > Before User
Created). Checked on the developer site on 2026-10-19: signing up with an `@example.com` address
returns `403 "Please sign up with your Franciscan University email address."` Because the check
runs inside Supabase, it can't be skipped by calling the API directly. API test 1 checks it on
every pull request.

### 3.2 How passwords are stored

**We never store or see passwords.** Supabase Auth handles them:

1. The browser sends the password once, over HTTPS, to `POST /auth/v1/signup` or
   `/auth/v1/token`.
2. Supabase Auth hashes it with **bcrypt** and stores only the hash, in `auth.users`
   (column `encrypted_password`). That table is in Supabase's own `auth` schema, which our
   website's API can't read. A bcrypt hash can't be turned back into the password; signing in
   hashes the attempt and compares.
3. On success, Auth returns an **access token** (a signed JWT that expires after 1 hour,
   `jwt_expiry = 3600`) and a **refresh token** that is replaced on every use
   (`enable_refresh_token_rotation = true`). The browser sends the access token with each request.
4. Our own tables hold no passwords. `profiles` holds the name and public details; it is linked to
   the account by the same id.

Password rules: the site's forms require at least 8 characters, and local Supabase enforces 8
(`minimum_password_length = 8`), as does dev. Production still enforces only 6 on the server (see
[Known gaps](#12-known-gaps)).

### 3.3 New accounts and roles

A trigger gives every new account a private profile. It starts unlisted and with the role
`student`:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();   -- inserts the profiles row
```

Roles are an enum on `profiles.role`: `student`, `reviewer` (TAs), `faculty`, `admin`. Faculty
can do everything a reviewer can and edit nearly all content; admins also change roles and the
settings that shape the site (planner catalogs, courses and plans, advising, the monthly pool).
Helper functions read the role, and every rule uses them. All also require a verified account
(section 3.4):

```sql
create function private.is_reviewer() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in ('reviewer', 'faculty', 'admin'), false)
    and private.is_verified((select auth.uid()))
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'admin', false)
    and private.is_verified((select auth.uid()))
$$;
-- current_app_role(): select role from public.profiles where id = auth.uid()
-- can_edit_content(): the same check for 'faculty' or 'admin'. Edit mode, the content tables'
-- "Faculty and admins manage ..." rules, photos and the edit audit all ask it.
```

Only admins can change a role (the profiles `UPDATE` rule is admin-only), and only to reviewer, faculty or
admin for a verified account (trigger `require_verified_staff`). Every role change is written to
the audit log. A trigger, `keep_an_admin`, refuses to demote the last admin, so the site can't be
locked out.

### 3.4 Verifying an account's email

**Why.** Sign-ups are confirmed at once, because Supabase's own emails only reach our team. So
until an account is verified, nothing proves the person owns the address they typed. Migration
`20261021100000_account_verification.sql` adds that proof.

**Three ways to verify:**

| Way | How it works |
| --- | --- |
| Continue with Google or GitHub | Both only hand over an address their owner has verified. A trigger on `auth.identities` (`verify_from_identity`) marks the account verified |
| A link by email | The `verify-email` function has **Google Firebase** email a link (free: 1,000 a day). It usually lands in Junk, so the page walks people through "It's not junk" |
| By hand | The team runs `select public.mark_account_verified('<account id>', 'admin');` with the secret key |

A verified account has a row in `private.account_verifications`, and `private.is_verified(id)`
checks for it.

**Until then, an account can** sign in, browse, use the planner, leave the directory, withdraw a
submission or a permission, and decline a project listing. **It can't** submit anything
(trigger `require_verified_submitter`), give a permission (rule and trigger on `consents`),
confirm a project listing, or act as a reviewer or admin. Every page under My account shows a
reminder with a link to `/account/verify`.

**The Google and GitHub safeguard.** Supabase joins a Google or GitHub sign-in to an existing
account with the same address. Someone could create an account with a classmate's address and
a password, then wait for the classmate to use Google. So when Google or GitHub verifies an
account that had a password, the trigger removes that password and ends the account's sessions.
The owner can choose a new one; the account page explains this. Only a sign-in with the account's
own address counts, so a Google or GitHub identity joined to an account by any other route
verifies nothing.

**Existing reviewers and admins** were marked verified when the migration ran: an admin chose each
of them, and otherwise every one would have lost their powers until they verified. Everyone else
verifies once.

**Changing an account's address** (trigger `check_email_change` on `auth.users`): the new address
must be a Franciscan one, like at sign-up, and the account has to verify again, since its
verification only proved the old address.

**The email link, in short** (full comments in `supabase/functions/_shared/account-email.ts`):

1. `send`: the function makes a new Firebase account for the address, with a password only our
   functions can work out (`HMAC(FIREBASE_LINK_SECRET, address)`), and asks Firebase to email it
   a verification link. The id of that Firebase account is remembered (`private.firebase_accounts`).
2. The person clicks the link on Firebase's page.
3. `check`: the function signs in to that Firebase account, asks whether it's verified, and if
   so marks ours verified and deletes the Firebase account.

Each email starts from a new Firebase account, so an old click can't count. An account someone
made with Firebase's public key never counts either.

**Forgotten passwords work the same way.** Supabase's reset email can't reach students either.
`password-reset` makes a new Firebase account and has Firebase email a reset link. The person
chooses a new password on Firebase's page, then types it on ours. If it signs in to the Firebase
account we made, they must have used the link. It becomes their password here, the account
counts as verified, and their other sessions end.

**Limits** (`allow_verification_request`): 5 verification and 5 reset emails per account a day, a
minute apart, and 10 tries an hour at finishing a reset. Requests are kept 7 days. The limits are
per account, so someone who knows a classmate's address can use up that day's reset emails; a
Turnstile check on the reset form stops that once its keys are set (see Known gaps).

---

## 4. The 30 tables

All are in the `public` schema, and every one has row-level security turned on. A database test
fails the build if a new table forgets.

| Area | Table | What it holds |
| --- | --- | --- |
| People | `profiles` | One per account: name, slug, role, major, class year, skills, photo, links, contact details, `visible` (listed or not) |
| | `consents` | A student's permission per scope: `directory`, `photo`, `email`, `phone`. Append-only: revoking adds a date, nothing is deleted |
| | `faculty` | Professors, with a slug for their page |
| | `internships` | A student's internships |
| | `alumni_stories` | Alumni write-ups |
| Projects | `projects` | Title, summary, description, status, dates, sub-department, category, priority, pinned, thumbnail, links, contact, `published` |
| | `contributions` | Who worked on a project, their role, and whether they confirmed |
| | `advising` | Faculty advisor ↔ project |
| | `project_images` | A project's extra photos, in order, each with alt text |
| | `organizations` | Grants and partner organizations |
| | `project_organizations` | Organization ↔ project |
| | `sub_departments` | Computer Science, Software Engineering, … |
| | `categories` | Capstone, class, personal, … (can nest) |
| Review | `pending_changes` | Every student submission waiting for, or after, review |
| | `audit_log` | Approvals, rejections, removals, role changes, admin edits, re-shuffles. Append-only |
| Carousel | `monthly_pool` | The ~15 projects an admin picks for the month |
| | `daily_carousel` | Today's picked projects, in display order |
| | `carousel_state` | One row per day: when it was picked and how many re-shuffles |
| Site | `site_content` | Page wording admins edit in place |
| Site | `site_content_draft`, `site_content_history`, `record_draft` | Page wording waiting to be published, every replaced version (each history row has a `batch`, the id of the transaction that wrote it, so one Publish's rows group together; rows from before it have none), and waiting edits to projects, students, faculty and project photos; `record_history` keeps the details a publish replaced; `record_photo_history` keeps the last 3 replaced or removed photos per project (files under `projects/` only; older ones are returned in `removed_paths` and deleted). A student's or faculty member's photo (`photo_path`) is an ordinary draft column; their last 3 replaced photos stay in `record_history`, older files are returned in `removed_paths`. Admins can write into any `avatars/<id>/` folder, and a student photo, email or phone needs the student's consent (a withdrawal also clears it from `record_history` and waiting drafts). Publish and discard lock the drafts first and touch only those, so a draft saved meanwhile is kept. A file is deleted only when `private.unused_files` finds nothing (live rows, any draft, any history, a pending submission) using it; a later save keeps the *older* `seen_updated_at`, so a clash cannot be hidden |
| | `posts` | Department news |
| | `events` | Department events: a date (or a few days), optional times, place, link and sub-department. Times are university clock time, not an instant. Editors add, change and delete them directly (no draft step), every change by an admin is logged, and the home and events pages show upcoming ones and, separately, past ones |
| Planner | `planner_catalogs` | Catalog years 2022–2023 to 2026–2027 |
| | `planner_courses` | Each year's courses: credits, prerequisites, when offered |
| | `planner_degrees` | Each year's majors, minors and pre-engineering programs, with suggested plans |
| | `planner_plans` | A signed-in student's own saved plan |

There are also two views the site reads: `listed_students` (only students who are listed *and*
consented) and `carousel_today` (today's cards). Both run with the caller's permissions, so the
rules still apply. One private table, `private.allowed_email_domains`, holds the email domains
from section 3.1, and three more hold verification (section 3.4); the website's API can't reach
the `private` schema at all.

---

## 5. The 57 access rules

> **Correction:** the slide said 70. That counted `create policy` lines across all the migration
> files, but later migrations replaced many of them. The database actually has **57 rules: 53 on
> the tables and 4 on photo storage** (from `pg_policies`). The slide is updated.

### 5.1 How a rule is set up

Three steps per table, all in migrations. Here is `projects`:

```sql
-- 1. Turn on row-level security. From now on a request sees nothing unless a rule allows it.
alter table public.projects enable row level security;

-- 2. Grants: which roles may try which actions at all.
revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

-- 3. Rules: which rows each action may see or change.
create policy "Projects are public once published" on public.projects
  for select to anon, authenticated
  using (published or ((select auth.uid()) is not null and private.can_view_project(id)));

create policy "Admins manage projects" on public.projects
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
```

- `using (...)` filters the rows a request can see, update or delete. Rows that fail it are
  invisible, not an error. That's why a student's direct `PATCH` to their profile "succeeds" but
  changes zero rows (API test 3).
- `with check (...)` must be true for the row being written. If it isn't, the write is refused.
- `for all` covers select, insert, update and delete. Several rules on one table are combined
  with OR: you get access if any rule allows it.

### 5.2 The helper functions the rules call

| Function | True when |
| --- | --- |
| `is_admin()` / `is_reviewer()` / `can_edit_content()` | The caller's role is admin; reviewer, faculty or admin; faculty or admin. The account must be verified (section 3.3) |
| `is_verified(account)` | That account's email address is verified (section 3.4) |
| `has_consent(student, scope)` | That student has an unrevoked consent for that scope |
| `is_listed_student(student)` | The profile is `visible` **and** has `directory` consent |
| `is_project_published(project)` | That project is published |
| `can_view_project(project)` | Published, or the caller is a reviewer, or is on that project's team |
| `can_manage_media(path)` / `can_replace_media(path)` | See [photo storage](#7-photo-storage) |

They are `security definer` (they run with the owner's rights so they can look things up the
caller can't) and `set search_path = ''` (so nobody can trick them with a same-named table).
Users can't call them directly. A database test checks that only an allowlist of them is callable.

### 5.3 All 57 rules

"Anyone" means visitors and signed-in users. A rule named "Admins manage …" covers reading,
adding, editing and deleting.

| Table | Rule | Action | In plain words |
| --- | --- | --- | --- |
| `advising` | Advisors are public when the project is | read | Anyone, if the project is published; reviewers and the team always |
| | Admins manage advising | all | Admins only |
| `alumni_stories` | Alumni stories are public once published | read | Anyone, if published; reviewers always |
| | Admins manage alumni stories | all | Admins only |
| `audit_log` | Reviewers read the audit log | read | Reviewers and admins. **No write rule exists**: only the review and audit functions add entries, and nobody can edit or delete them |
| `carousel_state` | Reviewers see carousel runs | read | Reviewers and admins |
| `categories` | Categories are public | read | Anyone |
| | Admins manage categories | all | Admins only |
| `consents` | Students grant consent for themselves | add | Only for yourself, and not already revoked |
| | Students see their own consents and reviewers see all | read | Your own; reviewers see all |
| | Students revoke their own consents | edit | Your own, and only the `revoked_at` column (column grant) |
| `contributions` | Confirmed listings of listed students are public | read | Anyone, for confirmed members who are listed students on published projects; your own rows; the team and reviewers |
| | Admins manage contributions | all | Admins only |
| `daily_carousel` | The daily carousel is public | read | Anyone |
| `events` | Events are public | read | Anyone |
| | Editors manage events | all | Admins only for now (`can_edit_site()`; faculty once that role exists) |
| `faculty` | Faculty are public | read | Anyone |
| | Admins manage faculty | all | Admins only |
| `internships` | Internships of listed students are public | read | Anyone, for listed students; your own; reviewers |
| | Admins manage internships | all | Admins only |
| `monthly_pool` | Reviewers see the monthly pool | read | Reviewers and admins |
| | Admins manage the monthly pool | all | Admins only |
| `organizations` | Organizations are public | read | Anyone |
| | Admins manage organizations | all | Admins only |
| `pending_changes` | Users submit changes as themselves | add | `submitter_id` must be you |
| | Submitters see their submissions and reviewers see all | read | Your own; reviewers see all |
| | Submitters edit or withdraw their own submissions | edit | Your own; triggers then limit *how* (section 6) |
| `planner_catalogs` | Catalog years are public | read | Anyone |
| | Admins manage catalog years | all | Admins only |
| `planner_courses` | The catalog is public | read | Anyone |
| | Admins manage courses | all | Admins only |
| `planner_degrees` | Suggested plans are public | read | Anyone |
| | Admins manage suggested plans | all | Admins only |
| `planner_plans` | People manage their own plan | all | Only your own plan, never anyone else's |
| `posts` | Published posts are public and drafts visible to reviewers | read | Anyone, if published; reviewers see drafts |
| | Admins manage posts | all | Admins only |
| `profiles` | Listed students' profiles are public | read | Anyone, if `visible` and `directory` consent; your own; reviewers see all |
| | Admins edit profiles | edit | Admins only. Students change their profile through the review queue. Nobody inserts (a trigger does) |
| `project_images` | Project photos are public when the project is | read | Anyone, if the project is published; the team and reviewers |
| | Admins manage project photos | all | Admins only |
| `project_organizations` | Partners are public when the project is | read | Anyone, if the project is published; the team and reviewers |
| | Admins manage project partners | all | Admins only |
| `projects` | Projects are public once published | read | Anyone, if published; the team and reviewers |
| | Admins manage projects | all | Admins only |
| `site_content` | Site text is public | read | Anyone |
| | Editors manage site text | all | Admins only for now (`can_edit_site()`) |
| `site_content_draft` | Editors read drafts | read | Admins only for now. Writes go through `save_site_draft` and the publish functions |
| `site_content_history` | Editors read the history | read | Admins only for now |
| `record_draft` | Editors read record drafts | read | Admins only for now |
| `record_history` | Editors read record history | read | Admins only for now |
| `record_photo_history` | Editors read photo history | read | Admins only for now |
| `sub_departments` | Sub-departments are public | read | Anyone |
| | Admins manage sub-departments | all | Admins only |
| `storage.objects` | Media: upload where you can edit | add | Only into a folder you manage (section 7) |
| | Media: see files you manage | read (API) | Folders you manage. Public image links work for anyone |
| | Media: replace files you manage that nothing uses | edit | Your folder, and no live page or open submission uses the file |
| | Media: delete files you manage that nothing uses | delete | Same as replace |

---

## 6. The review queue

### 6.1 The life of a submission

```
 student submits ──► pending ──► reviewer approves ──► approved   (change applied, logged)
                        │   └──► reviewer rejects ───► rejected   (reason required, logged)
                        │   └──► asks for changes ──► changes_requested ──► student edits ──► pending
                        └──► student withdraws ──────► withdrawn
```

### 6.2 Step by step

**1. The student submits** (`POST /rest/v1/pending_changes`). The insert rule requires
`submitter_id = auth.uid()`. Then the `validate_pending_change` trigger runs. Excerpt:

```sql
if tg_op = 'INSERT' then
  if new.status <> 'pending' or new.reviewer_id is not null or new.reason is not null then
    raise exception 'New submissions start as pending' using errcode = '42501';
  end if;
  if (select count(*) from public.pending_changes p
      where p.submitter_id = me and p.status in ('pending', 'changes_requested')) >= 20 then
    raise exception 'You have 20 submissions open already; wait for reviews or withdraw some';
  end if;
end if;
-- then per kind, for example a profile:
if new.action = 'create' and not private.has_consent(me, 'directory') then
  raise exception 'Agree to be listed in the directory before asking to be added';
end if;
if new.proposed_data ->> 'photo_path' not like 'avatars/' || me::text || '/%' then
  raise exception 'Upload your photo to your own avatars folder first';
end if;
```

The trigger also checks that only known fields are proposed, that phone, email and photo each
have consent, and that a student can only change projects they're on. The live tables add their
own limits: every link column has the type `https_url`, which accepts only `https://` addresses
up to 500 characters, and emails and phone numbers must be well formed.

**2. The student can still change their mind.** While it's `pending` they may only withdraw it.
After "changes requested" they may edit and resubmit. A second trigger,
`freeze_pending_change_fields`, refuses any change to who submitted it, its kind, its target or
the reviewer's fields.

**3. A reviewer decides** (`POST /rest/v1/rpc/review_change`). This is the only way anything
reaches the live tables:

```sql
create function public.review_change(change_id uuid, decision change_status, note text default null)
returns public.pending_changes
language plpgsql security definer set search_path = ''
as $$
declare
  change public.pending_changes;
  applied_target uuid;
begin
  if not private.is_reviewer() then
    raise exception 'Only reviewers can review submissions' using errcode = '42501';
  end if;

  select * into change from public.pending_changes where id = change_id for update;  -- lock the row
  if change.status <> 'pending' then
    raise exception 'This submission is not waiting for review';
  end if;
  if decision <> 'approved' and coalesce(trim(note), '') = '' then
    raise exception 'Give a reason when rejecting or asking for changes';
  end if;

  if decision = 'approved' then
    applied_target := private.apply_change(change);  -- writes the profile, project or internship
  end if;

  update public.pending_changes set status = decision, reviewer_id = auth.uid(),
    reason = nullif(trim(note), ''), reviewed_at = now(),
    target_id = coalesce(target_id, applied_target)
  where id = change_id returning * into change;

  perform private.audit('submission_' || decision::text, change.target_type::text, change.target_id,
    jsonb_build_object('change_id', change.id, 'submitter_id', change.submitter_id,
      'self_review', change.submitter_id = auth.uid()));
  return change;
end;
$$;
```

`apply_change` copies only the allowed fields into the live table. For a new project it creates
the project and publishes it. For a profile request it sets `visible = true`, unless the student
has withdrawn consent in the meantime. For a removal request it clears the profile, its listings
and its consents. Reviewers may approve their own submissions; the audit entry marks those
`self_review`.

### 6.3 How Supabase handles several reviewers at once

The work is done by Postgres transactions and row locks, not by anything in the website:

- **Every request is its own transaction.** `review_change()` runs completely or not at all. If
  applying the change fails halfway (say a link fails the `https://` check), the status update and
  the audit entry roll back too. Nothing is ever half-approved.
- **Two reviewers, same submission.** `select ... for update` locks that one row. If two
  reviewers press Approve at the same moment, the second waits a few milliseconds for the first
  to finish. It then sees `status = 'approved'` and gets "This submission is not waiting for
  review." The change can't be applied twice.
- **Two reviewers, different submissions.** The lock is per row, so they run in parallel and
  never wait on each other.
- **A student withdraws while a reviewer approves.** Same row lock. Whichever commits first wins,
  and the other gets an error ("already reviewed", or "not waiting for review").
- **Readers never wait.** Postgres keeps versions of rows (MVCC), so people browsing the site
  while a review is applied see the old data until the moment it commits.
- **Notices go out after the commit.** The GroupMe trigger uses `pg_net`, which sends only once
  the transaction has committed. A rolled-back submission sends nothing.

---

## 7. Photo storage

### 7.1 The bucket

From `supabase/migrations/20261014190200_storage.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']);
```

One bucket. Supabase itself refuses files over 5 MB or that aren't JPEG, PNG or WebP. Before
uploading, the site shrinks each photo to 2000 px on its long side and re-encodes it as JPEG.
That also strips camera metadata, including GPS location, before anything leaves the student's
device. Each file gets a random name: `${folder}/${userId}/${crypto.randomUUID()}.jpg`.

### 7.2 How it's compartmentalized: one folder per owner

| Folder | Who may upload, replace, delete |
| --- | --- |
| `avatars/<user id>/` | Only that user (profile photo) |
| `submissions/<user id>/` | Only that user (photos for project submissions) |
| `projects/`, `posts/`, `faculty/`, `alumni/`, `organizations/` | Admins only |

The four storage rules all call this function, which reads the folder from the file's path:

```sql
create function private.can_manage_media(object_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);   -- 'avatars/<id>/x.jpg' → {avatars, <id>}
begin
  if (select auth.uid()) is null or cardinality(folders) < 2 then
    return false;
  end if;
  case folders[1]
    when 'avatars', 'submissions' then
      return folders[2] = (select auth.uid())::text;    -- your own folder only
    when 'projects', 'posts', 'faculty', 'alumni', 'organizations' then
      return private.is_admin();
    else
      return false;
  end case;
end;
$$;
```

### 7.3 Photos in use are locked

A student can't swap or delete a photo once a live page or an open submission uses it. Otherwise
they could replace an approved photo with something else after review. Replace and delete use
`can_replace_media`, which adds this check:

```sql
private.is_admin() or not private.is_media_in_use(object_name)
-- in use = a profile's photo_path, a project's thumbnail_path, a project_images row,
--          or a pending / changes_requested submission that names the file
```

The validation trigger also requires a submitted photo to be in the submitter's own folder, so
nobody can point a submission at someone else's photo.

### 7.4 The one caveat

The bucket is public so pages can show images with a plain link. Anyone who has a photo's exact
address can open it, even before it's approved. The random file names make addresses impossible
to guess, but nothing private should be uploaded.

---

## 8. The hourly carousel

### 8.1 The chain

```
pg_cron, at 5 past every hour
  └─► private.request_carousel_refresh()          (a database function)
        └─► pg_net: POST /functions/v1/carousel   {"action": "refresh"}, Bearer <cron secret>
              └─► Edge Function "carousel"
                    1. carousel_day()          today's date in Eastern time
                    2. already picked today?   yes → stop ("already picked today")
                    3. carousel_candidates()   this month's pool (or the 15 latest projects)
                    4. pickCarousel(candidates, seed)
                    5. save_carousel()         writes daily_carousel and carousel_state
```

It runs every hour, but it only picks once a day: the first run after midnight Eastern. The other
23 runs stop at step 2. Running hourly means one missed run just delays the day's pick by an hour.

### 8.2 The code

The schedule (`20261014225544_carousel_schedule.sql`):

```sql
select cron.schedule('carousel-refresh', '5 * * * *', 'select private.request_carousel_refresh()');
```

The database calls the function with a secret kept in Supabase Vault, the encrypted secrets
store:

```sql
select decrypted_secret into function_url from vault.decrypted_secrets where name = 'carousel_function_url';
select decrypted_secret into cron_secret  from vault.decrypted_secrets where name = 'carousel_cron_secret';
if function_url is null or cron_secret is null then return; end if;   -- not set up: do nothing
perform net.http_post(url := function_url,
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cron_secret),
  body := '{"action": "refresh"}'::jsonb);
```

The function (`supabase/functions/carousel/index.ts`) accepts only two callers:

- `{"action": "refresh"}` with the cron secret, checked with a constant-time comparison so
  timing can't leak it.
- `{"action": "reshuffle"}` with a signed-in **admin's** access token, for the admin panel's
  Re-shuffle button. The function and its database side are done; the button itself isn't built
  yet.

Browsers may call it only from our own sites (a CORS allowlist). The candidates query:

```sql
-- this month's admin-picked pool, published projects only…
select p.id, p.sub_department_id, p.priority, p.is_pinned, p.updated_at
from public.monthly_pool mp join public.projects p on p.id = mp.project_id
where mp.month = to_char(for_day, 'YYYY-MM') and p.published
-- …or, if the admin picked nothing this month, the 15 most recently updated published projects
```

`save_carousel()` refuses more than 7 projects, replaces the day's list, counts re-shuffles, and
logs each re-shuffle in the audit log. Only the secret key (`service_role`) may call it.

### 8.3 The pick itself, honestly

`pickCarousel()` in `supabase/functions/_shared/carousel-pick.ts` belongs to the Algorithms team.
**Today it is a placeholder:** pinned projects first, then the highest priority, top 5, not
random. The algorithm on the DS&A slide replaces it:

1. Pick a target of 5–7 projects.
2. Add every pinned project.
3. Add one per sub-department, weighted by priority.
4. Fill the rest by weighted random sampling without replacement.
5. Shuffle.

All of it will derive from the seed `"<day>:<re-shuffle count>"`, so any day's pick can be
reproduced. The function signature, the tests (`npm run test:carousel`) and the pipeline around it
are already in place.

---

## 9. GroupMe notifications

### 9.1 The chain

```
student submits (or resubmits after "changes requested")
  └─► trigger on pending_changes (after insert / after status update)
        └─► private.notify_reviewers()   reads 2 secrets from Vault; missing → sends nothing
              └─► pg_net: POST /functions/v1/notify-reviewers   (after the submission commits)
                    └─► Edge Function checks the secret, builds a 2-line message
                          └─► POST https://api.groupme.com/v3/bots/post  {bot_id, text}
```

Messages arrive within seconds. Approvals, withdrawals, sign-ups and admin edits send nothing.

### 9.2 The trigger (`20261016100000_review_notifications.sql`)

```sql
create trigger notify_reviewers_of_submission
  after insert on public.pending_changes
  for each row when (new.status = 'pending')
  execute function private.notify_reviewers();

create trigger notify_reviewers_of_resubmission
  after update of status on public.pending_changes
  for each row when (old.status = 'changes_requested' and new.status = 'pending')
  execute function private.notify_reviewers();

-- private.notify_reviewers() posts only what the message needs:
body := jsonb_build_object(
  'id', new.id, 'target_type', new.target_type, 'action', new.action,
  'title', coalesce(new.proposed_data ->> 'title', new.proposed_data ->> 'company'),
  'resubmitted', tg_op = 'UPDATE')
```

### 9.3 The function (`supabase/functions/notify-reviewers/index.ts`)

```ts
if (!secret || !secretsMatch(token, secret)) return new Response("Unauthorized", { status: 401 });
if (!isSubmission(submission)) return new Response("Bad request", { status: 400 });
const text = reviewMessage(submission, siteUrl);
// e.g. "New for review: a request to be added to the student directory
//       https://staging.csc-dept-website.pages.dev/review/<id>"
sends.push(post("https://api.groupme.com/v3/bots/post", { bot_id: groupMeBot, text }));
```

**Privacy:** GroupMe is outside the university's systems, so the message never names the
student. It says what kind of submission it is and, for a project or internship, its title. The
link leads to the review page, where reviewers sign in to see the rest.

### 9.4 What it needs on each project

These are settings, not code, so they're never in GitHub:

- **Function secrets:** `NOTIFY_SECRET`, `SITE_URL` and `GROUPME_BOT_ID`.
- **Vault secrets:** `notify_function_url`, and `notify_secret` (the same value as
  `NOTIFY_SECRET`).

The developer site was set up on 2026-10-17 and confirmed working. Production needs the same
setup at release (`docs/backend-setup.md`, step 7).

---

## 10. The GitHub workflow, end to end

Each step and what it protects against:

1. **Branch from `staging`** in the shared repository (not a fork), so the pull request gets a
   preview link.
2. **Open a pull request into `staging`.** The template asks for:
   - how to check it on the preview
   - tests run
   - **no secrets in the diff** (`sb_secret_…`, database passwords, `functions/.env`)
3. **Automatic checks run** (`.github/workflows/`), both required before merging:

   | Check | Runs |
   | --- | --- |
   | Lint, unit tests and build (`frontend.yml`) | ESLint, 68 unit tests, TypeScript type-check and build |
   | Database, API and browser tests (`backend.yml`) | Starts a **throwaway local Supabase** inside GitHub, then: schema lint and 384 database tests, 19 API tests, two browser tests in Chrome (35 steps), the carousel tests, and a check that the generated types are up to date |

   The backend tests run against a temporary database built from the migrations, so CI needs
   **no real keys** and never touches the hosted projects.
4. **Cloudflare builds a preview** of the branch. Previews use the **dev** project's publishable
   key only.
5. **Branch protection** (the "Protect main and staging" ruleset) blocks the merge until:
   - one **code owner** has approved. `.github/CODEOWNERS` lists Henry, Red and Daniel, and authors
     can't approve their own pull requests.
   - **New commits cancel earlier approvals**, so nothing slips in after review.
   - **Both checks are green.**
   - **Nobody pushes directly**, force-pushes or deletes `main` or `staging`.
6. **Merge into `staging`:**
   - Cloudflare publishes the developer site.
   - Supabase's GitHub integration applies any new migrations to the **dev** project and deploys
     the Edge Functions.
7. **Release (`staging` → `main`)** is the same path, through its own reviewed pull request:
   - Cloudflare publishes https://csc-dept-website.pages.dev.
   - Supabase updates the **production** project.
8. **Dependabot** opens weekly pull requests into `staging` for library updates. They pass the
   same checks and reviews.

Where each secret lives (none are in the repository):

| Secret | Where it is | Who uses it |
| --- | --- | --- |
| Publishable key (`sb_publishable_…`) | Cloudflare build settings, `.env.local` | The browser. Safe to expose: it only acts as a visitor, and the rules apply |
| Secret key (`sb_secret_…`) | Supabase only, given to our Edge Functions automatically | Edge Functions. It skips the rules, so it never goes in the browser or git |
| `CAROUSEL_CRON_SECRET`, `NOTIFY_SECRET` | Function secrets, plus matching copies in Vault | The database ↔ function calls |
| `GROUPME_BOT_ID` | Function secret | notify-reviewers |
| Database passwords | The backend pair's macOS Keychain | Command-line deploys |

`.env.local` and `supabase/functions/.env` are git-ignored. The security headers in
`public/_headers` stop the site from being framed by other sites, and limit scripts, images and
connections to our own site and our two Supabase projects.

---

## 11. The tests

### 11.1 The 384 database tests (the slide's "202" predates page-editing drafts, verification, events and publish batches)

They are written in SQL with **pgTAP**, a testing library that runs inside Postgres. Each test
signs in as a test user (visitor, student, reviewer, admin), tries something, and checks the
result. Each file runs inside a transaction that is rolled back, so tests leave nothing behind.
Run them with `npm run db:test`.

| File | Tests | What it checks |
| --- | --- | --- |
| `01_schema` | 13 | Every table has RLS; visitors can't write anything; views respect the caller; only allowed helpers are callable; the verification helpers need the secret key |
| `02_profiles_and_consent` | 14 | Listed vs unlisted students, consent-gated fields, append-only consent, roles |
| `03_projects` | 16 | What visitors, team members and other students see; admin-only writes; confirming a listing; priority limits |
| `04_review_queue` | 28 | Submitting, validation, approving, rejecting, sending back, photos, self-reviews, removal requests, the audit log |
| `05_auth_and_storage` | 15 | Allowed email domains, new-account profiles, upload folders |
| `06_carousel` | 15 | Eastern-time days, candidates and the empty-pool fallback, saving picks, re-shuffle counting |
| `07_hardening` | 12 | Internal functions not callable; pending submissions locked; https-only links; size and length limits; the 20-submission limit; audited role changes |
| `08_directory_and_slugs` | 11 | `listed_students` shows only listed students; slugs; thumbnails need alt text |
| `09_student_submissions` | 15 | Project slugs at approval; photos in use can't be swapped or deleted |
| `10_cms_and_people` | 8 | Only admins change page text; only admins see sign-up emails; students can't change their role |
| `11_planner` | 37 | Catalog years; prerequisites stay within a year and can't loop; plans are private; data spot checks |
| `12_admin_audit` | 7 | Admin edits are logged; the last admin can't step down |
| `13_review_notifications` | 12 | Submissions and resubmissions trigger a notice with no student name; decisions don't; nothing sends without the Vault secret |
| `14_cms_drafts` | 20 | Page text: allowed keys, cleaned values, drafts, publishing with the conflict check, history |
| `15_record_drafts` | 55 | Project, student and faculty edits (and project photos) wait as drafts and go live on publish |
| `16_account_verification` | 36 | What an unverified account can and can't do; unverified reviewers lose their powers; promotion needs verification; the Google and GitHub safeguard, only for the account's own address; changing address; rate limits; finishing a reset |
| `16_events` | 20 | Everyone reads events; only admins write; dates, times, titles and links are checked; admin changes are logged |
| `16_publish_batches` | 9 | One Publish is one batch in the history; a single record draft can be undone on its own; students can't |
| `17_faculty_role` | 19 | Faculty edit page text, projects, student profiles, categories, events and project photos; they are refused admin-only changes; a student cannot give themselves the role; unverified faculty have no powers |
| `18_home_highlights` | 22 | Everyone reads highlights; only admins and faculty write them (students, reviewers and signed-out visitors can't); only known kinds and lines up to 200 characters; only a listed student can be highlighted, and hiding one removes theirs; deleting a record removes its highlight; the home page view shows published projects, listed students and published stories; event importance is major, regular or minor and defaults to regular |

Example, from `05_auth_and_storage`:

```sql
select is(
  public.hook_before_user_created('{"user": {"email": "someone@gmail.com"}}') -> 'error' ->> 'http_code',
  '403',
  'other addresses are rejected'
);
```

### 11.2 The 19 API tests

`supabase/tests/api/api.test.mjs` (`npm run test:api`) uses real HTTP against a running Supabase,
the same way the browser does. It checks that Auth, the Data API and Storage work together.

| # | Test | HTTP requests it sends |
| --- | --- | --- |
| 1 | Only university email addresses can sign up | `POST /auth/v1/signup` with a gmail address → expects **403** and the Franciscan message |
| 2 | An unverified account can't submit, give permissions or be promoted until verified | `POST /rest/v1/pending_changes` and `/consents` → **403**; `PATCH` the role with the secret key → **400**; `POST /rest/v1/rpc/mark_account_verified` with the secret key; then the submission → **201** |
| 3 | Only the secret key can verify accounts or look up sign-in addresses | each helper as a visitor and as a student → **refused** |
| 4 | A new account gets an unlisted student profile | `GET /rest/v1/profiles?id=eq.<id>` as the student → role `student`, not visible; the same `GET` as a visitor → **empty** |
| 5 | Profile changes wait for a reviewer | `PATCH /rest/v1/profiles` (including `role: "admin"`) → **changes nothing**; `POST /rest/v1/pending_changes`; `POST /rest/v1/rpc/review_change` as the student → **403**; as a reviewer → **200**; `GET` → the new headline is live |
| 6 | A submitted project goes live after review, with its photo | `POST /storage/v1/object/media/submissions/<id>/…png`; `POST /rest/v1/pending_changes` (new project + photo); `POST /rest/v1/rpc/review_change`; `GET /rest/v1/projects?slug=eq.…&select=title,project_images(…)` as a visitor → live, with the photo |
| 7 | Photos upload only into the user's own folders | `POST` into your own `avatars/` → **200**, and `GET /storage/v1/object/public/…` loads it; `POST` into another user's folders or `projects/` → **refused**; a `.txt` file → **refused** |
| 8 | A photo can't be swapped or deleted while in use | Upload, submit it; `PUT` (replace) → **refused**; `DELETE` → removes **nothing**; `PATCH` the submission to withdrawn; then `PUT` and `DELETE` → **allowed** |
| 9 | An account can be deleted | `DELETE /auth/v1/admin/users/<id>` with the secret key → **200**; the profile is gone too |

Each run signs up throwaway accounts and deletes them, and their files, afterwards.

`supabase/tests/api/cms-concurrency.test.mjs` adds 10 more: several admins saving and publishing page and record drafts at the same moment, with nothing lost or published twice.

### 11.3 The other suites

- **Browser tests, 35 steps:** `npm run test:e2e`. The student test (17 steps) has Chrome play a
  student and a reviewer through the real site:
  - sign up, and other email addresses refused
  - the reminder to verify, and the verify page (the test verifies with the secret key)
  - directory permission
  - a profile with a photo, a project with a gallery, and an internship sent for review
  - nothing public before review
  - the reviewer approves some and returns the project with a note; the student fixes and resends it
  - the project goes public with resized photos
  - a teammate confirms
  - the reviewer sees exactly what changed
  - a removal request hides the student at once
  - a reviewer approves their own submission
  - the forms fit a phone screen
  The editing test (18 steps) checks the Edit bar: drafts only the editor sees, publishing, a
  clash with someone else's change, and the bar folding away.
- **Unit tests, 68:** `npm run test:unit`. Planner rules, formatting, the sign-in redirect guard, the
  Turnstile check,
  the GroupMe message, the policy pages' plain copies, and the verification and reset emails
  against a stand-in for Firebase.
- **Carousel tests, 6:** `npm run test:carousel`. The rules any pick must follow:
  - 5 to 7 projects from a full pool, without repeats
  - only projects from the pool
  - pinned projects always included
  - the same seed gives the same pick
  - a small pool is shown whole
  - an empty pool gives an empty pick

---

## 12. Known gaps

- **Password length.** Production enforces only **6** characters on the server, while the site's
  forms ask for 8 (dev was raised to 8 on 2026-10-21). Someone calling production's API directly
  could set a 6-character password. Fix at release: Authentication > Policies > minimum length 8.
  `secure_password_change` (asking for the old password before a change) is also off.
- **Production isn't released yet.** It has no planner, sign-in forms, notifications or
  verification. At release it needs "Confirm email" turned off (verification replaces it) and the
  steps in [backend-setup.md](backend-setup.md) 3.3, step 10.
- **CAPTCHA until the keys are set.** Sign-up, password sign-in and both steps of a password reset
  carry a Cloudflare Turnstile check (`src/components/Captcha.tsx`). Supabase checks it for sign-up
  and sign-in, and `password-reset` checks it itself (`_shared/turnstile.ts`). Until a project has
  the keys ([backend-setup.md](backend-setup.md), 3.3 step 11), there is no check: someone who knows
  a classmate's address can then use up that account's 5 reset emails for the day, though never
  take the account over. Replies also show whether an address has an account, as the sign-up form
  already does.
- **Verification emails land in Junk** at franciscan.edu, and Firebase's email wording can't be
  edited on our project yet. The verify and reset pages explain "It's not junk" step by step.
- **The carousel pick is a placeholder** until the Algorithms team's version lands (section 8.3).
- **Public photo links** work for anyone who has the exact address (section 7.4).
- **The free plan's limits:**
  - 500 MB database and 1 GB file storage
  - **no automatic backups**
  - projects pause after a week without activity; a scheduled GitHub workflow reads one row every
    three days to keep them awake

  Before launch, ask the department about the Pro plan for backups.
