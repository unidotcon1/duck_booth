// photo booth — Cloudflare Worker (API + share links). Static UI is served by the assets binding.
//
// Routes
//   POST /api/upload   kiosk-authenticated JPEG/PNG upload -> { id, url, downloadUrl, expiresAt }
//   GET  /p/:id        share landing page (HTML)
//   GET  /p/:id?download   same image as an attachment (QR target)
//   GET  /p/:id/raw    raw image bytes (used by the landing page <img>)

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULT_MAX = 5 * 1024 * 1024;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS, ...extra },
  });
}

function sniffType(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  return null;
}

// Optional address that phones can reach (set by the start-tunnel script via --var PUBLIC_BASE_URL:...).
const publicBase = (env) => {
  const v = String(env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(v) ? v : "";
};
const ttlDays = (env) => Math.max(1, Math.min(365, Number(env.PHOTO_TTL_DAYS) || 7));
const keyRequired = (env) => typeof env.KIOSK_TOKEN === "string" && env.KIOSK_TOKEN.length > 0;

// Constant-time-ish compare via SHA-256 digests (no length leak).
async function tokenOk(provided, expected) {
  if (!expected || !provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Read at most `limit` bytes; returns null if exceeded. Does not trust Content-Length.
async function readLimited(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

async function handleUpload(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });

  // CORS: same-origin only. Browsers send Origin on cross-origin POSTs; reject anything foreign.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "forbidden_origin" }, 403);

  // Auth: OPTIONAL shared kiosk token. The switch lives only on the server:
  //   ON  = a KIOSK_TOKEN secret exists   (wrangler secret put KIOSK_TOKEN)
  //   OFF = no KIOSK_TOKEN secret         (wrangler secret delete KIOSK_TOKEN)
  // When OFF, anyone who knows the URL can upload — rate limit, size cap and type checks still apply.
  if (keyRequired(env)) {
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!(await tokenOk(token, env.KIOSK_TOKEN))) return json({ error: "unauthorized" }, 401);
  }

  // Throttle (per client IP). Fails open only if the binding is absent (local dev).
  if (env.UPLOAD_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.UPLOAD_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }

  const max = Number(env.MAX_UPLOAD_BYTES) || DEFAULT_MAX;
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > max) return json({ error: "too_large", max }, 413);

  const declaredType = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (declaredType !== "image/jpeg" && declaredType !== "image/png") return json({ error: "unsupported_type" }, 415);

  const bytes = await readLimited(request, max);
  if (bytes === null) return json({ error: "too_large", max }, 413);
  if (bytes.length < 128) return json({ error: "empty_or_truncated" }, 400);

  // Never trust the header: verify magic bytes and store the *sniffed* type.
  const type = sniffType(bytes);
  if (!type || type !== declaredType) return json({ error: "content_mismatch" }, 415);

  const id = crypto.randomUUID(); // CSPRNG, 122 bits => not enumerable
  const expiresAt = Date.now() + ttlDays(env) * 86400_000;
  await env.PHOTOS.put(`photos/${id}`, bytes, {
    httpMetadata: { contentType: type, cacheControl: "private, max-age=3600" },
    customMetadata: { expiresAt: String(expiresAt) },
  });

  ctx?.waitUntil?.(purgeExpired(env).catch((e) => console.error("purge failed", e?.message)));
  const base = new URL(request.url).origin;
  return json({ id, url: `${base}/p/${id}`, downloadUrl: `${base}/p/${id}?download`, expiresAt }, 201);
}

// Real deletion of expired photos. R2 lifecycle rules do not exist in local mode, so every upload (at most every 10 minutes)
// sweeps expired photos. `scripts/delete-photos.mjs --expired` does the same on demand.
let lastPurge = 0;
async function purgeExpired(env) {
  const now = Date.now();
  if (now - lastPurge < 10 * 60_000) return;
  lastPurge = now;
  let cursor, deleted = 0;
  do {
    const page = await env.PHOTOS.list({ prefix: "photos/", limit: 200, cursor, include: ["customMetadata"] });
    const dead = page.objects.filter((o) => { const e = Number(o.customMetadata?.expiresAt); return Number.isFinite(e) && e < now; }).map((o) => o.key);
    if (dead.length) { await env.PHOTOS.delete(dead); deleted += dead.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && deleted < 1000);
}

async function loadPhoto(env, id) {
  if (!ID_RE.test(id)) return null;
  const obj = await env.PHOTOS.get(`photos/${id}`);
  if (!obj) return null;
  // Soft expiry; pair with an R2 lifecycle rule on prefix "photos/" for real deletion.
  const exp = Number(obj.customMetadata?.expiresAt);
  if (Number.isFinite(exp) && exp < Date.now()) { obj.body?.cancel(); return null; }
  return obj;
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", ...SECURITY_HEADERS } });

const LANDING_I18N = {
  en: { lang: "en", title: "Your photo", alt: "Your photo booth picture", btn: "Download photo",
        note: (d) => `On iPhone: press and hold the photo, then “Add to Photos”. This link is deleted automatically after ${d} days.`,
        priv: "Privacy", privText: "Anyone with this link can see the photo. You can delete it now:", del: "Delete this photo",
        gone: "Your photo has been deleted.", goneNote: "It can no longer be opened with this link." },
  zh: { lang: "zh-CN", title: "你的照片", alt: "你的照片", btn: "下载照片",
        note: (d) => `iPhone：长按照片，选择“添加到照片”。此链接将在 ${d} 天后自动删除。`,
        priv: "隐私", privText: "任何拿到此链接的人都能看到这张照片。你可以现在删除它：", del: "删除这张照片",
        gone: "你的照片已删除。", goneNote: "此链接已无法再打开照片。" },
};

const pickLang = (request) => {
  const q = new URL(request.url).searchParams.get("lang");
  const al = request.headers.get("Accept-Language") || "";
  return LANDING_I18N[q === "zh" || q === "en" ? q : /^\s*zh/i.test(al) ? "zh" : "en"];
};

function landingPage(id, ttlDays, request) {
  const L = pickLang(request);
  const html = `<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${L.title}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14141a;--ac:#6d4aff}
@media(prefers-color-scheme:dark){:root{--bg:#0f0f14;--fg:#f2f2f7}}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif}
main{width:100%;max-width:520px;text-align:center}
img{width:100%;height:auto;border-radius:12px;display:block;box-shadow:0 8px 30px #0003}
a.btn{display:inline-block;margin-top:16px;padding:14px 28px;border-radius:999px;background:var(--ac);color:#fff;text-decoration:none;font-weight:600}
p{opacity:.7;font-size:14px}
details{margin-top:18px;font-size:14px;opacity:.85}summary{cursor:pointer}
button.del{margin-top:8px;padding:10px 20px;border-radius:999px;border:1px solid currentColor;background:none;color:inherit;font:inherit;cursor:pointer}
</style></head><body><main>
<img src="/p/${id}/raw" alt="${L.alt}">
<a class="btn" href="/p/${id}?download" download>${L.btn}</a>
<p>${L.note(ttlDays)}</p>
<details><summary>${L.priv}</summary><p>${L.privText}</p>
<form method="post" action="/p/${id}/delete"><button class="del" type="submit">${L.del}</button></form></details>
</main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      ...SECURITY_HEADERS,
    },
  });
}

async function handleDelete(request, env, url, id) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return json({ error: "forbidden_origin" }, 403);
  if (!ID_RE.test(id)) return notFound();
  await env.PHOTOS.delete(`photos/${id}`);   // idempotent; the unguessable id is the capability
  const L = pickLang(request);
  return new Response(`<!doctype html><html lang="${L.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${L.gone}</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;padding:16px;font:16px/1.4 system-ui,sans-serif;text-align:center;color-scheme:light dark}p{opacity:.7}</style></head>
<body><main><h1>${L.gone}</h1><p>${L.goneNote}</p></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", ...SECURITY_HEADERS },
  });
}

async function handleShare(request, env, url) {
  const dm = url.pathname.match(/^\/p\/([^/]+)\/delete\/?$/);
  if (dm) return handleDelete(request, env, url, dm[1]);
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" });
  const m = url.pathname.match(/^\/p\/([^/]+)(\/raw)?\/?$/);
  if (!m) return notFound();
  const [, id, raw] = m;
  const obj = await loadPhoto(env, id);
  if (!obj) return notFound();

  const wantsDownload = url.searchParams.has("download");
  if (!raw && !wantsDownload) {
    obj.body?.cancel();
    return landingPage(id, ttlDays(env), request);
  }
  const type = obj.httpMetadata?.contentType === "image/png" ? "image/png" : "image/jpeg";
  const ext = type === "image/png" ? "png" : "jpg";
  const headers = {
    "Content-Type": type,
    "Content-Length": String(obj.size),
    "Cache-Control": "private, max-age=3600",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: obj.httpEtag,
    ...SECURITY_HEADERS,
  };
  if (wantsDownload) headers["Content-Disposition"] = `attachment; filename="photo-booth-${id.slice(0, 8)}.${ext}"`;
  return new Response(request.method === "HEAD" ? null : obj.body, { headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/config") return json({ keyRequired: keyRequired(env), publicBaseUrl: publicBase(env), photoTtlDays: ttlDays(env) });
      if (url.pathname === "/api/upload") return await handleUpload(request, env, ctx);
      if (url.pathname.startsWith("/p/")) return await handleShare(request, env, url);
      if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("unhandled", err?.stack || err);
      return json({ error: "internal" }, 500);
    }
  },
};
