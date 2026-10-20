# Issue sizes and priorities

Every issue has two labels. **Priority** says how soon it matters. **Size** says how involved it is, so people can pick a task that fits their time and experience.

## Priority
- **P1**: broken or blocking; do first.
- **P2**: should be done for the next version.
- **P3**: nice to have.

## Size
| Tier | What it means | Examples |
| --- | --- | --- |
| **1 Quick** | About an hour. Text or styling, one file, no database. Good for a first task. | Remove the project search from the home page |
| **2 Small** | A few hours. One page or component, no database change. | A student resources page, a clubs page |
| **3 Medium** | A day or more. Several files; may touch the database, so it needs tests. | An events calendar, editing project photos after submission |
| **4 Large** | Multiple days. New tables, sign-in or security, or a big redesign. | Student-only views, alumni sign-up, class posts with votes |

- **Tier 4 starts with a plan.** Before writing code, post a short plan as a comment on the issue (what you'll build, in what steps, what could go wrong), or split the issue into smaller ones.
- **Security label.** Anything touching sign-in, permissions or student-only content also gets the `security` label, whatever its size. It gets a closer review.
- Not sure of the size? Pick your best guess; a reviewer will adjust it.

The issue forms ask for the size when you open an issue. The matching labels are `tier-1` to `tier-4`.
