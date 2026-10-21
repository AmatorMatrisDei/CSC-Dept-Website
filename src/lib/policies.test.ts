import assert from "node:assert/strict";
import { test } from "node:test";
import { policyHtml, privacy, terms } from "./policies.ts";

test("the plain copy has every heading and paragraph of the page", () => {
  for (const policy of [privacy, terms]) {
    const html = policyHtml(policy);
    assert.match(html, new RegExp(`<h1[^>]*>${policy.title}</h1>`));
    for (const section of policy.sections) assert.ok(html.includes(`>${section.title}</h2>`), section.title);
    const paragraphs = policy.sections.flatMap((s) => s.body.split(/\n{2,}/)).length;
    assert.ok((html.match(/<p>/g) ?? []).length >= paragraphs + 1, `${policy.path}: every paragraph`);
  }
});

test("the plain copy shows text as text", () => {
  const html = policyHtml({ ...terms, sections: [{ id: "x", title: "<b>Bold</b> & co", body: 'A "quote" <script>' }] });
  assert.ok(html.includes("&lt;b&gt;Bold&lt;/b&gt; &amp; co"));
  assert.ok(html.includes("A &quot;quote&quot; &lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("the privacy page names what Google sends us", () => {
  const google = privacy.sections.find((s) => s.id === "google");
  assert.ok(google?.body.includes("name, email address, account ID and the link to your profile picture"));
  assert.ok(google?.body.includes("Limited Use"));
});
