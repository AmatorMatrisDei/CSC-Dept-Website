import { cacheLife, cacheTag } from "next/cache";

export const DRUPAL_CACHE_TAG = "drupal";

export type Article = {
  id: string;
  title: string;
  created: string;
  summary: string;
  bodyHtml: string;
};

type JsonApiArticle = {
  id: string;
  attributes: {
    title: string;
    created: string;
    body: { processed: string; summary: string } | null;
  };
};

const SAMPLE_ARTICLES: Article[] = [
  {
    id: "sample-welcome",
    title: "Welcome to the Department of Engineering and Computing",
    created: "2026-09-01T09:00:00Z",
    summary: "Sample content shown until DRUPAL_BASE_URL is configured.",
    bodyHtml:
      "<p>This article is sample content. Set <code>DRUPAL_BASE_URL</code> in <code>.env.local</code> to load real articles from Drupal.</p>",
  },
  {
    id: "sample-open-house",
    title: "Fall Open House",
    created: "2026-10-01T09:00:00Z",
    summary: "Tour the labs and meet faculty.",
    bodyHtml: "<p>Tour the labs and meet faculty.</p>",
  },
];

function toArticle(node: JsonApiArticle): Article {
  return {
    id: node.id,
    title: node.attributes.title,
    created: node.attributes.created,
    summary: node.attributes.body?.summary ?? "",
    bodyHtml: node.attributes.body?.processed ?? "",
  };
}

async function drupalFetch<T>(path: string): Promise<T | null> {
  const baseUrl = process.env.DRUPAL_BASE_URL;
  if (!baseUrl) return null;

  const res = await fetch(new URL(path, baseUrl), {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Drupal request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getArticles(limit = 10): Promise<Article[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(DRUPAL_CACHE_TAG);

  const data = await drupalFetch<{ data: JsonApiArticle[] }>(
    `/jsonapi/node/article?filter[status]=1&sort=-created&page[limit]=${limit}`,
  );
  if (!data) return SAMPLE_ARTICLES.slice(0, limit);
  return data.data.map(toArticle);
}

export async function getArticle(id: string): Promise<Article | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(DRUPAL_CACHE_TAG);

  if (!process.env.DRUPAL_BASE_URL) {
    return SAMPLE_ARTICLES.find((a) => a.id === id) ?? null;
  }
  const data = await drupalFetch<{ data: JsonApiArticle }>(
    `/jsonapi/node/article/${encodeURIComponent(id)}`,
  );
  return data ? toArticle(data.data) : null;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
