import { revalidatePath, revalidateTag } from "next/cache";
import { DRUPAL_CACHE_TAG } from "@/lib/drupal";

// Drupal calls this (e.g. via a webhook on node save) to refresh cached content.
export async function POST(request: Request) {
  const secret = process.env.DRUPAL_REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return Response.json({ message: "Invalid secret" }, { status: 401 });
  }

  revalidateTag(DRUPAL_CACHE_TAG, "max");
  // Also refresh every page, in case a page uses Drupal data outside the tagged fetches.
  revalidatePath("/", "layout");
  return Response.json({ revalidated: true });
}
