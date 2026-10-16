import { type AnchorHTMLAttributes, createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";

// How the site shows Markdown: project descriptions now, and news posts and alumni stories later.
// HTML typed into the text is shown as text and never run, and link addresses go through
// markdown-to-jsx's sanitizer, which drops javascript: and similar. Headings start at h3, below
// the page's own h1 and h2. Elements get their styles here because Tailwind's reset removes
// bullets and heading sizes. The tests in markdown.test.ts check each of these rules.

// Links to other sites open in a new tab, like the site's other outside links.
function Link({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  const external = /^https?:\/\//i.test(props.href ?? "");
  return createElement(
    "a",
    { ...props, className: "underline", ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) },
    children,
  );
}

// The content security policy blocks images from other sites, so an image in the text becomes a
// link to it, named by its alt text.
function Image({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) {
  if (typeof src !== "string" || !src) return alt ? createElement("span", null, alt) : null;
  return createElement(Link, { href: src }, alt || "Image");
}

const heading = (component: "h3" | "h4", className: string) => ({ component, props: { className } });

export const markdownOptions: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  forceBlock: true, // a single line is still a paragraph
  wrapper: null, // blocks go straight into the page's own container, which spaces them
  overrides: {
    h1: heading("h3", "text-lg font-semibold"),
    h2: heading("h3", "text-lg font-semibold"),
    h3: heading("h4", "font-semibold"),
    h4: heading("h4", "font-semibold"),
    h5: heading("h4", "font-semibold"),
    h6: heading("h4", "font-semibold"),
    a: Link,
    img: Image,
    ul: { props: { className: "flex list-disc flex-col gap-1 pl-6" } },
    ol: { props: { className: "flex list-decimal flex-col gap-1 pl-6" } },
    blockquote: { props: { className: "border-l-4 border-border pl-4 text-muted" } },
    code: { props: { className: "rounded bg-surface px-1 text-[0.9em]" } },
    pre: { props: { className: "overflow-x-auto rounded border border-border bg-surface p-3 text-sm" } },
    hr: { props: { className: "border-border" } },
  },
};
