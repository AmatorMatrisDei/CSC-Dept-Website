# How the frontend works

This explains, with the real code, how the website's frontend is built: what each part does, how
pages get their data, how sign-in and roles appear on screen, how the student, reviewer and admin
screens work, and what keeps the site safe, fast and accessible. Its partner,
[backend-explained.md](backend-explained.md), covers the database side. Everything here was
checked against the `staging` branch on 2026-10-20.

Contents:

1. [The big picture](#1-the-big-picture)
2. [Where things live](#2-where-things-live)
3. [Pages and who can open them](#3-pages-and-who-can-open-them)
4. [How a page gets its data](#4-how-a-page-gets-its-data)
5. [Signing in, on screen](#5-signing-in-on-screen)
6. [Student forms](#6-student-forms)
7. [Reviewer screens](#7-reviewer-screens)
8. [Admin tools](#8-admin-tools)
9. [The home page, browsing and the planner](#9-the-home-page-browsing-and-the-planner)
10. [Look, motion and accessibility](#10-look-motion-and-accessibility)
11. [Security in the browser](#11-security-in-the-browser)
12. [Speed](#12-speed)
13. [Build, deploy and environments](#13-build-deploy-and-environments)
14. [The tests](#14-the-tests)
15. [Open work](#15-open-work)

---

## 1. The big picture

The site is a **single-page app**. The browser downloads it once from Cloudflare Pages, and from
then on React draws each page and fetches data straight from Supabase. There is no server of our
own in between, so the frontend never decides what someone *may* see. It shows the screen, and
the database's rules decide what data comes back (see the backend document, section 5).

```
Cloudflare Pages ──(index.html + one JavaScript bundle)──► Browser
                                                            │  React draws the page
                                                            │  supabase-js fetches data
                                                            ▼
                                                         Supabase
```

| Tool | Version | Its job here |
| --- | --- | --- |
| React | 19 | Draws every page from components |
| TypeScript | 5 | Types for all code; the build stops on a type error |
| Vite | 8 | Development server and production build |
| Tailwind CSS | 4 | Styling with utility classes, plus our color tokens in `index.css` |
| React Router | 7 | Turns the address bar into pages |
| supabase-js | 2 | Talks to Supabase: data, sign-in, photos |
| anime.js | 4 | The home page intro and cards fading in (loaded only when needed) |
| markdown-to-jsx | 9 | Shows project descriptions written in Markdown, safely |
| ExcelJS | 4 | The planner's Excel download (loaded only when someone clicks it) |
| Montserrat | via `@fontsource` | The typeface, served from our own site |

---

## 2. Where things live

| Path | What it is |
| --- | --- |
| `index.html` | The page shell: title, icons, the theme script, the empty `<div id="root">` |
| `src/main.tsx` | Starts React, the router and Edit mode |
| `src/App.tsx` | Every route, and the layout every page sits in |
| `src/pages/` | One component per page; `account/` and `review/` are the signed-in pages |
| `src/components/` | Shared pieces: header, footer, forms, carousel, project browser, directory, pop-ups |
| `src/lib/` | Everything that isn't drawing: data access, sign-in, rules, helpers, motion |
| `src/lib/database.types.ts` | Types generated from the database (`npm run db:types`); never edited by hand |
| `src/index.css` | Color tokens for light and dark, and motion timing |
| `public/` | Files served as they are: `_headers` (security headers), icons, `robots.txt`, `theme-init.js` |

The data files in `src/lib/` are the only place that talks to Supabase:

| File | Used by | Reads and writes |
| --- | --- | --- |
| `content.ts` | Public pages | Published projects, faculty, listed students, the carousel; admin saves |
| `account.ts` | A signed-in student's pages | Their consents, submissions, photos, role |
| `review.ts` | Reviewer pages | The queue, one submission, decisions, the waiting count |
| `people.ts` | The admin People page | Everyone's role |
| `siteText.ts` | Any page with editable wording | `site_content` |
| `planner/` | The planner | Catalog years, courses, programs, the saved plan |

---

## 3. Pages and who can open them

From `src/App.tsx`. Every page sits inside one `Layout`: header, the page, footer.

| Address | Page | Who |
| --- | --- | --- |
| `/` | Home: intro, featured carousel, project browser | Anyone |
| `/projects`, `/projects/:slug` | All projects; one project | Anyone (published only) |
| `/faculty`, `/faculty/:slug` | Faculty; one professor | Anyone |
| `/students`, `/students/:slug` | Student directory; one student | Anyone (listed students only) |
| `/students/request` | How to be added to the directory | Anyone |
| `/about` | About the department | Anyone |
| `/planner`, `/planner/courses` | Degree planner; course catalog | Anyone; saving needs sign-in |
| `/account/sign-in`, `/account/password` | Sign in or up; set a new password | Anyone |
| `/account` and below | Dashboard, profile form, project and internship forms | Signed in |
| `/review`, `/review/:id` | Review queue; one submission | Reviewers and admins |
| `/people` | Everyone's role | Admins (the page itself shows only what the database returns) |
| anything else | Not found | Anyone |

---

## 4. How a page gets its data

### 4.1 One hook for loading

Pages load data with `useAsync(loader, ...args)` from `src/lib/hooks.ts`. It runs the loader,
returns `undefined` while waiting (the page shows "Loading…"), and reloads when the arguments
change:

```tsx
// src/pages/ProjectDetail.tsx
export default function ProjectDetail() {
  const { slug = "" } = useParams();
  const [project, reload] = useReloadable(getProject, slug);   // from content.ts
  useTitle(project?.title ?? "Project");                       // the browser tab's title
  // …
  if (project === undefined) return <p className="text-muted">Loading…</p>;
  if (project === null) return <NotFound what="project" />;
  // … draws the project
}
```

Two relatives:

- `useReloadable` keeps the old data on screen while fresh data loads after an edit, so an open
  editor doesn't flash.
- `useAction` runs a form's save, tracks "busy", and turns errors into readable messages.

### 4.2 What a read looks like

From `content.ts`:

```ts
async function fetchProjects(): Promise<ProjectView[]> {
  // Row level security already hides unpublished work from visitors; filtering here keeps it
  // hidden from signed-in people too, so public pages show the public view.
  const { data, error } = await client()
    .from("projects")
    .select(PROJECT_SELECT)                    // the project plus its people, advisors, photos
    .eq("published", true)
    .eq("contributions.confirmed", true)
    .returns<ProjectRow[]>();
  if (error) throw error;
  return data.map(toProject).sort(compareProjects);
}
```

That one call is one `GET /rest/v1/projects?select=…&published=eq.true` request. Public pages read
people only from the `listed_students` view, never from `profiles`, so an unlisted student never
appears, even to a signed-in reviewer looking at the public pages. The project list, which several parts of a page
need, is fetched once per page load and shared. It's cleared after an approval or an admin edit,
so the next page shows fresh data.

### 4.3 When something fails

If a page's data can't load (Supabase down, a dropped connection), `ErrorBoundary` replaces only
that page with "Content could not be loaded" and a **Try again** button. The header and footer sit
outside it and keep working, and moving to another page clears the error:

```tsx
<main id="main">
  <ErrorBoundary resetKey={pathname}>   {/* a new address resets it */}
    <Outlet />                          {/* the current page */}
  </ErrorBoundary>
</main>
```

---

## 5. Signing in, on screen

### 5.1 The session

`src/lib/auth.ts` keeps the signed-in session in one place and tells every component when it
changes:

```ts
supabase?.auth.onAuthStateChange((_event, next) => {
  session = next;                      // undefined = still checking, null = signed out
  listeners.forEach((listener) => listener());
});
export function useSession() { return useSyncExternalStore(subscribe, () => session); }
```

supabase-js stores the tokens in the browser, renews the 1-hour access token automatically, and
adds it to every request. The site's own code never handles a password beyond passing it to
`signInWithPassword` or `signUp`.

### 5.2 Guarding the signed-in pages

`AccountLayout` wraps every `/account`, `/review` and `/people` page:

```tsx
if (session === null) {
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/account/sign-in?next=${next}`} replace />;   // come back after sign-in
}
return reviewer ? <ReviewersOnly session={session} /> : <Outlet context={session} />;
```

With `reviewer`, it also checks the role (`getMyRole`) and shows "Reviewers only" to students.

**This is a convenience, not the protection.** A student who forced their way onto `/review`
would see an empty queue, and any decision they tried would get a 403. That's because the database
checks the role again on every read and every action. The frontend only hides screens people
can't use.

### 5.3 The `?next=` guard

After sign-in, the site goes to the `next` address. A crafted link like
`/account/sign-in?next=https://evil.example` could send someone to another site, so `safeNext`
only allows paths on this site:

```ts
export function safeNext(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/account";   // "/x" yes; "//x", "/\x", "https://" no
}
```

---

## 6. Student forms

Everything a student sends goes through `account.ts`, and **nothing they submit is live until a
reviewer approves it**.

- **Permissions first, at once.** The profile form starts with the consents: listed in the
  directory, show my photo, my email, my phone. Each is a single `POST /rest/v1/consents` and takes
  effect immediately. Revoking adds a date to it; nothing is deleted.
- **Then the submission.** Saving the profile, a project or an internship inserts one row into
  `pending_changes`. That row holds the kind (`profile`, `project`, `internship`), the action
  (`create`, `update`, `delete`) and the proposed fields. The dashboard lists the student's
  submissions with their status. A returned one shows the reviewer's note and can be edited and
  resent; a waiting one can be withdrawn.
- **Photos are prepared on the device.** Before upload, each photo is shrunk to 2000 px on its
  long side and re-encoded as JPEG. That also removes camera metadata, including GPS location. It
  goes into the student's own folder with a random name:

  ```ts
  const blob = await preparePhoto(file);                                   // resize, re-encode
  const path = `${folder}/${userId}/${crypto.randomUUID()}.jpg`;           // avatars/ or submissions/
  await client().storage.from("media").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  ```

  If a submission fails after its photos uploaded, the form deletes those unused uploads.
- **Clear messages.** Errors are shown next to the form in plain wording:
  - The database's own checks already speak plainly, for example "Agree to showing your photo
    before adding one".
  - `friendlyError` translates the technical ones. A failed `https_url` check becomes "Links must
    start with https:// and contain no spaces."; a photo over the limit becomes "That photo is too
    large. Photos must be under 5 MB."

---

## 7. Reviewer screens

- **The queue** (`/review`) has two tabs. *Waiting* shows the oldest first, so nobody waits
  longest. *Decided* shows the latest 50 decisions. Each row says what kind of submission it is
  and names the project or internship it changes.
- **One submission** (`/review/:id`) shows **what's on the site now beside what the student
  proposes**, field by field, so the reviewer sees exactly what changed. Approving applies it at
  once. Asking for changes or rejecting needs a note, which the student sees. The decision is a
  single `POST /rest/v1/rpc/review_change`.
- **The waiting count.** For reviewers and admins, the account menu shows "Review queue (3)", with
  a bar under the header while anything is waiting. It's refreshed on every page change, whenever
  the browser tab comes back into view, and every two minutes:

  ```ts
  void check();                                           // now
  const timer = window.setInterval(check, 120_000);       // every 2 minutes
  document.addEventListener("visibilitychange", onVisible); // when the tab comes back
  ```

  A failed check just keeps the last count; the header never shows an error. Reviewers also get
  GroupMe messages (backend document, section 9).

---

## 8. Admin tools

- **Edit mode.** Admins see an Edit mode switch in a bar along the bottom of the page (it folds down to a small tab). When it's on, editable text gets an
  outline; click it and type right on the page. Enter (or clicking away) saves and Escape cancels.
  This covers page wording, project, student and faculty details, and the About page.
  - Page wording uses `<SiteText id="about.mission" fallback="…">`. The page ships with its default
    text, and a row in `site_content` replaces it once an admin edits it. If that table can't be
    reached, the defaults show, so the site never breaks over it.
    Edits are drafts, shown only to editors until the bar's Publish; the bar's History lists earlier
    versions, each with a Restore that makes it a draft again. Edits to project, student and faculty
    pages, and a project's photos (`ProjectPhotos`), are drafts too (`lib/recordDrafts.ts`): the page
    shows the draft in Edit mode and the bar's Publish makes everything live together. The History panel lists
    replaced record details and the last 3 replaced photos per project; restoring a photo makes a draft (student and faculty portraits work the same way through `EditablePortrait`: click to change, "Remove photo", last 3 kept in the History), and a file in the photo history is never deleted by clean-up. In Edit mode, clicking a
    picture on a project page replaces it (`ClickToReplace`); that is a draft as well.
  - On a project page, Edit mode also shows a Photos panel (`ProjectPhotos`): replace the cover photo,
    and add, describe, caption, reorder and remove gallery photos. Photos go to `projects/<id>/` in
    storage (admins only) and save right away; replaced photos are deleted.
  - Lists use `<SiteList id="about.highlights.items">` (the id ends in `.items`). Editors add, remove
    and reorder entries (title, text, optional link); visitors see nothing while the list is empty.
  - Record details use `<Editable>`, which saves with `saveRow`:

    ```ts
    const { data, error } = await client().from(table).update(patch).eq("slug", slug).select("slug");
    if (!data?.length) return "Could not save: you may not have permission.";   // zero rows = refused
    ```

  `EditProvider` turns the switch on only for admins. The database's admin-only rules decide what
  any save may do. A publish is written to the audit log with the columns it changed (contact details are named, never their values).
- **People** (`/people`) lists every account with its role, and lets an admin promote or demote
  someone without running SQL. The database refuses to demote the last admin.

---

## 9. The home page, browsing and the planner

- **Featured carousel.** Shows the day's picked projects (`carousel_today`) and loops in both
  directions. Autoplay stops while the visitor hovers over or focuses it, when they press Pause,
  and always when their system asks for reduced motion. Arrow buttons and dots work by keyboard.
- **Project browser** (home and `/projects`). Search by title, and filter by category, status,
  sub-department, year started (from the project's start date) and faculty advisor. A link can set
  a filter: the top menu's "Projects › 2025" opens `/projects?year=2025`.
- **Student directory.** Listed students only. Search by name or skill, and filter by major and
  class year.
- **Profile pop-up.** Clicking a student's or professor's picture opens a small card with their
  name and quick facts. It uses the browser's `<dialog>`, so focus moves into it, Escape closes it,
  and screen readers announce it. Its contents exist only while it's open.
- **Project descriptions** are written in Markdown (section 11.3).
- **Degree planner.**
  - Pick the semester you started (fall or spring), your program and an optional minor. The
    planner loads that catalog year's courses and the catalog's suggested plan.
  - Signed-in students switch to *My plan* to drag courses between semesters (or use the "Move
    to" menu, which works by keyboard and on phones) and mark courses completed.
  - The plan logic is in `src/lib/planner/plan.ts`. It warns about prerequisites, terms, odd or
    even years and credit loads, and checks off program requirements.
  - The plan saves to the student's account a moment after each change. Excel and CSV downloads
    are available.
  - The course catalog page (`/planner/courses`) has a year picker; admins edit courses and plans
    one year at a time.

---

## 10. Look, motion and accessibility

### 10.1 Colors and dark mode

All colors are tokens in `src/index.css`. Each has a light and a dark value, taken from
Franciscan's web style guide (green `#21412a`, gold `#998643`):

```css
--accent: light-dark(#21412a, #d9bf68);   /* green in light mode, gold in dark */
```

The site follows the visitor's system setting until they press the theme button. Their choice is
saved in the browser, and `public/theme-init.js` applies it before the first paint so the page
doesn't flash. It's a separate file, not inline in `index.html`, because the security policy
forbids inline scripts.

### 10.2 Motion

- anime.js loads only when a page first asks for it (`src/lib/motion.ts`), and only the functions
  we use (`src/lib/anime.ts`).
- **Everything respects reduced motion** (`(prefers-reduced-motion: reduce)`). With it on, or if
  anime.js can't load, items simply appear.
- The **home intro** (about 1.3 seconds): the department mark draws itself while its gears turn
  one tooth, the headline rises word by word, and the rest fades in. Links work throughout, and
  nothing waits on the animation.
- **Card lists** fade up as they scroll into view, one after another (`RevealList`). Hidden
  starting states have a failsafe in CSS, so content can never stay invisible.

### 10.3 Accessibility

- **A "Skip to content" link** comes first on every page, so keyboard users can jump past the
  menus.
- **Every form control has a visible label.** Hints and errors are tied to their field
  (`aria-describedby`), and every button and link target is at least 44 px tall (`min-h-11`).
- **Pop-ups use the browser's `<dialog>`**, with correct focus and Escape to close.
- **Images:** project thumbnails require alt text, enforced by the database. Decorative placeholders
  and the department mark are hidden from screen readers. People without photos get an initials
  placeholder on a tint picked from their name.
- **Every page sets its own browser tab title** (`useTitle`).
- **No information is shown by color alone.** Statuses and warnings are written out.

---

## 11. Security in the browser

The frontend's job is to never be the thing that keeps data safe, and to give an attacker nothing
to work with.

### 11.1 Only the publishable key

```ts
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;   // sb_publishable_…: acts as a visitor
export const supabase = url && key ? createClient(url, key) : null;
```

Anything the browser holds can be read by anyone, so the bundle contains only the project address
and the **publishable** key. That key can only do what a visitor may. The secret key never goes
near the frontend, and `.env.local` is git-ignored. Signed-in requests add the user's own access
token, so they act as that user and no one else.

### 11.2 Security headers (`public/_headers`)

Cloudflare sends these with every page:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
  img-src 'self' data: blob: <our two Supabase projects>; connect-src <our two Supabase projects>;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

What that means:

- **`script-src 'self'`:** only our own script files run. No inline scripts, no scripts from
  other sites. Injected text can't become running code.
- **`connect-src`:** the page can only send data to our two Supabase projects. Even a bug couldn't
  leak data to another server.
- **`img-src`:** images only from our site and our Supabase storage.
- **`frame-ancestors 'none'` and `X-Frame-Options: DENY`:** no other site can embed ours in a frame
  to trick clicks.
- **`Permissions-Policy`:** the site can't ask for the camera, microphone or location.
- **Fonts** are served from our own site (`font-src 'self'`), so no font service sees who visits.

### 11.3 Text people type

- **React escapes everything** it draws, so a name like `<script>…` shows as text.
- **Markdown is shown safely** (`src/lib/markdown.ts`), and the unit tests check each rule:

  ```ts
  export const markdownOptions = {
    disableParsingRawHTML: true,   // HTML typed into a description is shown as text, never run
    overrides: {
      a: Link,    // javascript: links dropped by the sanitizer; outside links get rel="noopener noreferrer"
      img: Image, // other sites' images would be blocked anyway, so they become a link instead
      h1: heading("h3", "…"),   // headings start below the page's own
      // …
    },
  };
  ```

- **Outside links** open in a new tab with `rel="noopener noreferrer"`, so the other site can't
  control ours or see where the visitor came from.

### 11.4 Other details

- **Open redirects** are blocked by `safeNext` (section 5.3).
- **Previews and the developer site stay out of search results.** Cloudflare marks them
  `noindex`; `robots.txt` lets search engines index only the live site.
- **The frontend is never trusted.** Every role check on screen is repeated by the database, so
  editing the JavaScript in a browser gains nothing.

---

## 12. Speed

- **Big libraries load only when needed:**

  ```ts
  const loadMarkdown = () => import("@/components/Markdown");      // only on project pages
  const { Workbook } = await import("exceljs");                    // only on "Download Excel"
  request ??= import("./anime");                                   // only when a page animates
  ```

- **The project list** is fetched once per page load and shared by every part of the page that
  needs it.
- **Photos are shrunk before upload** (section 6), which keeps pages light and the 1 GB storage
  free.
- **Fonts:** only the Latin subset of Montserrat, in the 4 weights we use.
- **Covers sit in fixed 16:9 frames**, so the layout doesn't jump while images load.

---

## 13. Build, deploy and environments

| Command | Does |
| --- | --- |
| `npm run dev` | The site at http://localhost:5173 with live reload |
| `npm run build` | Type-checks (`tsc`), then builds into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run lint` | ESLint, including the React hooks rules |
| `npm run test:unit` | The 28 unit tests |
| `npm run test:e2e` | The 16-step browser test (needs the local Supabase) |

The site needs two settings, in `.env.local` locally and in Cloudflare's build settings when
hosted:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Cloudflare Pages builds every push (build command `npm run build`, output `dist`, Node 22):

| Branch | Site | Database |
| --- | --- | --- |
| `main` | https://csc-dept-website.pages.dev | Production |
| `staging` | https://staging.csc-dept-website.pages.dev (the working site) | Dev |
| any other branch | A preview link, posted on its pull request | Dev |

Because the app draws its own pages, Cloudflare serves `index.html` for any address, and React
Router picks the page. If the site ever needs a new outside address (another image host, say), it
must be added to the security policy in `public/_headers`, or browsers will block it.

---

## 14. The tests

**Lint and type-check** run on every pull request (`.github/workflows/frontend.yml`). The build
fails on any type error.

**28 unit tests** (`npm run test:unit`) test the pure logic, without a browser:

| File | Tests | What they check |
| --- | --- | --- |
| `src/lib/planner/plan.test.ts` | 6 | Suggested plans and spring starts; calendar labels; moving and adding courses; requirement checking; warnings for prerequisites, terms, odd and even years, corequisites |
| `src/lib/markdown.test.ts` | 6 | Formatting; HTML shown as text, never run; unsafe link addresses dropped; outside links in a new tab; headings below the page's; images become links |
| `supabase/functions/_shared/review-message.test.ts` | 5 | The GroupMe message wording, and that it never names the student |
| `src/lib/placeholder.test.ts` | 4 | Names lose titles and suffixes; initials; sorting by surname; steady tints |
| `src/lib/format.test.ts` | 3 | Paragraphs; project years newest first; dates the same in every time zone |
| `src/lib/list.test.ts` | 2 | Comma and line lists |
| `src/lib/safeNext.test.ts` | 2 | Paths on this site kept; anything else goes to the account page |

**The 16-step browser test** (`npm run test:e2e`, `tests/e2e/student-submissions.test.mjs`) drives
Chrome through the real site against a local Supabase. It plays a student and a reviewer from
sign-up to approval. It covers photos, returns with a note, resubmitting, teammates confirming,
removal requests, self-approval, and that the forms fit a phone screen. It runs on every pull
request in the Backend workflow.

---

## 15. Open work

Open issues on GitHub that touch the frontend:

| Issue | What |
| --- | --- |
| #27 | Serve resized photos instead of 2000 px originals |
| #28 | Project gallery with natural proportions and a lightbox |
| #29 | Let admins add faculty photos and a short bio |
| #30 | A home page hero photo and subject-specific placeholders |
| #31 | Public pages for news, alumni stories and partner organizations |
| #34 | Animate filtering in the project browser and directory |
| #35 | Carousel autoplay progress and swipe |
| #36 | Split routes so visitors don't download the planner and account pages |
| #37 | Stop refetching shared lists on every page |
| #38 | Per-page titles, descriptions and share images |
| #45 | Home page headings, landmarks and link behavior |

Not yet built: the admin panel's carousel Re-shuffle button (the function behind it works), and
the Algorithms team's real carousel pick (backend document, section 8.3).
