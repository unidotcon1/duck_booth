// Shared helper: opens the booth's LOCAL photo storage (the same files `npm start` writes to) from a plain Node script.
import { getPlatformProxy } from "wrangler";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DATA_DIR = join(root, "photobooth-data");

export async function openPhotos() {
  if (!existsSync(DATA_DIR)) {
    console.log("No photobooth-data folder yet — no photos have been taken with `npm start` on this computer.");
    return null;
  }
  const proxy = await getPlatformProxy({ configPath: join(root, "wrangler.jsonc"), persist: { path: join(DATA_DIR, "v3") } });
  return { env: proxy.env, dispose: () => proxy.dispose() };
}

export async function listAll(bucket) {
  const out = []; let cursor;
  do {
    const page = await bucket.list({ prefix: "photos/", limit: 500, cursor, include: ["customMetadata", "httpMetadata"] });
    out.push(...page.objects); cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}
