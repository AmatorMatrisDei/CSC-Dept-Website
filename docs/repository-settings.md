# Repository settings

Some of the team's rules live in GitHub's settings rather than in files, so they're recorded here.
Only the repository's owner (an admin) can change them.

## Protect `main` and `staging`

Changes reach `main` and `staging` only through pull requests, with an approval from one of the
people in `.github/CODEOWNERS` (not the author) and both CI checks green. Apply this once the front-end checks (#42) have
merged, so both checks exist.

With the GitHub CLI, signed in as the owner, from the repository root:

```bash
gh api -X POST repos/AmatorMatrisDei/CSC-Dept-Website/rulesets --input .github/rulesets/protect-main-and-staging.json
```

Or in the browser, Settings > Rules > Rulesets > New ruleset > New branch ruleset:

| Setting | Value |
| --- | --- |
| Ruleset name | Protect main and staging |
| Enforcement status | Active |
| Target branches | Add target > Include by pattern: `main`, then `staging` |
| Restrict deletions | On |
| Block force pushes | On |
| Require a pull request before merging | On. Required approvals: 1. Dismiss stale pull request approvals when new commits are pushed: on. Require review from Code Owners: on |
| Require status checks to pass | On. Add `Lint, unit tests and build` and `Database, API and browser tests` |

Only approvals from the people in `.github/CODEOWNERS` count; to add a reviewer, add them there
and give them write access. Anyone with write access can still press Merge once a code owner has
approved, so give people who shouldn't merge the Triage role instead (Settings > Collaborators).
To let the owner merge without a review in an emergency, add **Repository admin** under Bypass
list. If the ruleset changes later, update `.github/rulesets/protect-main-and-staging.json` to
match.

## Delete branches after merging

Settings > General > Pull Requests > **Automatically delete head branches**: on. Or:

```bash
gh api -X PATCH repos/AmatorMatrisDei/CSC-Dept-Website -F delete_branch_on_merge=true
```

A deleted branch can be restored from its pull request's page.

## Dependency updates

`.github/dependabot.yml` opens pull requests into `staging`: npm packages weekly (minor and patch
updates grouped into one) and GitHub Actions monthly. Alerts about known vulnerabilities are a
separate setting: Settings > Code security > **Dependabot alerts**: on.

## License

The repository is public and has no license, so others may read the code but not reuse it.
Choosing one is for the department, since university policy on student and staff work may
apply. Add a `LICENSE` file once it's decided.
