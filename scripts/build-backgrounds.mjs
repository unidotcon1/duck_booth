// Scans public/backgrounds/ for images and writes public/backgrounds/manifest.json.
// Runs automatically before `wrangler dev` and `wrangler deploy` (see wrangler.jsonc "build").
// Optional: public/backgrounds/names.json  { "beach.jpg": { "en": "Beach", "zh": "海滩" } }
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(fileURLToPath(new URL("..", import.meta.url)), "public", "backgrounds");
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX = 25 * 1024 * 1024; // Cloudflare static-asset limit per file

let names = {};
const namesPath = join(dir, "names.json");
if (existsSync(namesPath)) {
  try { names = JSON.parse(readFileSync(namesPath, "utf8")); } catch (e) { console.warn("[backgrounds] names.json is not valid JSON:", e.message); }
}

const pretty = (f) => basename(f, extname(f)).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const items = readdirSync(dir)
  .filter((f) => EXT.has(extname(f).toLowerCase()) && !f.startsWith("."))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .filter((f) => {
    const size = statSync(join(dir, f)).size;
    if (size > MAX) { console.warn(`[backgrounds] skipping ${f}: ${(size / 1048576).toFixed(1)} MB is over the 25 MB limit`); return false; }
    if (size > 3 * 1048576) console.warn(`[backgrounds] ${f} is ${(size / 1048576).toFixed(1)} MB — consider a ~1-2 MB 1920x1080 JPEG for faster kiosks`);
    return true;
  })
  .map((f) => {
    const n = names[f] || {};
    const en = n.en || pretty(f);
    return { id: "img-" + basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, "-"), file: f, name: { en, "zh-CN": n.zh || n["zh-CN"] || en } };
  });

// Set to false in manifest.config.json to hide the built-in gradients/solids.
let includeBuiltins = true;
const cfgPath = join(dir, "config.json");
if (existsSync(cfgPath)) { try { includeBuiltins = JSON.parse(readFileSync(cfgPath, "utf8")).includeBuiltins !== false; } catch { /* keep default */ } }

writeFileSync(join(dir, "manifest.json"), JSON.stringify({ includeBuiltins, items }, null, 2) + "\n");
console.log(`[backgrounds] ${items.length} image(s) listed in public/backgrounds/manifest.json`);
