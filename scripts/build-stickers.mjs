// Scans public/stickers/ and writes public/stickers/manifest.json.
//   user images : public/stickers/*.(png|webp|svg|jpg|jpeg)
//   shipped set : public/stickers/builtin/*.svg
// Optional: names.json  { "my.png": { "en": "My sticker", "zh": "我的贴纸" } }
//           config.json { "includeBuiltins": false }
// Runs automatically before `wrangler dev` / `wrangler deploy` (see wrangler.jsonc "build").
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(fileURLToPath(new URL("..", import.meta.url)), "public", "stickers");
const EXT = new Set([".png", ".webp", ".svg", ".jpg", ".jpeg"]);
const WARN = 2 * 1048576;
const MAX = 25 * 1048576; // Cloudflare static-asset limit per file

const BUILTIN_NAMES = {
  "star": ["Star", "星星"],
  "sparkles": ["Sparkles", "闪耀"],
  "heart": ["Heart", "爱心"],
  "crown": ["Crown", "皇冠"],
  "sunglasses": ["Sunglasses", "太阳镜"],
  "party-hat": ["Party hat", "派对帽"],
  "bow-tie": ["Bow tie", "领结"],
  "smile-en": ["Smile! (English)", "微笑气泡（英文）"],
  "smile-zh": ["Smile! (Chinese)", "微笑气泡（中文）"],
  "cross": ["Cross", "十字架"],
  "dove": ["Dove", "鸽子"],
  "olive-branch": ["Olive branch", "橄榄枝"],
  "praying-hands": ["Praying hands", "祈祷之手"],
  "balloon": ["Balloon", "气球"],
  "confetti": ["Confetti", "彩纸"],
  "ribbon": ["Award ribbon", "奖章"],
  "blessed": ["Blessed badge", "蒙福徽章"],
  "flower": ["Flower", "花朵"],
  "laurel": ["Laurel wreath", "桂冠"],
};

let names = {};
const namesPath = join(dir, "names.json");
if (existsSync(namesPath)) {
  try { names = JSON.parse(readFileSync(namesPath, "utf8")); } catch (e) { console.warn("[stickers] names.json is not valid JSON:", e.message); }
}
let includeBuiltins = true;
const cfgPath = join(dir, "config.json");
if (existsSync(cfgPath)) { try { includeBuiltins = JSON.parse(readFileSync(cfgPath, "utf8")).includeBuiltins !== false; } catch { /* keep default */ } }

const pretty = (f) => basename(f, extname(f)).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const slug = (f) => basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function scan(sub) {
  const base = sub ? join(dir, sub) : dir;
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith(".") && (sub ? extname(d.name).toLowerCase() === ".svg" : EXT.has(extname(d.name).toLowerCase())))
    .map((d) => d.name).sort(natural)
    .filter((f) => {
      const size = statSync(join(base, f)).size;
      if (size > MAX) { console.warn(`[stickers] skipping ${f}: ${(size / 1048576).toFixed(1)} MB is over the 25 MB limit`); return false; }
      if (size > WARN) console.warn(`[stickers] ${f} is ${(size / 1048576).toFixed(1)} MB; consider a smaller (<2 MB) PNG/WebP`);
      return true;
    });
}

const items = [];
const seen = new Set();
const add = (f, builtin) => {
  const file = builtin ? "builtin/" + f : f;
  let id = (builtin ? "b-" : "u-") + slug(f); for (let i = 2; seen.has(id); i++) id = (builtin ? "b-" : "u-") + slug(f) + "-" + i;
  seen.add(id);
  let en, zh;
  if (builtin) { const n = BUILTIN_NAMES[basename(f, ".svg")]; en = n ? n[0] : pretty(f); zh = n ? n[1] : en; }
  const o = names[file] || names[f] || {};
  en = o.en || en || pretty(f);
  zh = o.zh || o["zh-CN"] || zh || en;
  items.push({ id, file, name: { en, "zh-CN": zh }, builtin });
};
if (includeBuiltins) scan("builtin").forEach((f) => add(f, true));
scan("").forEach((f) => add(f, false));

writeFileSync(join(dir, "manifest.json"), JSON.stringify({ includeBuiltins, items }, null, 2) + "\n");
console.log(`[stickers] manifest.json: ${items.length} stickers`);
