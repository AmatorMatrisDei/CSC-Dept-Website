# The change-log

There is no shared `CHANGELOG.md` file: one file that everyone edits causes merge conflicts. Instead, **every pull request describes its own change**, and the list of what changed between two points in time is put together from the pull requests merged in that time.

## What each pull request does
The pull request template has a **What changed** section. Fill it in with a few bullets in plain words, for someone who uses or runs the site and hasn't read the code:

- Good: "Students can now edit the photos on a project after it is submitted."
- Not enough: "Updated ProjectForm.tsx."

Mention database changes, new settings or secrets, and anything a teammate must do after merging. A check named **Change-log entry** fails until the section has some text. AI assistants are told to do this in [AGENTS.md](../AGENTS.md) (and the files that point to it), so it also applies when someone uses one to open the pull request.

## Getting the total change-log
```bash
npm run changes -- v1              # everything merged after the v1 tag
npm run changes -- v1 v2           # between two tags
npm run changes -- 2026-10-20      # after a date
npm run changes -- 2026-10-20 2026-11-03
```
It prints each pull request merged into `staging` in that time, oldest first, with its date, author, link and "What changed" text. It needs the GitHub CLI (`gh`) signed in to GitHub. Pull requests from before the section existed show their whole description instead.

To get a readable summary, paste the output to an AI assistant and ask it to turn it into a short bulleted list, grouped by area (for example "New pages", "Fixes", "Behind the scenes").

## Versions
`v1` is the site as it was shown to the professor on 2026-10-20 (the last merge before noon, pull request #56). Mark a new version with a tag on the commit that represents it:

```bash
git tag -a v2 <commit> -m "V2: what this version is"
git push origin v2
```

Then `npm run changes -- v1 v2` is the change-log for that version.
