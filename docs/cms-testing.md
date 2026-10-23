# CMS test plan

The page-text editor (drafts, publishing, history) has a few tests today. This is the list of what
should be covered, so several people can each take a section. Tick a line when its test exists.

## Where each kind of test goes

| Kind | File | Run with | Good for |
| --- | --- | --- | --- |
| Database | `supabase/tests/database/14_cms_drafts.test.sql` (add files `15_…` for new areas) | `npm run db:test` | Who may do what, clean-up of values, conflicts, history |
| Browser | `tests/e2e/cms-editing.test.mjs` | `npm run test:e2e:cms` | The edit bar, what editors and visitors see |
| Concurrency | `supabase/tests/api/cms-concurrency.test.mjs` | `npm run test:api:cms` | Several signed-in editors calling the database at the same moment |
| Unit | `src/**/*.test.ts` | `npm run test:unit` | Pure functions, such as value checks done in the browser |

Copy the closest existing test and change it. Database tests start with `\ir _helpers.psql`, which
makes test users (admin, reviewer, student) and roll everything back at the end. Browser tests
create their own admin and remove it, and put the page text back, when they finish.

## Done

- [x] Unknown keys are refused; empty text is refused; control characters and outer spaces are removed
- [x] Admins save drafts; students cannot save or read them
- [x] A draft does not change the live text
- [x] Publishing reports a clash and publishes nothing; a current draft publishes and is cleared
- [x] The replaced text is kept in the history; restoring makes a draft; visitors cannot publish
- [x] Browser: no bar for students, bar for admins, draft hidden from visitors until published, clash message, bar folds and remembers
- [x] Database (`15_record_drafts`): project, student and faculty edits and project and person photos stay drafts until publish; photo checks; conflicts; discard returns unused uploads; empty names and titles refused; contact details need consent and leave the history and drafts when it is withdrawn; the older seen time is kept; files in use are not released; the audit entry lists changed columns without contact values
- [x] Browser: a project's title, cover photo and gallery wait as a draft, are invisible to visitors, then go live on Publish
- [x] Database: replaced record details are kept; the newest 3 replaced photos per project are kept, older ones returned for deleting, a photo that is live again leaves the history; restoring makes a draft; students cannot restore
- [x] Browser: clicking a photo replaces it as a draft; a replaced title and a replaced photo are restored from the history
- [x] API: a stale record page cannot overwrite a newer change; one record published once under a race; edits to different columns merge
- [x] Browser: two editors on different pages, each with a draft, publish together; a list is added to, reordered, trimmed and published; a history version is restored as a draft
- [x] Browser: an admin replaces a project's cover photo and adds, describes, reorders and removes gallery photos; an empty description is refused
- [x] Several editors at once (`supabase/tests/api/cms-concurrency.test.mjs`, `npm run test:api:cms`): different texts, same text, a stale page, simultaneous publish, a save during a publish, 20 saves at once, history order

## To do: database

- [ ] Every allowed section prefix works (`home`, `about`, `students`, `faculty`, `projects`, `footer`); near-misses fail (`Home.title`, `home.`, `home.UPPER`, a key over 80 characters after the dot)
- [ ] A value of exactly 20000 characters saves; 20001 is refused (live and draft)
- [ ] Values with emoji, accents, right-to-left text, tabs and line breaks keep their content
- [ ] Reviewers, students, the anonymous visitor: every write path refused (insert, update and delete on `site_content`, `site_content_draft`, `site_content_history`)
- [ ] History: one entry per change, none when the value is unchanged, one on delete, `replaced_by` is the editor
- [ ] History cannot be edited or deleted through the API by anyone
- [ ] Publishing only some keys leaves the other drafts alone
- [ ] A draft for a key with no live text: publishes when still no live text, clashes if live text appeared meanwhile
- [ ] Two editors with drafts for the same key: the second save keeps the first draft's starting point
- [ ] Publishing and discarding with an empty list of keys, and with keys that have no draft
- [ ] Restoring a version that was deleted or never existed gives a clear error
- [ ] The audit log has an entry for each publish
- [ ] Faculty can edit once `private.can_edit_site()` includes them (add when the faculty role lands, #66)

## To do: browser

- [ ] Multi-paragraph text keeps its paragraphs after publishing
- [ ] Escape cancels an edit and creates no draft
- [ ] Editing the same text twice keeps one draft with the latest wording
- [ ] Discard removes the draft and shows the old wording again
- [ ] Reloading the page keeps the drafts (they are stored, not just on screen)
- [ ] Sign out removes the bar
- [ ] Phone width (375): the bar wraps, nothing scrolls sideways, buttons are at least 44px tall
- [ ] Keyboard only: switch, Hide, Publish and Discard can be reached and used; the tab has a visible focus ring
- [ ] The bar does not cover the last line of the footer when open
- [ ] Reduced motion: nothing animates in the bar
- [ ] Text with `<script>` or HTML is shown as plain text, never run

## To do: security (also feeds the vulnerability log)

- [ ] Call `save_site_draft`, `publish_site_drafts`, `discard_site_drafts` and `restore_site_text` directly through the API as each role and as a visitor
- [ ] Try to write to `site_content` with a key containing SQL, a path, or very long text
- [ ] A signed-in student cannot read drafts or history by guessing the table names

## To do: lists

- [ ] Database: items over 120/2000 characters are cut; a url that is not `http(s)://` or `/` is blanked; more than 30 items, a non-array and a non-object item are refused; extra fields are dropped
- [ ] Browser: a visitor sees nothing for an empty list, and no empty items; a link opens with `rel="noopener noreferrer"`
- [ ] Browser: the Add button stops at 30 items; Move up/down are disabled at the ends

## When the CMS grows

Each new piece (lists, colors and fonts) should add its own section here and its own `15_…`,
`16_…` database test, with the same shape: who may do it, what is cleaned or refused, what happens
on a clash, and what the history keeps.
