import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewMessage, type Submission } from "./review-message.ts";

const site = "https://staging.csc-dept-website.pages.dev";
const id = "6f1c2a9e-0000-4000-8000-000000000001";
const message = (fields: Omit<Submission, "id">) => reviewMessage({ id, ...fields }, site);

test("says what is waiting, then links to its review page", () => {
  assert.equal(
    message({ target_type: "project", action: "create", title: "Campus Delivery Robot" }),
    `New for review: a new project, "Campus Delivery Robot"\n${site}/review/${id}`,
  );
});

test("each kind of submission", () => {
  const first = (fields: Omit<Submission, "id">) => message(fields).split("\n")[0];
  assert.equal(first({ target_type: "project", action: "update", title: "Campus Delivery Robot" }), 'New for review: changes to the project "Campus Delivery Robot"');
  assert.equal(first({ target_type: "project", action: "delete", title: null }), "New for review: a request to remove a project");
  assert.equal(first({ target_type: "internship", action: "create", title: "Acme" }), "New for review: a new internship at Acme");
  assert.equal(first({ target_type: "internship", action: "update", title: "Acme" }), "New for review: changes to an internship at Acme");
  assert.equal(first({ target_type: "profile", action: "create" }), "New for review: a request to be added to the student directory");
  assert.equal(first({ target_type: "profile", action: "update" }), "New for review: profile changes");
  assert.equal(first({ target_type: "profile", action: "delete" }), "New for review: a request to be removed from the student directory");
});

test("resubmissions say so", () => {
  assert.match(message({ target_type: "internship", action: "create", title: "Acme Corporation", resubmitted: true }), /^Resubmitted for review: a new internship at Acme Corporation\n/);
});

test("titles are kept to one short line", () => {
  const first = message({ target_type: "project", action: "create", title: `  Line one\nline two ${"x".repeat(200)}` }).split("\n")[0];
  assert.ok(first.startsWith('New for review: a new project, "Line one line two xxx'));
  assert.ok(first.length < 120, `${first.length} characters`);
});

test("a site address with a trailing slash still makes one link", () => {
  assert.match(reviewMessage({ id, target_type: "profile", action: "update" }, `${site}/`), new RegExp(`\n${site}/review/${id}$`));
});
