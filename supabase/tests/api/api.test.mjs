// End-to-end checks against the local Supabase stack: Auth, the Data API and Storage working
// together, the way the website will call them. Run with `npm run test:api` after
// `npm run db:start`. Each run creates its own accounts and removes them afterwards.
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

async function signUp(email, fullName) {
  const res = await call("/auth/v1/signup", {
    method: "POST",
    json: { email, password: "password123", data: { full_name: fullName } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  created.users.push(res.data.user.id);
  return { id: res.data.user.id, token: res.data.access_token };
}

// Faculty accounts are ordinary sign-ups that an admin promotes; the secret key stands in for
// the admin here.
async function createFaculty() {
  const email = uniqueEmail("faculty");
  const { id } = await signUp(email, "API Faculty");
  const promoted = await call(`/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    key: SECRET_KEY,
    json: { role: "faculty" },
  });
  assert.equal(promoted.status, 204, JSON.stringify(promoted.data));
  const login = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    json: { email, password: "password123" },
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  return { id, token: login.data.access_token };
}

let student;
let other;

before(async () => {
  student = await signUp(uniqueEmail("student"), "API Student");
  other = await signUp(uniqueEmail("other"), "API Other");
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

test("a new account gets a private student profile", async () => {
  const own = await call(`/rest/v1/profiles?id=eq.${student.id}&select=full_name,role,is_public`, {
    token: student.token,
  });
  assert.deepEqual(own.data, [{ full_name: "API Student", role: "student", is_public: false }]);

  const asVisitor = await call(`/rest/v1/profiles?id=eq.${student.id}&select=id`);
  assert.deepEqual(asVisitor.data, [], "visitors should not see a private profile");
});

test("students edit their own profile but not their role", async () => {
  const edit = await call(`/rest/v1/profiles?id=eq.${student.id}&select=bio`, {
    method: "PATCH",
    token: student.token,
    json: { bio: "Hello from the API test" },
    headers: { Prefer: "return=representation" },
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.deepEqual(edit.data, [{ bio: "Hello from the API test" }]);

  const promote = await call(`/rest/v1/profiles?id=eq.${student.id}`, {
    method: "PATCH",
    token: student.token,
    json: { role: "admin" },
  });
  assert.equal(promote.status, 403, JSON.stringify(promote.data));
});

test("a student's project stays hidden until faculty publish it", async () => {
  const slug = `api-test-${randomUUID().slice(0, 8)}`;
  const draft = await call("/rest/v1/projects?select=id,publish_state", {
    method: "POST",
    token: student.token,
    json: { slug, title: "API test project", summary: "Created by the API tests" },
    headers: { Prefer: "return=representation" },
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const [{ id, publish_state }] = draft.data;
  created.projects.push(id);
  assert.equal(publish_state, "draft");

  const hidden = await call(`/rest/v1/projects?slug=eq.${slug}&select=id`);
  assert.deepEqual(hidden.data, [], "visitors should not see a draft");

  const selfPublish = await call(`/rest/v1/projects?id=eq.${id}`, {
    method: "PATCH",
    token: student.token,
    json: { publish_state: "published" },
  });
  assert.equal(selfPublish.status, 403, JSON.stringify(selfPublish.data));

  const faculty = await createFaculty();
  const publish = await call(`/rest/v1/projects?id=eq.${id}`, {
    method: "PATCH",
    token: faculty.token,
    json: { publish_state: "published" },
  });
  assert.equal(publish.status, 204, JSON.stringify(publish.data));

  const visible = await call(`/rest/v1/projects?slug=eq.${slug}&select=id`);
  assert.deepEqual(visible.data, [{ id }]);
});

test("photos upload only into folders the user manages", async () => {
  const ownPath = `avatars/${student.id}/api-test.png`;
  const upload = await call(`/storage/v1/object/media/${ownPath}`, {
    method: "POST",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  created.files.push(ownPath);

  const publicFile = await fetch(`${API_URL}/storage/v1/object/public/media/${ownPath}`);
  assert.equal(publicFile.status, 200, "uploaded photos should be readable by URL");
  await publicFile.arrayBuffer();

  const intoOther = await call(`/storage/v1/object/media/avatars/${other.id}/api-test.png`, {
    method: "POST",
    token: student.token,
    body: PNG,
    headers: { "Content-Type": "image/png" },
  });
  assert.ok(intoOther.status >= 400, `upload into someone else's folder returned ${intoOther.status}`);

  const notAnImage = await call(`/storage/v1/object/media/avatars/${student.id}/notes.txt`, {
    method: "POST",
    token: student.token,
    body: "not an image",
    headers: { "Content-Type": "text/plain" },
  });
  assert.ok(notAnImage.status >= 400, `non-image upload returned ${notAnImage.status}`);
});
