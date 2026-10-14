# Backend setup (Supabase)

The backend is a Supabase project: a Postgres database with access rules, Supabase Auth for
logins, and Supabase Storage for photos. Everything about it lives in `supabase/` and is applied
from git, so the hosted database always matches the repository.

| Path | What it is |
| --- | --- |
| `supabase/migrations/` | The schema, access rules, sign-up rules and photo bucket, in order |
| `supabase/seed.sql` | Test accounts and sample content, **local only** |
| `supabase/config.toml` | Settings for the local stack (ports, auth, hooks) |
| `supabase/tests/database/` | Database tests (pgTAP) |
| `supabase/tests/api/` | End-to-end tests through Auth, the Data API and Storage |
| `src/lib/database.types.ts` | TypeScript types generated from the schema, for the frontend |

How to run the tests is in [testing.md](testing.md).

## What the database holds

| Table | Holds |
| --- | --- |
| `profiles` | One per account: name, headline, bio, photo, links, role (`student`, `faculty`, `admin`) |
| `projects` | Title, summary, description (Markdown), status, tags, cover photo, publish state |
| `project_members` | Who worked on a project and in what role and term. A profile page lists these as experience |
| `project_images` | Project photos, each with required alt text and an optional caption |
| `posts` | Department news |

Who can do what:

| | Visitors | Students | Faculty | Admins |
| --- | --- | --- | --- | --- |
| See published projects and posts | ✓ | ✓ | ✓ | ✓ |
| See profiles | public ones | public ones and their own | all | all |
| Edit own profile | | ✓ | ✓ | ✓ |
| Create a project (starts as a draft) | | ✓ | ✓ | ✓ |
| Edit a project, its team and photos | | if they created it or have edit rights on it | ✓ | ✓ |
| Submit a project for review | | ✓ | ✓ | ✓ |
| Publish, unpublish or feature a project | | | ✓ | ✓ |
| Write news posts | | | ✓ | ✓ |
| Change someone's role | | | | ✓ |

Other rules:

- **Sign-up** is limited to `franciscan.edu` addresses and their subdomains (such as
  `student.franciscan.edu`). The list is in `private.allowed_email_domains`.
- **New profiles are private.** A student turns on "public" before their name and photo appear on
  the site. If a team member's profile is private, the project still lists their role, but the
  profile comes back empty and the site should show no name.
- **Projects** move `draft` → `in_review` (students can do this) → `published` (faculty only).
- **Photos** go in the public `media` bucket, under `avatars/<user id>/`, `projects/<project id>/`
  or `posts/<post id>/`. JPEG, PNG and WebP only, 5 MB maximum. Anyone with an image's URL can
  load it, even for a draft, so don't upload anything that must stay private.

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
| API (Auth, Data API, Storage) | http://127.0.0.1:54321 |
| Studio, a web UI for the database | http://127.0.0.1:54323 |
| Mailpit, where local "sent" emails land | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`npx supabase status` prints these again, with the local keys.

**Test accounts** (password `password123` for all):

| Email | Role |
| --- | --- |
| `admin@franciscan.edu` | admin |
| `faculty@franciscan.edu` | faculty |
| `student1@franciscan.edu` | student, public profile |
| `student2@franciscan.edu` | student, private profile |

**Frontend settings** for local development. Put these in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # "Publishable" key from `npx supabase status`
```

For server-side reads through Hyperdrive, use the read-only login (see
[Using the backend from the frontend](#4-using-the-backend-from-the-frontend)):

```text
postgresql://web_reader:web_reader_local@127.0.0.1:54322/postgres
```

Everyday commands:

| Command | Does |
| --- | --- |
| `npm run db:start` / `npm run db:stop` | Start or stop the local stack. Data survives a stop |
| `npm run db:reset` | Rebuild the database from the migrations and seed. Run it after pulling new migrations |
| `npm run db:test` | Lint the schema and run the database tests |
| `npm run test:api` | Run the end-to-end tests |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` |

After changing `supabase/config.toml`, run `npm run db:stop` then `npm run db:start`.
`db:reset` does not reload it.

## 2. Changing the database

All schema changes go through migration files. Don't create or change tables in the hosted
project's Table Editor or SQL editor: that change is not in git, the next deploy will not know
about it, and it can make the deploy fail.

1. Create a migration file:

   ```bash
   npx supabase migration new add_events
   ```

2. Write the SQL in the new file under `supabase/migrations/`. For a new table:
   - turn on row level security (`alter table ... enable row level security`)
   - grant only what's needed, following the grants in `*_core_schema.sql`
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

5. Open a pull request. CI runs the same tests. When it merges to `main`, Supabase applies the
   migration to the hosted database.

Never edit a migration that has already been merged. Write a new one that changes what you need.

## 3. Hosted project setup (one-time, backend pair)

The hosted project is **Franciscan Site** in the Supabase organization **Franciscan Computing and
Engineering Dept Site** (Free plan). The Free plan has no preview branches, so this one project is
production: local development and tests use the local stack instead.

Give the professor (or whoever will own the site after this semester) Owner access to the
Supabase organization, and keep the database password in a shared password manager.

### 3.1 Connect GitHub

Supabase dashboard > Project Settings > Integrations > GitHub:

| Setting | Value |
| --- | --- |
| GitHub repository | `AmatorMatrisDei/CSC-Dept-Website`, the shared repository, not a fork |
| Working directory | `.` |
| Deploy to production | On |
| Production branch name | `main` |

Connecting the shared repository requires its owner to approve the Supabase GitHub app, so the
owner may need to do this step. While a fork is connected, production changes whenever that fork's
`main` changes, including when someone syncs or pushes to it directly.

On merge to `main`, the integration applies new migrations. It does not apply `seed.sql` or the
Auth settings in `config.toml`, so the local test accounts and localhost URLs never reach
production.

### 3.2 Before the first deploy

The first merge of `supabase/migrations/` creates every table. Check that the hosted database
has no tables of its own first: Table Editor should show nothing in the `public` schema. If
someone created tables by hand, delete them, or the migrations will fail.

To preview what a deploy will do:

```bash
npx supabase login
npx supabase link --project-ref <project ref>   # from the dashboard URL or Settings > General
npx supabase db push --dry-run
```

### 3.3 After the first deploy

1. **Turn on the sign-up rule.** Authentication > Hooks > add **Before User Created** > Postgres
   function > `public.hook_before_user_created`. Without this, anyone can sign up.
2. **URLs.** Authentication > URL Configuration:
   - Site URL: the production site address.
   - Redirect URLs: `http://localhost:3000/**`, `http://localhost:8787/**`, the production
     address, and a wildcard for preview deployments, for example
     `https://*.csc-dept-website.pages.dev/**` on Cloudflare Pages.
3. **Passwords and email.** Authentication > Sign In / Providers > Email: minimum password
   length 8, keep "Confirm email" on.
4. **Email delivery.** Supabase's built-in email only reaches members of the Supabase
   organization, about two messages an hour. Before students sign up, set up one of these:
   - Custom SMTP (Authentication > Emails > SMTP Settings), through the university or a
     transactional email service.
   - "Sign in with Microsoft" (Authentication > Sign In / Providers > Azure), which avoids
     email entirely. It needs university IT to register an app in Microsoft Entra ID.
5. **Password for the read-only login.** In the SQL editor, with a long random password that you
   then store in the password manager:

   ```sql
   alter role web_reader with login password '<long random password>';
   ```

6. **Make the first admin.** Sign up on the site (or Authentication > Users > Add user), then in
   the SQL editor:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@franciscan.edu');
   ```

   After that, admins change roles from the site's admin screens.

7. **Keep-alive.** Free projects pause after a week without activity. In GitHub, shared
   repository > Settings > Secrets and variables > Actions > **Variables**, add
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The "Keep Supabase awake" workflow then reads
   one row every three days. If the project pauses anyway, restore it from the dashboard; no data
   is lost.

### 3.4 Keys

Project Settings > API Keys:

| Key | Where it goes |
| --- | --- |
| Project URL and **publishable** key (`sb_publishable_...`) | Frontend environment variables. Safe to expose: the access rules protect the data |
| **Secret** key (`sb_secret_...`) | Nowhere in the frontend or git. Only trusted server code or admin scripts |

## 4. Using the backend from the frontend

- **Pages for visitors** (server-rendered): query Postgres through Cloudflare Hyperdrive as
  `web_reader`. It is a member of the `anon` role, so it sees exactly what a signed-out visitor
  sees and cannot write. Don't connect as `postgres`: that user bypasses every access rule.
  For Hyperdrive, take the **Session pooler** string from the dashboard's Connect button and
  replace the user with `web_reader.<project ref>` and the password with the one from step 3.3.
  Check it with `psql "<string>" -c 'select count(*) from public.projects'` before creating the
  Hyperdrive config.
- **Signed-in features** (profile editing, project editing, admin screens): use
  `@supabase/supabase-js` with the publishable key, and `@supabase/ssr` to keep the session in
  cookies for Next.js. Requests carry the user's session, so the access rules apply to them.
- **Types:** `createClient<Database>(url, key)` with `Database` from
  `src/lib/database.types.ts` gives typed queries.
- **Images:** a file's public address is
  `<SUPABASE_URL>/storage/v1/object/public/media/<path>`. Add the Supabase host to
  `images.remotePatterns` in `next.config.ts` to use `next/image`. Resize photos in the browser
  before uploading (about 2000px on the long side), because the Free plan has 1 GB of file storage
  in total and no image resizing.
- **Markdown:** `projects.description` and `posts.body` are Markdown. Render them without
  allowing raw HTML.

## 5. Free plan limits

| Limit | What to do |
| --- | --- |
| Pauses after a week without activity | The keep-alive workflow |
| 500 MB database, 1 GB file storage | Resize photos before upload |
| No automatic backups | Before launch, ask the department about the Pro plan |
| Built-in email only reaches organization members | Custom SMTP or Microsoft sign-in (3.3, step 4) |
| No preview branches | Test against the local stack. Preview deployments of the site use the production database |

Check current limits at https://supabase.com/pricing before relying on them.
