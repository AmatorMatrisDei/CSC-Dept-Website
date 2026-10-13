import Link from "next/link";
import { type Article, formatDate } from "@/lib/drupal";

export default function ArticleList({ articles }: { articles: Article[] }) {
  if (articles.length === 0) {
    return <p className="text-zinc-600 dark:text-zinc-400">No news yet.</p>;
  }
  return (
    <ul className="divide-y divide-black/10 dark:divide-white/15">
      {articles.map((article) => (
        <li key={article.id} className="py-4">
          <Link href={`/news/${article.id}`} className="text-lg font-medium hover:underline">
            {article.title}
          </Link>
          <p className="text-sm text-zinc-500">{formatDate(article.created)}</p>
          {article.summary && (
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">{article.summary}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
