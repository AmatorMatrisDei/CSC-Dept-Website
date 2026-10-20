# How we work on this site

A one-page guide for teammates. It is the human version of [AGENTS.md](../AGENTS.md), which tells
AI assistants the same things. If you use an AI helper, point it at that file at the start.

## The path every change takes

**your branch -> `staging` -> `main`**

| Step | Where | What you see | Database |
| --- | --- | --- | --- |
| 1. Build it | your branch | a preview link on your pull request | dev |
| 2. Check it | `staging` | the developer site, https://staging.csc-dept-website.pages.dev | dev |
| 3. Publish it | `main` | the live site, https://csc-dept-website.pages.dev | production |

Your pull request always goes **into `staging`**. Only the team lead opens the pull request from
`staging` into `main`.

## Doing a task

1. **Pick an issue** and comment "Working on this one." Check its **size tier** ([issue-sizes.md](issue-sizes.md)); if you are new, start with a Tier 1 or 2.
2. **Start from `staging`:**
   ```bash
   git switch staging && git pull
   git switch -c feature/short-description
   ```
3. **Build it.** Run `npm run dev` to see it. Read the relevant part of [frontend-explained.md](frontend-explained.md) or [backend-explained.md](backend-explained.md) first if you are unsure where something goes.
4. **Check it** with `npm run lint`, `npm run test:unit` and `npm run build`. If you touched the database, sign-in, student forms or review queue, also run the tests listed in the pull request template (they need Docker).
5. **Open a pull request into `staging`.** Fill in **What changed** in plain words (see below).
6. **Get a review.** One teammate (a code owner) approves. You cannot approve your own. If you push more changes after approval, the approval resets and you need it again.
7. **Merge, then look at the developer site** to make sure it works there.

## The change-log: say what changed

Every pull request needs a **What changed** section: a few plain bullets about what is different
for someone using the site. "Students can now edit project photos after submitting" is good;
"edited ProjectForm.tsx" is not. A check on the pull request fails until it is filled in. Also
mention database changes, new settings, or anything a teammate must do after merging.

There is no shared change-log file, so there are no conflicts. To get the full list for any period
(for a meeting, or to ask an AI to summarize it), run `npm run changes`. See
[change-log.md](change-log.md).

## Do and don't

**Do**
- Keep changes small and focused on one issue.
- Make it work on a phone first (375 px wide), then tablet and desktop. Nothing scrolls sideways, and buttons are easy to tap.
- Use the site's color variables so light and dark mode both look right.
- Give images alt text, and use one main heading per page.
- Put content (people, courses, events, wording) in the database or data files, not in the page code.
- Add tests for what you build.

**Don't**
- Don't push to `staging` or `main` directly.
- Don't open a pull request into `main`.
- Don't run database migrations on the dev or live database yourself. They are applied when your pull request merges.
- Don't commit passwords or keys. Only the publishable key ever goes in the site.
- Don't add a library without asking first.
- Don't hide something with a button and call it secure: anything private must also be locked in the database.

## Working with an AI assistant

Tell it to read [AGENTS.md](../AGENTS.md) first. Make sure it:
- branches from `staging` and targets `staging`,
- fills in **What changed** from what was really done,
- runs the checks and reports honestly if one fails,
- asks you before pushing, opening a pull request, or posting on GitHub.

Always read what it wrote before you submit it. You are responsible for the pull request.

## Where to find things

| I want to... | Look at |
| --- | --- |
| Set up my computer | [README](../README.md#getting-started) |
| Understand how the site works | [frontend-explained.md](frontend-explained.md), [backend-explained.md](backend-explained.md) |
| Run or write tests | [testing.md](testing.md) |
| Set up or change the database | [backend-setup.md](backend-setup.md) |
| Size or prioritize an issue | [issue-sizes.md](issue-sizes.md) |
| See what changed between two dates | [change-log.md](change-log.md) |
