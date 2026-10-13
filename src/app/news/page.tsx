import type { Metadata } from "next";
import ArticleList from "@/components/ArticleList";
import { getArticles } from "@/lib/drupal";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  const articles = await getArticles(50);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">News</h1>
      <ArticleList articles={articles} />
    </div>
  );
}
