import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate, getArticle, getArticles } from "@/lib/drupal";

// Re-render hourly so pages pick up Drupal changes even without a webhook.
export const revalidate = 3600;

export async function generateStaticParams() {
  // Prerender recent articles; older ones render on first request.
  const articles = await getArticles(50);
  return articles.map((article) => ({ id: article.id }));
}

export async function generateMetadata({ params }: PageProps<"/news/[id]">): Promise<Metadata> {
  const { id } = await params;
  const article = await getArticle(id);
  return { title: article?.title ?? "Not found" };
}

export default async function ArticlePage({ params }: PageProps<"/news/[id]">) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) notFound();

  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{article.title}</h1>
      <p className="text-sm text-zinc-500">{formatDate(article.created)}</p>
      {/* body.processed is already sanitized by Drupal's text format filters. */}
      <div
        className="flex flex-col gap-4 leading-7"
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />
    </article>
  );
}
