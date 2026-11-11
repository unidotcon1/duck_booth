// Deletes photos from the booth's local storage.
//   npm run delete-photos -- --expired      delete only photos older than the retention period
//   npm run delete-photos -- --all --yes    delete EVERY photo (do this after the event; export first if you want to keep any)
import { openPhotos, listAll } from "./photos-lib.mjs";

const args = new Set(process.argv.slice(2));
if (!args.has("--all") && !args.has("--expired")) { console.log("Use --expired (old photos only) or --all --yes (everything)."); process.exit(1); }
if (args.has("--all") && !args.has("--yes")) { console.log("This deletes EVERY photo. Run again with --all --yes to confirm."); process.exit(1); }
const h = await openPhotos();
if (!h) process.exit(0);
const objs = await listAll(h.env.PHOTOS), now = Date.now();
const doomed = objs.filter((o) => args.has("--all") || (Number(o.customMetadata?.expiresAt) < now)).map((o) => o.key);
for (let i = 0; i < doomed.length; i += 500) await h.env.PHOTOS.delete(doomed.slice(i, i + 500));
console.log(`Deleted ${doomed.length} of ${objs.length} photo(s).`);
await h.dispose();
