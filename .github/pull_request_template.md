Closes #

<!-- What changed and why, in a few lines. Pull requests go into `staging`, not `main`. -->

## How to check it on the preview

1. 

## Before merging

- [ ] I commented on the issue before starting, so no one else picked it up
- [ ] `npm run lint` and `npm run test:unit` pass
- [ ] `npm run db:test`, `npm run test:api` and `npm run test:carousel` pass locally, if it touches the database or the carousel
- [ ] `npm run test:e2e` passes, if it touches sign-in, the student forms or the review queue
- [ ] New tables or rules have tests, and `npm run db:types` was run and committed
- [ ] No secrets in the diff (`sb_secret_...`, database passwords, `functions/.env`)
- [ ] Checked on the preview link
