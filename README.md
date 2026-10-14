# CSC-BUS-Dept-Website
A landing page for the Department of Engineering and Computing.

Built with [Next.js](https://nextjs.org) (React) as the frontend for a headless [Drupal](https://www.drupal.org) CMS,
hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/) via [OpenNext](https://opennext.js.org/cloudflare),
with PostgreSQL on [Supabase](https://supabase.com) (planned move to Azure).

## Getting started

Requires **Node.js 22+** (Wrangler needs it). With nvm: `nvm use`.

```bash
npm install
cp .env.example .env.local   # optional: point at a Drupal site
npm run dev                  # Next.js dev server at http://localhost:3000
npm run preview              # production build running in the local Workers runtime
```

Without `DRUPAL_BASE_URL` set, the site shows sample content.

## Connecting Drupal

1. In Drupal, enable the core **JSON:API** module (`drush en jsonapi`).
2. Set `DRUPAL_BASE_URL` in `.env.local` for local dev, and in `wrangler.jsonc` → `vars` for Cloudflare
   (also set it in the build environment so pages are prerendered with real content).
3. Articles are read from `/jsonapi/node/article` — see `src/lib/drupal.ts`.

Content is cached for up to an hour. To refresh immediately when editors save,
have Drupal send a `POST` to `/api/revalidate` with header
`x-revalidate-secret: <DRUPAL_REVALIDATE_SECRET>`.

Drupal itself is PHP and **cannot run on Cloudflare** — it needs its own host (e.g. Pantheon, Acquia,
a VM, or Azure App Service later). It can use the same Supabase Postgres as its database.

## Database (Supabase → Azure)

The site connects to Postgres through Cloudflare **Hyperdrive** (`src/lib/db.ts`, binding `HYPERDRIVE`).
Hyperdrive pools connections at the edge, and because the code only sees a standard Postgres
connection string, moving to Azure Database for PostgreSQL is a config change, not a code change.

- Use Supabase's **direct connection** (port 5432) or **session pooler** string for Hyperdrive —
  not the transaction pooler (6543), since Hyperdrive does its own pooling.
- `GET /api/health` checks the database connection.
- Local dev uses `localConnectionString` in `wrangler.jsonc`. Point it at the local read-only login:
  `postgresql://web_reader:web_reader_local@127.0.0.1:54322/postgres`.
- Connect as `web_reader`, not `postgres`: `postgres` bypasses the database's access rules.
  See [docs/backend-setup.md](docs/backend-setup.md#4-using-the-backend-from-the-frontend).

To migrate to Azure later:
```bash
npx wrangler hyperdrive update <HYPERDRIVE_ID> --connection-string="postgres://...azure..."
```

## Deploying to Cloudflare (one-time setup)

```bash
npx wrangler login
npx wrangler r2 bucket create csc-dept-website-cache
npx wrangler d1 create csc-dept-website-tags         # paste database_id into wrangler.jsonc
npx wrangler hyperdrive create csc-dept-website-db \
  --connection-string="postgres://web_reader.<project-ref>:<password>@<session-pooler-host>:5432/postgres"
                                                      # paste id into wrangler.jsonc
npx wrangler secret put DRUPAL_REVALIDATE_SECRET
npm run cf-typegen                                    # regenerate types after editing wrangler.jsonc
npm run deploy
```

For automatic deploys on merge to `main`, connect this repo in the Cloudflare dashboard
(Workers & Pages → your worker → Settings → Builds) with build command `npx opennextjs-cloudflare build`
and deploy command `npx opennextjs-cloudflare deploy`.

### Cloudflare resources used

| Binding | Service | Purpose |
| --- | --- | --- |
| `ASSETS` | Workers Static Assets | JS/CSS/images |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 | Cached pages and data |
| `NEXT_TAG_CACHE_D1` | D1 | Cache tags for `/api/revalidate` |
| `NEXT_CACHE_DO_QUEUE` | Durable Objects | Background hourly revalidation |
| `HYPERDRIVE` | Hyperdrive | Postgres connection pooling |
| `IMAGES` | Images | `next/image` optimization |

## Project layout

- `src/app/` — pages (`/`, `/news`, `/news/[id]`) and API routes (`/api/revalidate`, `/api/health`)
- `src/components/` — shared UI (header, footer, article list)
- `src/lib/drupal.ts` — Drupal JSON:API client and sample fallback content
- `src/lib/db.ts` — Postgres access via Hyperdrive
- `wrangler.jsonc`, `open-next.config.ts` — Cloudflare Workers configuration

## Known limitations

- **Next.js is pinned to 16.3.8.** 16.4.0 crashes on Workers with OpenNext 1.20.11
  (`Unexpected loadManifest(/.next/server/preview-props.json)`). Upgrade once OpenNext supports it.
- **Cache Components (`cacheComponents`) is off.** With it enabled, re-rendering after revalidation
  hangs in the Workers runtime. Caching uses `fetch` `next.revalidate`/`tags` instead.

## Backend (Supabase)

The database schema, access rules, sign-up rules and photo storage live in `supabase/` and deploy
from git. Requires Docker Desktop.

```bash
npm run db:start    # local Supabase with test accounts and sample projects
npm run db:test     # database tests
npm run test:api    # end-to-end tests
```

- [docs/backend-setup.md](docs/backend-setup.md): local harness, changing the schema, hosted project setup
- [docs/testing.md](docs/testing.md): what the tests cover and how to test with faculty

## To edit code
- Fork the repository, make changes, and send a Pull Request (PR)
- Review edits and Merge to instantly update the repository
