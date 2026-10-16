# Testing

| Layer | Command | Checks |
| --- | --- | --- |
| Database | `npm run db:test` | Schema lint, plus the access rules, review queue and carousel storage, user by user |
| API | `npm run test:api` | Sign-up, submissions, review and photo uploads, through the real API |
| Carousel pick | `npm run test:carousel` | The rules every version of the Algorithms team's pick must keep |
| Student forms | `npm run test:e2e` | Sign-up, permissions, the profile, project and internship forms, photo resizing, the review queue and what the public sees, in Chrome |
| Frontend | the frontend team's own checks | The site builds and runs |
| CI | automatic | The three suites above on every pull request and push to `main` |
| People | preview links | Faculty and teammates trying real flows before release |

The database and API tests need the local stack running (`npm run db:start`, see
[backend-setup.md](backend-setup.md)).

## Database tests

`supabase/tests/database/*.test.sql`, written with [pgTAP](https://pgtap.org). Each file runs in
a transaction that is rolled back, so tests never leave data behind and don't depend on the seed.

| File | Covers |
| --- | --- |
| `01_schema.test.sql` | Every table has row level security; visitors can't write anything; views respect the caller's access; only the allowed internal helpers can be called by users |
| `02_profiles_and_consent.test.sql` | Listed and unlisted students, consent-gated fields, append-only consent, roles |
| `03_projects.test.sql` | What visitors, team members and other students see; admin-only writes; confirming a listing; priority limits |
| `04_review_queue.test.sql` | Submitting, validation, approving, rejecting, sending back, project submissions with teammates and photos, reviewers approving their own submissions (logged as self-reviews), removal requests, the audit log |
| `05_auth_and_storage.test.sql` | Allowed email domains, new-account profiles, upload folders |
| `06_carousel.test.sql` | Eastern-time days, candidates and the empty-pool fallback, saving picks, re-shuffle counting, what visitors see on cards |
| `07_hardening.test.sql` | Internal functions can't be called by users; pending submissions can't be edited; https-only links; email, size and length rules; the open-submission limit; audited role changes |
| `08_directory_and_slugs.test.sql` | `listed_students` shows only listed students, even to reviewers; slugs are generated, unique and admin-only; thumbnails need alt text |
| `09_student_submissions.test.sql` | Project slugs made at approval and numbered when taken; students can't swap or delete a photo that a live page or an open submission uses |
| `10_cms_and_people.test.sql` | Only admins change page text; everyone reads it; only admins see the People list with sign-up emails; students can't change their own role |
| `11_planner.test.sql` | Catalog years, courses and programs are public, plans are private to their owner; a course belongs to one catalog year and its references must be in that year, can't loop and block deleting a course that another course or a program uses; program requirements must be well formed; `planner_catalog_issues()` flags courses before their prerequisites or in the wrong term or year; spot checks against each year's catalog |
| `12_admin_audit.test.sql` | Direct admin edits are logged with what changed, review-queue changes aren't logged twice, and the last admin can't step down |

`_helpers.psql` creates five test users (admin, reviewer, a listed student, an unlisted student,
and a listed student on no project), a faculty member, and two test projects; the comment at the
top of that file lists their ids. A new test looks like this:

```sql
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(1);

-- Act as test.outsider, a listed student not on test-draft
select pg_temp.login_as('a0000000-0000-4000-8000-000000000005');

select is_empty(
  $$ select 1 from public.projects where slug = 'test-draft' $$,
  'other students do not see unpublished projects'
);

select * from finish();
rollback;
```

- `select plan(n)` must match the number of checks in the file.
- Run `reset role;` before switching users with `pg_temp.login_as(...)` or `pg_temp.login_anon()`.
- A blocked action surfaces in one of four ways, so test for the right one:
  - a row the user can't see or change is silently skipped: use `is_empty`
  - an insert that breaks an access rule fails with `42501`: use `throws_ok`
  - a value that breaks a column rule, or a missing consent, fails with `23514`: use `throws_ok`
  - a malformed submission fails with `22023`: use `throws_ok`

Run one file with `npx supabase test db supabase/tests/database/04_review_queue.test.sql`.

## API tests

`supabase/tests/api/api.test.mjs`, using Node's built-in test runner. They call the local stack
over HTTP the way the website will. Each run creates its own accounts and deletes them afterwards:

- Gmail sign-ups are rejected
- a new account's profile is unlisted
- direct profile edits don't reach the live profile; a submitted change does once a reviewer
  approves it, and students can't approve their own
- a submitted project with a photo goes live only after review
- uploads only land in the user's own folders, and only images are accepted
- a photo can't be replaced or deleted while a submission or live page uses it, and can once the
  submission is withdrawn
- an account can be deleted (its profile goes with it), which the admin-edit audit once broke

If these fail but the database tests pass, check that the stack was restarted after the last
`config.toml` change: `npm run db:stop && npm run db:start`.

## Carousel pick tests

`supabase/functions/_shared/carousel-pick.test.ts` holds the rules any pick must keep: 5 to 7
projects from a full pool, only candidates and no repeats, pinned projects included, the same seed
giving the same pick, small and empty pools. The Algorithms team adds the edge-case and
statistical tests from guide 4.3 next to them.

To try the whole carousel locally, run `npm run functions:serve` in another terminal, then call
`select private.request_carousel_refresh();` in Studio's SQL editor. That is what the hourly job
does.

## Browser test (student forms)

`tests/e2e/student-submissions.test.mjs` drives Google Chrome (through `playwright-core`, so no
browser download) against the local stack and its own dev server on port 5174. It needs
`npm run db:start` and Chrome installed. One run walks the whole loop with the seed accounts:

- a student signs up from the request page; a Gmail address is refused
- asking to be added waits for the directory permission; permissions take effect at once
- profile, project (teammates, a non-student mentor, an advisor, thumbnail and gallery) and
  internship are sent for review; an unreadable photo (an iPhone HEIC file) gets a clear message
- nothing is public until a reviewer approves; a returned project comes back with the note, is
  edited and approved
- the public project shows the photos at 2000px, the student and the mentor, and the teammate
  only after they confirm
- a profile edit shows the reviewer only what changed; asking to be removed hides the student
- the form fits a phone screen, and the browser logs no errors

It deletes its account, project and photos afterwards. It isn't in CI yet; run it before merging
changes to the forms.

## CI

`.github/workflows/backend.yml` starts a fresh local Supabase on GitHub's runners and runs
`db:test`, `test:api` and `test:carousel`, plus a check that `src/lib/database.types.ts` was
regenerated. It runs on every pull request, so it can be made a required check under
Settings > Branches.

## Testing with people (developer site)

Once a change is merged into `staging`, check it with teammates and faculty on the developer site,
https://staging.csc-dept-website.pages.dev, before opening the pull request from `staging` into
`main`. Each pull request also gets its own preview link, but **not pull requests from forks**, so
push branches to the shared repository.

The developer site and previews use the **dev project** (Franciscan Site Dev), never production.
On dev:

- use accounts made for testing
- give test projects titles that start with `TEST`
- remember dev data is visible to the whole team

A short script for faculty to follow on a preview:

| As | Try | Expect |
| --- | --- | --- |
| Visitor | Browse projects and the student directory | Only published projects and listed students; unconfirmed teammates absent |
| Visitor | Sign up with a non-university email | Refused |
| Student | Agree to be listed, fill in a profile, ask to be added | Nothing public until a reviewer approves |
| Student | Submit a project with teammates and photos | Live after approval; teammates appear once they confirm |
| Teammate | Confirm the listing on your account page | Your name appears on the project |
| Student | Add an internship | On your profile after approval |
| Reviewer | Approve one submission, send another back with a note | The approved one goes live; the other returns to the student |
| Student | Ask to be removed | Hidden at once |
| Admin | Pick the monthly pool, press Re-shuffle | The home page carousel changes |

## Before merging

- [ ] `npm run db:test`, `npm run test:api` and `npm run test:carousel` pass locally
- [ ] `npm run test:e2e` passes, if the change touches sign-in, the student forms or the review queue
- [ ] New tables or rules have tests
- [ ] `npm run db:types` was run and the types file is committed
- [ ] No secrets in the diff (`sb_secret_...`, database passwords, `functions/.env`)
- [ ] CI is green
