import assert from "node:assert/strict";
import { test } from "node:test";
import MarkdownToJsx from "markdown-to-jsx/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownOptions } from "./markdown.ts";

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownToJsx, { options: markdownOptions }, text));

test("formatting, lists and paragraphs", () => {
  const html = render("Built with **React** and _Supabase_.\n\n- Sign-in\n- Review queue\n\n1. First\n2. Second");
  assert.match(html, /<p>Built with <strong>React<\/strong> and <em>Supabase<\/em>\.<\/p>/);
  assert.match(html, /<ul class="[^"]*list-disc[^"]*"><li>Sign-in<\/li><li>Review queue<\/li><\/ul>/);
  assert.match(html, /<ol [^>]*class="[^"]*list-decimal[^"]*"><li>First<\/li><li>Second<\/li><\/ol>/);
  assert.equal(render("One line.").trim(), "<p>One line.</p>");
});

test("HTML in the text is shown as text, never run", () => {
  const html = render("<img src=x onerror=alert(1)> and <script>alert(1)</script>");
  assert.doesNotMatch(html, /<img|<script/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("unsafe link addresses are dropped", () => {
  for (const href of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "vbscript:msgbox(1)"]) {
    assert.doesNotMatch(render(`[click](${href})`), /script:/i, href);
  }
});

test("outside links open in a new tab; links within the site don't", () => {
  const outside = render("[Repository](https://github.com/AmatorMatrisDei/CSC-Dept-Website)");
  assert.match(outside, /href="https:\/\/github\.com\/AmatorMatrisDei\/CSC-Dept-Website"/);
  assert.match(outside, /target="_blank"/);
  assert.match(outside, /rel="noopener noreferrer"/);
  assert.doesNotMatch(render("[Faculty](/faculty)"), /target=/);
});

test("headings start below the page's own h1 and h2", () => {
  const html = render("# Overview\n\n## Hardware\n\n### Sensors");
  assert.doesNotMatch(html, /<h[12][ >]/);
  assert.match(html, /<h3[^>]*>Overview<\/h3>/);
  assert.match(html, /<h3[^>]*>Hardware<\/h3>/);
  assert.match(html, /<h4[^>]*>Sensors<\/h4>/);
});

test("images become links, since other sites' images are blocked", () => {
  const html = render("![The robot on the quad](https://example.com/robot.jpg)");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<a [^>]*href="https:\/\/example\.com\/robot\.jpg"[^>]*>The robot on the quad<\/a>/);
});
