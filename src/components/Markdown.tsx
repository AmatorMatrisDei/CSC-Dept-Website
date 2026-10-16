import MarkdownToJsx from "markdown-to-jsx/react";
import { markdownOptions } from "@/lib/markdown";

// Shows Markdown text by the site's rules (lib/markdown.ts). Pages load this file on demand, so
// the Markdown library stays out of pages that don't need it.
export default function Markdown({ text }: { text: string }) {
  return <MarkdownToJsx options={markdownOptions}>{text}</MarkdownToJsx>;
}
