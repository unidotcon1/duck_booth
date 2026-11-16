// Copies every photo from the booth's local storage into normal image files you can open, print or back up:
//   photos-export/<date>/P001.jpg, P002.jpg ...   (the same P-number the guest sees; sorted by time taken)
// Usage:  npm run export-photos            (stop the booth first, or run it any time — it only reads)
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openPhotos, listAll, root } from "./photos-lib.mjs";

const h = await openPhotos();
if (!h) process.exit(0);
const objs = await listAll(h.env.PHOTOS);
if (!objs.length) { console.log("There are no photos in the booth storage."); await h.dispose(); process.exit(0); }
const out = join(root, "photos-export");
let n = 0;
objs.sort((a, b) => new Date(a.uploaded) - new Date(b.uploaded));
for (const o of objs) {
  const obj = await h.env.PHOTOS.get(o.key); if (!obj) continue;
  const when = new Date(o.uploaded), pad = (x) => String(x).padStart(2, "0");
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  const ext = o.httpMetadata?.contentType === "image/png" ? "png" : "jpg";
  const dir = join(out, day); mkdirSync(dir, { recursive: true });
  const name = /^P\d{3}$/.test(o.customMetadata?.seq || "") ? o.customMetadata.seq : `photo-${time}`;   // photos taken before numbering existed
  let file = join(dir, `${name}.${ext}`); if (existsSync(file)) file = join(dir, `${name}-${o.key.slice(7, 15)}.${ext}`);   // number reused after P999
  writeFileSync(file, Buffer.from(await obj.arrayBuffer()));
  n++;
}
console.log(`Exported ${n} photo(s) to: ${out}`);
await h.dispose();
