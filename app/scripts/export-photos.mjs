// Copies every photo from the booth's local storage into normal image files you can open, print or back up:
//   photos-export/<date>/photo-<time>-<id>.jpg
// Usage:  npm run export-photos            (stop the booth first, or run it any time — it only reads)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openPhotos, listAll, root } from "./photos-lib.mjs";

const h = await openPhotos();
if (!h) process.exit(0);
const objs = await listAll(h.env.PHOTOS);
if (!objs.length) { console.log("There are no photos in the booth storage."); await h.dispose(); process.exit(0); }
const out = join(root, "photos-export");
let n = 0;
for (const o of objs) {
  const obj = await h.env.PHOTOS.get(o.key); if (!obj) continue;
  const when = new Date(o.uploaded), pad = (x) => String(x).padStart(2, "0");
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  const ext = o.httpMetadata?.contentType === "image/png" ? "png" : "jpg";
  const dir = join(out, day); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `photo-${time}-${o.key.slice(7, 15)}.${ext}`), Buffer.from(await obj.arrayBuffer()));
  n++;
}
console.log(`Exported ${n} photo(s) to: ${out}`);
await h.dispose();
