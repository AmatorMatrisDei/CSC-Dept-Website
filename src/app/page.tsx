import Link from "next/link";
import ArticleList from "@/components/ArticleList";
import { getArticles } from "@/lib/drupal";

// Re-render hourly so pages pick up Drupal changes even without a webhook.
export const revalidate = 3600;

export default async function Home() {
  const articles = await getArticles(3);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Department of Engineering and Computing
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Explore our programs, research, and community.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">Latest news</h2>
          <Link href="/news" className="text-sm hover:underline">
            All news →
          </Link>
        </div>
        <ArticleList articles={articles} />
      </section>
    </div>
  );
}
