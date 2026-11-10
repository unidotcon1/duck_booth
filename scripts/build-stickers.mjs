// Scans public/stickers/ and writes public/stickers/manifest.json.
//   user images : public/stickers/*.(png|webp|svg|jpg|jpeg)   -> category "Mine"
//                 public/stickers/<folder>/*.(png|...)        -> category = folder name
//   shipped set : public/stickers/builtin/*.svg               -> built-in categories
// Optional: names.json  { "my.png": { "en": "My sticker", "zh": "我的贴纸" },
//                         "party/hat.png": { "en": "Hat" },            (file inside a folder)
//                         "party/": { "en": "Party time", "zh": "派对" } }  (category label)
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

const CATS = {
  fun: ["Fun", "趣味"], faith: ["Faith", "信仰"], party: ["Party", "派对"], shapes: ["Shapes", "形状"], text: ["Text", "文字"], mine: ["Mine", "我的"], meme: ["Meme", "梗图"],
};
const OPTIONAL_NAMES = { "tung-tung-sahur": { en: "Tung Tung Sahur", "zh-CN": "Tung Tung Sahur" } };
const BUILTIN_CAT = {
  sunglasses: "fun", "bow-tie": "fun", crown: "fun", sparkles: "fun",
  cross: "faith", dove: "faith", "olive-branch": "faith", "praying-hands": "faith", laurel: "faith",
  "party-hat": "party", balloon: "party", confetti: "party", ribbon: "party",
  star: "shapes", heart: "shapes", flower: "shapes",
  "smile-en": "text", "smile-zh": "text", blessed: "text",
};

function okFile(base, f, svgOnly) {
  if (f.startsWith(".") || !(svgOnly ? extname(f).toLowerCase() === ".svg" : EXT.has(extname(f).toLowerCase()))) return false;
  const size = statSync(join(base, f)).size;
  if (size > MAX) { console.warn(`[stickers] skipping ${f}: ${(size / 1048576).toFixed(1)} MB is over the 25 MB limit`); return false; }
  if (size > WARN) console.warn(`[stickers] ${f} is ${(size / 1048576).toFixed(1)} MB; consider a smaller (<2 MB) PNG/WebP`);
  return true;
}
const list = (base, svgOnly) => existsSync(base)
  ? readdirSync(base, { withFileTypes: true }).filter((d) => d.isFile() && okFile(base, d.name, svgOnly)).map((d) => d.name).sort(natural) : [];

const items = [];
const seen = new Set();
const catOrder = [];      // [{id, name}]
const catSeen = new Set();
const addCat = (id, name) => { if (!catSeen.has(id)) { catSeen.add(id); catOrder.push({ id, name }); } };

const add = (file, cat, builtin, optional) => {
  const f = basename(file);
  let id = (builtin ? "b-" : "u-") + (builtin ? slug(f) : file.replace(/\.[^.\/]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  for (let i = 2; seen.has(id); i++) id += "-" + i;
  seen.add(id);
  let en, zh;
  if (builtin) { const n = BUILTIN_NAMES[basename(f, ".svg")]; en = n ? n[0] : pretty(f); zh = n ? n[1] : en; }
  const grp = optional ? basename(f, extname(f)) : null;
  const on = optional ? OPTIONAL_NAMES[grp] || {} : {};
  if (optional) { en = on.en; zh = on["zh-CN"]; }
  const o = names[file] || {};
  en = o.en || en || pretty(f);
  zh = o.zh || o["zh-CN"] || zh || en;
  const it = { id, file, name: { en, "zh-CN": zh }, builtin, category: cat };
  if (optional) { it.optional = true; it.group = grp; }
  items.push(it);
};

const pending = []; // [catId, file, builtin]
if (includeBuiltins) {
  for (const f of list(join(dir, "builtin"), true)) pending.push([BUILTIN_CAT[basename(f, ".svg")] || "fun", "builtin/" + f, true]);
}
// user sub-folders (any folder except builtin) -> categories
const folders = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "builtin" && d.name !== "optional" && !d.name.startsWith(".")).map((d) => d.name).sort(natural) : [];
for (const fo of folders) {
  const files = list(join(dir, fo), false);
  if (!files.length) continue;
  const cid = "f-" + slug(fo);
  const o = names[fo + "/"] || names[fo] || {};
  addCat(cid, { en: o.en || pretty(fo), "zh-CN": o.zh || o["zh-CN"] || o.en || pretty(fo) });
  files.forEach((f) => pending.push([cid, fo + "/" + f, false]));
}
for (const f of list(join(dir, "optional"), false)) pending.push(["meme", "optional/" + f, false, true]);
for (const f of list(dir, false)) pending.push(["mine", f, false]);

// category order: built-in cats (fixed order), user folders, Mine
const order = ["fun", "faith", "party", "shapes", "text"];
const used = new Set(pending.map((p) => p[0]));
const cats = [];
for (const id of order) if (used.has(id)) cats.push({ id, name: { en: CATS[id][0], "zh-CN": CATS[id][1] } });
for (const c of catOrder) cats.push(c);
if (used.has("meme")) { const o = names["optional/"] || {}; cats.push({ id: "meme", name: { en: o.en || CATS.meme[0], "zh-CN": o.zh || o["zh-CN"] || CATS.meme[1] } }); }
if (used.has("mine")) { const o = names["mine/"] || {}; cats.push({ id: "mine", name: { en: o.en || CATS.mine[0], "zh-CN": o.zh || o["zh-CN"] || CATS.mine[1] } }); }
for (const c of cats) for (const p of pending) if (p[0] === c.id) add(p[1], p[0], p[2], p[3]);

writeFileSync(join(dir, "manifest.json"), JSON.stringify({ includeBuiltins, categories: cats, items }, null, 2) + "\n");
console.log(`[stickers] manifest.json: ${items.length} stickers in ${cats.length} categories`);
