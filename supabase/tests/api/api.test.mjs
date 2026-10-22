// End-to-end checks against the local Supabase stack: Auth, the Data API and Storage working
// together, the way the website will call them. Run with `npm run test:api` after
// `npm run db:start`. Each run creates its own accounts and removes them afterwards; their audit
// log entries stay, because the audit log is append-only. `npm run db:reset` clears them.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = JSON.parse(
  execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);

// A 1x1 PNG, enough for upload tests.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function call(path, { method = "GET", token, key = PUBLISHABLE_KEY, json, body, headers = {} } = {}) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      apikey: key,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(json !== undefined && { "Content-Type": "application/json" }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const created = { users: [], projects: [], files: [] };

function uniqueEmail(label) {
  return `api-${label}-${randomUUID().slice(0, 8)}@franciscan.edu`;
}

// New accounts start unverified. Unless `verified` is false, the secret key verifies them, standing
// in for the email link or Google sign-in (the verify-email function's unit tests cover those).
async function signUp(email, fullName, { verified = true } = {}) {
  const res = await call("/auth/v1/signup", {
    method: "POST",
    json: { email, password: "password123", data: { full_name: fullName } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  created.users.push(res.data.user.id);
  if (verified) {
    const marked = await call("/rest/v1/rpc/mark_account_verified", {
      method: "POST",
      key: SECRET_KEY,
      json: { account: res.data.user.id, how: "admin" },
    });
    assert.equal(marked.status, 204, JSON.stringify(marked.data));
  }
  return { id: res.data.user.id, token: res.data.access_token };
}

// Reviewers are ordinary sign-ups that an admin promotes; the secret key stands in for the admin.
async function createReviewer() {
  const email = uniqueEmail("reviewer");
  const { id } = await signUp(email, "API Reviewer");
  const promoted = await call(`/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    key: SECRET_KEY,
    json: { role: "reviewer" },
  });
  assert.equal(promoted.status, 204, JSON.stringify(promoted.data));
  const login = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    json: { email, password: "password123" },
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { id, token: login.data.access_token };
}

async function submit(user, change) {
  const res = await call("/rest/v1/pending_changes?select=id,status", {
    method: "POST",
    token: user.token,
    json: change,
    headers: { Prefer: "return=representation" },
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data[0].id;
}

async function review(reviewer, changeId, decision, note) {
  return call("/rest/v1/rpc/review_change", {
    method: "POST",
    token: reviewer.token,
    json: { change_id: changeId, decision, note },
  });
}

async function lookupId(table, slug) {
  const res = await call(`/rest/v1/${table}?slug=eq.${slug}&select=id`);
  assert.equal(res.data.length, 1, `no ${table} with slug ${slug}`);
  return res.data[0].id;
}

let student;
let other;
let reviewer;

before(async () => {
  student = await signUp(uniqueEmail("student"), "API Student");
  other = await signUp(uniqueEmail("other"), "API Other");
  reviewer = await createReviewer();
});

after(async () => {
  if (created.files.length > 0) {
    await call("/storage/v1/object/media", { method: "DELETE", key: SECRET_KEY, json: { prefixes: created.files } });
  }
  for (const id of created.projects) {
    await call(`/rest/v1/projects?id=eq.${id}`, { method: "DELETE", key: SECRET_KEY });
  }
  for (const id of created.users) {
    await call(`/auth/v1/admin/users/${id}`, { method: "DELETE", key: SECRET_KEY });
  }
});

test("only university email addresses can sign up", async () => {
  const res = await call("/auth/v1/signup", {
    method: "POST",
    json: { email: `api-${randomUUID().slice(0, 8)}@gmail.com`, password: "password123" },
  });
  assert.equal(res.status, 403, JSON.stringify(res.data));
  assert.match(JSON.stringify(res.data), /Franciscan University email/);
});

test("an unverified account can't submit, give permissions or be promoted until verified", async () => {
  const fresh = await signUp(uniqueEmail("unverified"), "API Unverified", { verified: false });
  const status = await call("/rest/v1/rpc/my_verification", { method: "POST", token: fresh.token, json: {} });
  assert.deepEqual(status.data, [{ verified: false, method: null, verified_at: null, password_removed: false }]);

  const submission = await call("/rest/v1/pending_changes", {
    method: "POST",
    token: fresh.token,
    json: { target_type: "internship", action: "create", proposed_data: { company: "Acme" } },
  });
  assert.equal(submission.status, 403, JSON.stringify(submission.data));
  assert.match(submission.data.message, /Verify your email address/);

  const consent = await call("/rest/v1/consents", {
    method: "POST",
    token: fresh.token,
    json: { student_id: fresh.id, scope: "directory" },
  });
  assert.equal(consent.status, 403, JSON.stringify(consent.data));

  const promoted = await call(`/rest/v1/profiles?id=eq.${fresh.id}`, { method: "PATCH", key: SECRET_KEY, json: { role: "reviewer" } });
  assert.equal(promoted.status, 400, JSON.stringify(promoted.data));
  assert.match(promoted.data.message, /Only verified accounts/);

  await call("/rest/v1/rpc/mark_account_verified", { method: "POST", key: SECRET_KEY, json: { account: fresh.id, how: "admin" } });
  const later = await call("/rest/v1/pending_changes", {
    method: "POST",
    token: fresh.token,
    json: { target_type: "internship", action: "create", proposed_data: { company: "Acme" } },
  });
  assert.equal(later.status, 201, JSON.stringify(later.data));
});

test("only the secret key can verify accounts or look up sign-in addresses", async () => {
  for (const [name, json] of [
    ["mark_account_verified", { account: student.id, how: "admin" }],
    ["account_for_email", { address: "api-student@franciscan.edu" }],
    ["allow_verification_request", { account: student.id, request_kind: "verify_send" }],
    ["complete_password_reset", { account: student.id }],
  ]) {
    for (const token of [undefined, student.token]) {
      const res = await call(`/rest/v1/rpc/${name}`, { method: "POST", token, json });
      assert.ok([401, 403, 404].includes(res.status), `${name}: ${res.status} ${JSON.stringify(res.data)}`);
    }
  }
});

test("a new account gets an unlisted student profile", async () => {
  const own = await call(`/rest/v1/profiles?id=eq.${student.id}&select=name,role,visible`, { token: student.token });
  assert.deepEqual(own.data, [{ name: "API Student", role: "student", visible: false }]);

  const asVisitor = await call(`/rest/v1/profiles?id=eq.${student.id}&select=id`);
  assert.deepEqual(asVisitor.data, [], "visitors should not see an unlisted profile");
});

test("profile changes wait for a reviewer", async () => {
  const direct = await call(`/rest/v1/profiles?id=eq.${student.id}`, {
    method: "PATCH",
    token: student.token,
    json: { headline: "Edited directly", role: "admin" },
  });
  assert.ok(direct.status < 300, JSON.stringify(direct.data));

  const unchanged = await call(`/rest/v1/profiles?id=eq.${student.id}&select=headline,role`, { token: student.token });
  assert.deepEqual(unchanged.data, [{ headline: "", role: "student" }], "direct edits must not reach the live profile");

  const changeId = await submit(student, {
    target_type: "profile",
    action: "update",
    proposed_data: { headline: "Hello from the API test" },
  });

  const selfApproval = await review(student, changeId, "approved");
  assert.equal(selfApproval.status, 403, JSON.stringify(selfApproval.data));

  const approval = await review(reviewer, changeId, "approved");
  assert.equal(approval.status, 200, JSON.stringify(approval.data));
  assert.equal(approval.data.status, "approved");

  const live = await call(`/rest/v1/profiles?id=eq.${student.id}&select=headline`, { token: student.token });
  assert.deepEqual(live.data, [{ headline: "Hello from the API test" }]);
});

test("a submitted project goes live after review, with its photo", async () => {
  const photo = `submissions/${student.id}/api-test-project.png`;
  const upload = await call(`/storage/v1/object/media/${photo}`, {
    method: "POST",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  created.files.push(photo);

  const slug = `api-test-${randomUUID().slice(0, 8)}`;
  const changeId = await submit(student, {
    target_type: "project",
    action: "create",
    proposed_data: {
      title: "API test project",
      slug,
      summary: "Created by the API tests",
      status: "active",
      category_id: await lookupId("categories", "class"),
      sub_department_id: await lookupId("sub_departments", "computer-science"),
      images: [{ storage_path: photo, alt_text: "A test image" }],
    },
  });

  const beforeReview = await call(`/rest/v1/projects?slug=eq.${slug}&select=id`);
  assert.deepEqual(beforeReview.data, [], "a submitted project must not be live before review");

  const approval = await review(reviewer, changeId, "approved");
  assert.equal(approval.status, 200, JSON.stringify(approval.data));
  created.projects.push(approval.data.target_id);

  const live = await call(`/rest/v1/projects?slug=eq.${slug}&select=title,project_images(storage_path,alt_text)`);
  assert.deepEqual(live.data, [
    { title: "API test project", project_images: [{ storage_path: photo, alt_text: "A test image" }] },
  ]);
});

test("photos upload only into the user's own folders", async () => {
  const avatar = `avatars/${student.id}/api-test.png`;
  const upload = await call(`/storage/v1/object/media/${avatar}`, {
    method: "POST",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  created.files.push(avatar);

  const publicFile = await fetch(`${API_URL}/storage/v1/object/public/media/${avatar}`);
  assert.equal(publicFile.status, 200, "uploaded photos should be readable by URL");
  await publicFile.arrayBuffer();

  for (const path of [`avatars/${other.id}/api-test.png`, `submissions/${other.id}/api-test.png`, `projects/${randomUUID()}/api-test.png`]) {
    const res = await call(`/storage/v1/object/media/${path}`, {
      method: "POST",
      token: student.token,
      body: PNG,
      headers: { "Content-Type": "image/png" },
    });
    assert.ok(res.status >= 400, `upload to ${path} returned ${res.status}`);
  }

  const notAnImage = await call(`/storage/v1/object/media/submissions/${student.id}/notes.txt`, {
    method: "POST",
    token: student.token,
    body: "not an image",
    headers: { "Content-Type": "text/plain" },
  });
  assert.ok(notAnImage.status >= 400, `non-image upload returned ${notAnImage.status}`);
});

test("a photo cannot be swapped or deleted while a submission or live page uses it", async () => {
  const photo = `submissions/${student.id}/api-swap-test.png`;
  const upload = await call(`/storage/v1/object/media/${photo}`, {
    method: "POST",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  created.files.push(photo);

  const changeId = await submit(student, {
    target_type: "project",
    action: "create",
    proposed_data: {
      title: "API swap test",
      category_id: await lookupId("categories", "class"),
      sub_department_id: await lookupId("sub_departments", "computer-science"),
      images: [{ storage_path: photo, alt_text: "A test image" }],
    },
  });

  const replace = () => call(`/storage/v1/object/media/${photo}`, {
    method: "PUT",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  const remove = () => call("/storage/v1/object/media", { method: "DELETE", token: student.token, json: { prefixes: [photo] } });

  const swapped = await replace();
  assert.ok(swapped.status >= 400, `replacing a photo under review returned ${swapped.status}`);
  const deleted = await remove();
  assert.deepEqual(deleted.data, [], "deleting a photo under review should remove nothing");
  const stillThere = await fetch(`${API_URL}/storage/v1/object/public/media/${photo}`);
  assert.equal(stillThere.status, 200);
  await stillThere.arrayBuffer();

  const withdrawn = await call(`/rest/v1/pending_changes?id=eq.${changeId}`, {
    method: "PATCH",
    token: student.token,
    json: { status: "withdrawn" },
  });
  assert.equal(withdrawn.status, 204, JSON.stringify(withdrawn.data));

  const replaced = await replace();
  assert.equal(replaced.status, 200, `once withdrawn, the photo is the student's to replace: ${JSON.stringify(replaced.data)}`);
  const removed = await remove();
  assert.equal(removed.data.length, 1, "and to delete");
});

test("an account can be deleted", async () => {
  const doomed = await signUp(uniqueEmail("deleted"), "API Deleted");
  const res = await call(`/auth/v1/admin/users/${doomed.id}`, { method: "DELETE", key: SECRET_KEY });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const gone = await call(`/rest/v1/profiles?id=eq.${doomed.id}&select=id`, { key: SECRET_KEY });
  assert.deepEqual(gone.data, [], "the profile goes with the account");
  created.users = created.users.filter((id) => id !== doomed.id);
});
