# Testing

| Layer | Command | Checks |
| --- | --- | --- |
| Database | `npm run db:test` | Schema lint, plus the access rules and triggers, user by user |
| API | `npm run test:api` | Sign-up, login, the Data API and photo uploads working together |
| Frontend | `npm run lint`, `npm run build`, `npm run preview` | The Next.js app builds and runs in the Workers runtime |
| CI | automatic | The database and API tests on every pull request and push to `main` |
| People | preview links | Faculty and teammates trying real flows before release |

The database and API tests need the local stack running (`npm run db:start`, see
[backend-setup.md](backend-setup.md)).

## Database tests

`supabase/tests/database/*.test.sql`, written with [pgTAP](https://pgtap.org). Each file runs in
a transaction that is rolled back, so tests never leave data behind and don't depend on the seed.

| File | Covers |
| --- | --- |
| `01_schema.test.sql` | Every table has row level security; visitors can't write anything; the sign-up hook can't be called through the API |
| `02_profiles.test.sql` | Private and public profiles, editing your own, role changes |
| `03_projects.test.sql` | Drafts, review, publishing, featuring, editing and deleting |
| `04_team_photos_posts.test.sql` | Team members, photos and alt text, news posts |
| `05_auth_and_storage.test.sql` | Allowed email domains, new-account profiles, upload folders |

`_helpers.psql` creates five test users and two test projects (listed at the top of that file)
and the functions for acting as them. A new test looks like this:

```sql
begin;
\ir _helpers.psql
select pg_temp.create_test_projects();
select plan(1);

-- Act as test.outsider, a student on no projects
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
- A blocked change surfaces in one of three ways, so test for the right one:
  - a row the user can't see or change is silently skipped: use `is_empty`
  - a row that breaks a rule on insert fails with `42501`: use `throws_ok`
  - a value that breaks a column rule fails with `23514`: use `throws_ok`

Run one file with `npx supabase test db supabase/tests/database/03_projects.test.sql`.

## API tests

`supabase/tests/api/api.test.mjs`, using Node's built-in test runner. They call the local stack
over HTTP the way the website will. Each run creates its own accounts and deletes them afterwards:

- Gmail sign-ups are rejected and university ones accepted
- a new account's profile is private
- students edit their profile but cannot promote themselves
- a student's draft stays hidden until a faculty member publishes it
- uploads only land in folders the user manages, and only images are accepted

If these fail but the database tests pass, check that the stack was restarted after the last
`config.toml` change: `npm run db:stop && npm run db:start`.

## CI

`.github/workflows/backend.yml` starts a fresh local Supabase on GitHub's runners and runs
`db:test`, `test:api`, and a check that `src/lib/database.types.ts` was regenerated. It runs on
every pull request, so it can be made a required check under Settings > Branches.

Supabase's GitHub integration deploys migrations to the hosted project after the merge to `main`.
CI is the only place a broken migration gets caught before that.

## Testing with people (preview links)

Cloudflare builds a preview of each pull request, but **not for pull requests from forks**. To get
a preview link for faculty, push the branch to the shared repository instead of a fork.

There is only one hosted Supabase project, so previews read and write the **production
database**. When testing on a preview:

- use accounts made for testing, and delete them afterwards
- keep test projects as drafts, and give them titles that start with `TEST`
- don't publish or feature anything you would not want donors to see

A short script for faculty to follow on a preview:

| As | Try | Expect |
| --- | --- | --- |
| Visitor | Browse projects and news | Only published items; private students' names absent |
| Visitor | Sign up with a non-university email | Refused |
| Student | Sign up, fill in the profile, add a photo, turn on "public" | Profile appears on the site |
| Student | Create a project, add teammates and photos, submit for review | Visible to the team, not to visitors |
| Faculty | Publish that project; feature one for donors | Appears on the site and in the showcase |
| Admin | Make a user faculty | They can publish |

## Before merging

- [ ] `npm run db:test` and `npm run test:api` pass locally
- [ ] New tables or rules have tests
- [ ] `npm run db:types` was run and the types file is committed
- [ ] No secrets in the diff (`sb_secret_...`, database passwords)
- [ ] CI is green
