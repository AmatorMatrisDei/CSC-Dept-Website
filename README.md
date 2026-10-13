# CSC-BUS-Dept-Website
A landing page for the Department of Engineering and Computing.

Built with [Next.js](https://nextjs.org) (React) as the frontend for a headless [Drupal](https://www.drupal.org) CMS.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: point at a Drupal site
npm run dev
```

Open http://localhost:3000. Without `DRUPAL_BASE_URL` set, the site shows sample content.

## Connecting Drupal

1. In Drupal, enable the core **JSON:API** module (`drush en jsonapi`).
2. Set `DRUPAL_BASE_URL` in `.env.local` (e.g. `https://cms.example.edu`).
3. Articles are read from `/jsonapi/node/article` — see `src/lib/drupal.ts`.

Content is cached for up to an hour. To refresh immediately when editors save,
have Drupal send a `POST` to `/api/revalidate` with header
`x-revalidate-secret: <DRUPAL_REVALIDATE_SECRET>`.

## Project layout

- `src/app/` — pages (`/`, `/news`, `/news/[id]`) and the revalidate API route
- `src/components/` — shared UI (header, footer, article list)
- `src/lib/drupal.ts` — Drupal JSON:API client and sample fallback content

## To edit code
- Fork the repository, make changes, and send a Pull Request (PR)
- Review edits and Merge to instantly update the repository
