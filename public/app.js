// Photo Booth — browser app. No framework, no inline script (CSP: script-src 'self').
(() => {
  "use strict";

  // ---------- config ----------
  const IDLE_MS = 3 * 60 * 1000;
  const IDLE_WARN_MS = 20 * 1000;
  const PREVIEW_W = 640;            // live keying runs at this width for speed
  const CAPTURE_MAX_W = 1920;       // full-res capture cap
  const REVIEW_MAX_W = 1280;        // review canvas backing size
  const MAX_UPLOAD = 5 * 1024 * 1024;
  const COUNTDOWN_SEC = 3;
  const UPLOAD_TRIES = 3;
  const QR_WAIT_MS = 3 * 60 * 1000, FAIL_RESET_MS = 30 * 1000;
  const TOKEN_KEY = "photobooth.kioskToken";
  const PREFS_KEY = "photobooth.prefs";

  const { t, set: setI, clear: clearI, apply: applyI } = window.I18N;
  const $ = (id) => document.getElementById(id);
  const el = {
    live: $("screen-live"), review: $("screen-review"), result: $("screen-result"), preview: $("preview"),
    shutter: $("shutter"), countdown: $("countdown"), flash: $("flash"), camErr: $("camera-error"),
    mode: $("mode"), camera: $("camera"), rGallery: $("review-gallery"), bgFile: $("bg-file"),
    strength: $("key-strength"), soft: $("key-soft"), despill: $("key-despill"),
    frameOn: $("frame-on"), frameText: $("frame-text"), frameFile: $("frame-file"), mirror: $("mirror"),
    resetToken: $("reset-token"), keyStatus: $("key-status"),
    rCanvas: $("review-canvas"), rFrame: $("review-frame"), rFrameWrap: $("review-frame-wrap"), rErr: $("review-err"),
    confirm: $("confirm"), qrWaitSel: $("qr-wait"), fGallery: $("filter-gallery"), modeToggle: $("mode-toggle"), shotInd: $("shot-ind"), shotThumbs: $("shot-thumbs"),
    boothMode: $("booth-mode"), framing: $("cam-framing"), camStatus: $("cam-status"), stripTools: $("strip-tools"), paperChips: $("paper-chips"), layoutChips: $("layout-chips"), reorder: $("reorder-row"), dateChip: $("chip-date"), timeChip: $("chip-time"), printBtn: $("print"), showPrint: $("show-print"), showSettings: $("show-settings"), qrBase: $("qr-base"), qrWarn: $("qr-warn"), capBar: $("cap-bar"), capCancel: $("cap-cancel"), optStk: $("opt-stk"), optStkBox: $("opt-stk-box"), shotsSel: $("shots-per-strip"), layoutSel: $("strip-layout"),
    stLayer: $("sticker-layer"), stTray: $("sticker-tray"), stBox: $("sticker-box"), rFilterName: $("review-filter-name"), cutText: $("cut-progress-text"),
    cutToggle0: null, scale: $("ui-scale"), scaleVal: $("ui-scale-val"), scaleReset: $("ui-scale-reset"), cutToggle: $("cut-toggle"), cutProgress: $("cut-progress"), cutErr: $("cut-error"), cutKeep: $("cut-keep"), method: $("cutout-method"), tuning: $("tuning"), retake: $("retake"),
    img: $("result-img"), heading: $("result-title"), qr: $("qr"), qrStatus: $("qr-status"), qrText: $("qr-status-text"), qrDots: $("qr-dots"), qrHint: $("qr-hint"),
    retry: $("retry"), again: $("again"),
    idleWarn: $("idle-warning"), idleText: $("idle-text"),
    cdNum: $("cd-num"), cdSub: $("cd-sub"),
    resetNote: $("reset-note"), resetText: $("reset-text"), resetRing: $("reset-ring"),
    drawer: $("admin-drawer"), scrim: $("admin-scrim"), adminClose: $("admin-close"),
    adminHold: $("admin-hold"), adminOpen: $("admin-open"), adminPeek: $("admin-peek"), keyReset: $("key-reset"),
    tokenErr: $("token-err"), tokenGuest: $("token-guest"), tokenOp: $("token-op"), tokenCancel: $("token-cancel"),
    tokenDialog: $("token-dialog"), tokenForm: $("token-form"), tokenInput: $("token-input"),
  };

  // live counters are created here (i18n renders the surrounding sentence around them)
  const mkB = (id, txt) => { const b = document.createElement("b"); b.id = id; b.textContent = txt; return b; };
  el.againSec = mkB("again-sec", "3:00"); el.idleSec = mkB("idle-sec", "20");

  // ---------- safe storage ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const prefs = (() => { try { return JSON.parse(store.get(PREFS_KEY) || "{}"); } catch { return {}; } })();
  const savePrefs = () => store.set(PREFS_KEY, JSON.stringify(prefs));
  let qrWait = prefs.qrWait === "none" ? "none" : "3min";   // result-screen auto-reset: "3min" | "none"

  // ---------- state ----------
  let state = "live"; // live | countdown | processing | review | result
  let stream = null;
  let video = null;
  let rafId = 0;
  let lastFrame = 0;
  let bgId = "raw";          // chosen per photo on the review screen (starts at Original)
  let removeOn = false;     // "Remove background" toggled while Original is selected → transparent preview
  let cutId = 0, cutPromise = null;   // cut-out generation id / pending run for the current capture
  let shots = [];           // [{raw, cut, status}] captured frames (1 in Single mode)
  let scene = null;         // composed layout {W,H,rects,paper}
  let photoFilter = "none"; // filter fixed at capture time
  const ST = window.Stickers || null;
  let customBg = null;      // { img: ImageBitmap }
  let customFrame = null;   // ImageBitmap
  let resultUrl = null;     // object URL for result <img>
  let lastBlob = null;
  let uploading = false;
  let confirming = false;
  let fileBg = null;        // { id, bmp } full-res bitmap of the selected manifest background (only one kept)
  let fileItems = [];       // manifest background items [{id,file,name}]
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  let drawerOpen = false;
  const setState = (s) => { state = s; document.body.dataset.state = s; };
  const showScreen = (which) => { el.live.hidden = which !== "live"; el.review.hidden = which !== "review"; el.result.hidden = which !== "result"; };

  // work canvases (reused → no per-frame allocation)
  const work = document.createElement("canvas");
  const workCtx = work.getContext("2d", { willReadFrequently: true });
  const pctx = el.preview.getContext("2d");
  let hasCap = false;
  const rctx = el.rCanvas.getContext("2d");
  el.print = el.rCanvas.closest(".print");

  // ---------- backgrounds ----------
  const BACKGROUNDS = [
    { id: "raw", k: "bg.raw", type: "raw" },
    { id: "transparent", k: "bg.transparent", type: "transparent" },
    { id: "gradient-sunset", k: "bg.sunset", type: "gradient", stops: ["#ff7e5f", "#feb47b", "#7f53ac"] },
    { id: "gradient-ocean", k: "bg.ocean", type: "gradient", stops: ["#00c6ff", "#0072ff", "#0b0b3b"] },
    { id: "gradient-neon", k: "bg.neon", type: "gradient", stops: ["#f72585", "#7209b7", "#3a0ca3", "#4cc9f0"] },
    { id: "solid-dark", k: "bg.studio", type: "solid", color: "#15151f" },
    { id: "solid-white", k: "bg.white", type: "solid", color: "#ffffff" },
  ];
  const GALLERIES = [el.rGallery];
  const TRANSPARENT = { id: "transparent", type: "transparent" };

  function drawChecker(ctx, w, h) {
    const s = Math.max(8, Math.round(w / 40));
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      ctx.fillStyle = ((x / s + y / s) & 1) ? "#cfcfd6" : "#f4f4f8";
      ctx.fillRect(x, y, s, s);
    }
  }

  function drawBackground(ctx, w, h, bg, forExport) {
    if (bg.type === "gradient") {
      const g = ctx.createLinearGradient(0, 0, w, h);
      bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } else if (bg.type === "solid") {
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h);
    } else if ((bg.type === "image" && customBg) || (bg.type === "file" && fileBg && fileBg.id === bg.id)) {
      const img = bg.type === "image" ? customBg.img : fileBg.bmp;
      const r = Math.max(w / img.width, h / img.height); // cover
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else if (bg.type === "transparent") {
      if (forExport) ctx.clearRect(0, 0, w, h); else drawChecker(ctx, w, h);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    }
  }

  function currentBg() {
    if (bgId === "custom" && customBg) return { id: "custom", type: "image" };
    if (fileItems.some((i) => i.id === bgId)) return { id: bgId, type: "file" };
    return BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS[2];
  }

  function effBg() { const b = currentBg(); return b.type === "raw" && removeOn ? TRANSPARENT : b; }
  const needCut = () => effBg().type !== "raw";

  function paintThumb(c, bg) {
    const x = c.getContext("2d");
    if (bg.type === "raw") {   // "original photo": neutral metal tile with a lens mark
      const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, "#a3a8af"); g.addColorStop(1, "#6d737b");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); x.arc(32, 32, 13, 0, Math.PI * 2); x.stroke();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 4, 0, Math.PI * 2); x.fill();
    } else drawBackground(x, 64, 64, bg, false);
  }

  function makeThumb(id, k, onPick) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.setAttribute("role", "radio"); btn.dataset.id = id;
    btn.setAttribute("data-i18n-aria", k); btn.setAttribute("data-i18n-title", k);
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const chk = document.createElement("span"); chk.className = "chk"; chk.setAttribute("aria-hidden", "true"); chk.textContent = "✓";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.setAttribute("aria-hidden", "true"); lbl.dataset.i18n = k;
    btn.append(c, chk, lbl);
    btn.addEventListener("click", (e) => { (onPick || selectBg)(id); if (e.detail > 0) btn.blur(); });   // pointer click: let Space reach the shutter
    applyI(btn);
    return btn;
  }

  function buildGallery() {
    for (const g of GALLERIES) {
      g.textContent = "";
      for (const bg of BACKGROUNDS) {
        const btn = makeThumb(bg.id, bg.k);
        paintThumb(btn.firstChild, bg);
        g.append(btn);
      }
    }
    syncGallery();
  }
  // roving tabindex: only the checked radio is in the tab order
  // Background grid: always several columns and 2–6 rows (extra items scroll after 6 rows).
  // Column count adapts to how many backgrounds there are and how wide the panel is.
  const GRID_MIN_ROWS = 2, GRID_MAX_ROWS = 6;
  function layoutGrid(g) {
    const items = [...g.children].filter((b) => b.tagName === "BUTTON");
    const n = items.length; if (!n || !g.clientWidth) return;
    const cs = getComputedStyle(g), gap = parseFloat(cs.columnGap) || 16;
    const thumb = items[0].getBoundingClientRect().width || 56;
    const inner = g.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const maxCols = Math.max(2, Math.floor((inner + gap) / (thumb + gap)));
    const rows = Math.min(GRID_MAX_ROWS, Math.max(GRID_MIN_ROWS, Math.ceil(n / maxCols)));
    const cols = Math.max(2, Math.min(maxCols, Math.ceil(n / rows)));
    g.style.gridTemplateColumns = `repeat(${cols}, ${thumb}px)`;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    g.style.maxHeight = `${GRID_MAX_ROWS * thumb + (GRID_MAX_ROWS - 1) * gap + pad + 12}px`;   // 6 rows, then scroll
    g.style.overflowY = Math.ceil(n / cols) > GRID_MAX_ROWS ? "auto" : "hidden";
  }
  (function watchGrid() {
    const g = el.rGallery; let raf = 0;
    const go = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => layoutGrid(g)); };
    if (window.ResizeObserver) new ResizeObserver(go).observe(g);
    new MutationObserver(go).observe(g, { childList: true });
    window.addEventListener("resize", go);
  })();

  // The thumbnails have no visible labels (even grid); the selected one's name is shown once under the grid.
  function selName(g) { const b = [...g.children].find((x) => x.getAttribute("aria-checked") === "true"); return b ? (b.getAttribute("aria-label") || b.title || "") : ""; }
  function updateNames() {
    const a = document.getElementById("review-bg-name"), f = document.getElementById("filter-name");
    if (a) a.textContent = selName(el.rGallery);
    if (f) f.textContent = selName(el.fGallery);
  }
  window.I18N.onChange(() => updateNames());
  function syncGallery() {
    for (const g of GALLERIES) {
      const items = [...g.children];
      const any = items.some((b) => b.dataset.id === bgId);
      items.forEach((b, i) => {
        const on = b.dataset.id === bgId;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on || (!any && i === 0) ? 0 : -1;
      });
    }
    updateNames();
  }
  function selectBg(id) {
    bgId = id; removeOn = false; prefs.bg = id; savePrefs(); syncGallery();
    ensureFileBg(id).then(() => { if (state === "review" && hasCap && bgId === id) refreshReview(); });
    if (state === "review" && hasCap) refreshReview();   // instant re-composite at preview size
  }

  // ---------- background images from /backgrounds/manifest.json ----------
  const bgUrl = (item) => `/backgrounds/${encodeURIComponent(item.file)}`;
  const itemName = (item) => (item.name && (item.name[window.I18N.getLang()] || item.name.en)) || item.id;
  function relabelFileThumbs() {
    for (const g of GALLERIES) for (const btn of g.querySelectorAll("[data-file]")) {
      const item = fileItems.find((i) => i.id === btn.dataset.id); if (!item) continue;
      const n = itemName(item);
      btn.setAttribute("aria-label", n); btn.title = n; btn.querySelector(".lbl").textContent = n;
    }
  }
  // Decode the full image only for the selected item; the previous bitmap is closed.
  async function ensureFileBg(id) {
    const item = fileItems.find((i) => i.id === id);
    if (!item || (fileBg && fileBg.id === id)) return;
    try {
      const res = await fetch(bgUrl(item)); if (!res.ok) throw new Error("bg");
      const bmp = await createImageBitmap(await res.blob());
      if (bgId !== id) { bmp.close(); return; }   // selection moved on while decoding
      fileBg?.bmp.close(); fileBg = { id, bmp };
    } catch {   // file gone / unreadable: fall back to Original
      if (bgId === id) selectBg("raw");
    }
  }
  async function loadManifest() {
    let m = null;
    try { const r = await fetch("/backgrounds/manifest.json", { cache: "no-store" }); if (r.ok) m = await r.json(); } catch { /* none */ }
    if (!m || !Array.isArray(m.items)) m = { includeBuiltins: true, items: [] };
    if (m.includeBuiltins === false) {
      for (const g of GALLERIES) for (const b of [...g.children]) { const bg = BACKGROUNDS.find((x) => x.id === b.dataset.id); if (bg && (bg.type === "gradient" || bg.type === "solid")) b.remove(); }
    }
    const items = m.items.filter((i) => i && typeof i.id === "string" && typeof i.file === "string");
    const thumbs = new Array(items.length).fill(null);
    let next = 0;
    const worker = async () => {   // small-size decode, 4 at a time
      while (next < items.length) {
        const idx = next++, item = items[idx];
        try {
          const r = await fetch(bgUrl(item)); if (!r.ok) continue;
          const bmp = await createImageBitmap(await r.blob(), { resizeWidth: 160, resizeQuality: "medium" });
          const c = document.createElement("canvas"); c.width = c.height = 128;
          const x = c.getContext("2d"); const k = Math.max(128 / bmp.width, 128 / bmp.height);
          x.drawImage(bmp, (128 - bmp.width * k) / 2, (128 - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
          bmp.close(); thumbs[idx] = c;
        } catch { /* skip silently */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    fileItems = items.filter((_, i) => thumbs[i]);
    const customBtn = el.rGallery.querySelector('[data-id="custom"]');
    items.forEach((item, i) => {
      if (!thumbs[i]) return;
      const btn = makeThumb(item.id, "bg.custom"); btn.dataset.file = "1";
      btn.removeAttribute("data-i18n-aria"); btn.removeAttribute("data-i18n-title"); btn.querySelector(".lbl").removeAttribute("data-i18n");
      const c = btn.firstChild; c.width = c.height = 128; c.getContext("2d").drawImage(thumbs[i], 0, 0);
      el.rGallery.insertBefore(btn, customBtn);
    });
    relabelFileThumbs(); syncGallery();
  }

  [el.rGallery, el.fGallery].forEach((g) => g.addEventListener("keydown", (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const items = [...g.children];
    let i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === "Home") i = 0; else if (e.key === "End") i = items.length - 1;
    else if (keys[e.key]) i = (i + keys[e.key] + items.length) % items.length;
    else return;
    e.preventDefault();
    (g === el.fGallery ? selectFilter : selectBg)(items[i].dataset.id); items[i].focus();
    items[i].scrollIntoView({ block: "nearest", inline: "center" });
  }));

  el.bgFile.addEventListener("change", async () => {
    const f = el.bgFile.files?.[0]; el.bgFile.value = "";
    if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024) return;
    try {
      const bmp = await createImageBitmap(f);
      customBg?.img.close();         // free GPU/CPU memory of the previous one
      customBg = { img: bmp };
      for (const g of GALLERIES) {
        let btn = g.querySelector('[data-id="custom"]');
        if (!btn) { btn = makeThumb("custom", "bg.custom"); g.append(btn); }
        btn.firstChild.getContext("2d").drawImage(bmp, 0, 0, 64, 64);
      }
      selectBg("custom");
    } catch { /* unreadable image → ignore */ }
  });

  // ---------- frame ----------
  el.frameFile.addEventListener("change", async () => {
    const f = el.frameFile.files?.[0]; el.frameFile.value = "";
    if (!f || f.type !== "image/png" || f.size > 10 * 1024 * 1024) return;
    try { customFrame?.close(); customFrame = await createImageBitmap(f); el.frameOn.checked = true; syncPrefs(); } catch { /* ignore */ }
  });

  function drawFrame(ctx, w, h, on) {
    if (!on) return;
    if (customFrame) { ctx.drawImage(customFrame, 0, 0, w, h); return; }
    const b = Math.round(Math.min(w, h) * 0.035);
    ctx.save();
    ctx.lineWidth = b; ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(b / 2, b / 2, w - b, h - b);
    const text = el.frameText.value.trim();
    if (text) {
      const fs = Math.round(h * 0.055);
      ctx.font = `700 ${fs}px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const bandH = fs * 1.7;
      ctx.fillStyle = "#000a"; ctx.fillRect(0, h - bandH - b, w, bandH);
      ctx.fillStyle = "#fff"; ctx.fillText(text, w / 2, h - bandH / 2 - b);
    }
    ctx.restore();
  }

  // ---------- chroma key ----------
  // Green dominance d = g - max(r,b). d<=lo → opaque, d>=hi → transparent, smoothstep between.
  function chromaKey(img, strength, softness, despillAmt) {
    const d = img.data;
    const lo = 50 - strength * 0.5;       // strength 50 → 25
    const hi = lo + softness;             // softness 45 → 70
    const span = Math.max(1, hi - lo);
    const sp = despillAmt / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const m = r > b ? r : b;
      const dom = g - m;
      if (dom <= 0) continue;                       // not greenish: keep
      let tt = (dom - lo) / span;
      if (tt >= 1) { d[i + 3] = 0; continue; }
      if (tt > 0) { d[i + 3] = (255 * (1 - tt * tt * (3 - 2 * tt))) | 0; }
      d[i + 1] = g - dom * sp;                      // despill: pull green toward max(r,b)
    }
  }

  // ---------- filters (applied at composite time to the subject only) ----------
  const FILTERS = [
    { id: "none", k: "f.none" },
    { id: "bw", k: "f.bw", p: { gray: 1 } },
    { id: "sepia", k: "f.sepia", p: { sepia: 0.85 } },
    { id: "vivid", k: "f.vivid", p: { sat: 1.5, con: 1.1 } },
    { id: "warm", k: "f.warm", p: { sepia: 0.22, sat: 1.2, hue: -8, bri: 1.04 } },
    { id: "cool", k: "f.cool", p: { sat: 1.05, hue: 14, bri: 1.02, con: 1.03 } },
    { id: "fade", k: "f.fade", p: { con: 0.82, bri: 1.1, sat: 0.8 } },
    { id: "dream", k: "f.dream", p: { bri: 1.05, sat: 1.1 }, glow: { blur: 0.008, alpha: 0.45, bri: 1.15 } },
    { id: "noir", k: "f.noir", p: { gray: 1, con: 1.6, bri: 0.95 } },
    { id: "beauty", k: "f.beauty", p: { bri: 1.05, sat: 1.05 }, glow: { blur: 0.004, alpha: 0.35, bri: 1.05 } },
  ];
  const SUPPORTS_FILTER = (() => { try { return "filter" in document.createElement("canvas").getContext("2d"); } catch { return false; } })();
  const filterAvail = (f) => f.id === "none" || SUPPORTS_FILTER || (!f.p.hue && !f.glow);   // Safari fallback: simple per-pixel ones only
  const FILTER_LIST = FILTERS.filter(filterAvail);
  let filterId = FILTER_LIST.some((f) => f.id === prefs.filter) ? prefs.filter : "none";
  const filterById = (id) => FILTER_LIST.find((f) => f.id === id) || FILTERS[0];
  const cssOf = (p) => [p.gray != null && `grayscale(${p.gray})`, p.sepia != null && `sepia(${p.sepia})`, p.sat != null && `saturate(${p.sat})`,
    p.con != null && `contrast(${p.con})`, p.bri != null && `brightness(${p.bri})`, p.hue && `hue-rotate(${p.hue}deg)`].filter(Boolean).join(" ") || "none";
  const fxCanvas = document.createElement("canvas"); let fxCtx = null;
  function pixelFilter(d, p) {   // fallback for browsers without ctx.filter
    const g = p.gray || 0, se = p.sepia || 0, sat = p.sat ?? 1, con = p.con ?? 1, bri = p.bri ?? 1;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gg = d[i + 1], b = d[i + 2];
      if (g) { const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b; r += (l - r) * g; gg += (l - gg) * g; b += (l - b) * g; }
      if (se) {
        const sr = 0.393 * r + 0.769 * gg + 0.189 * b, sg = 0.349 * r + 0.686 * gg + 0.168 * b, sb = 0.272 * r + 0.534 * gg + 0.131 * b;
        r += (sr - r) * se; gg += (sg - gg) * se; b += (sb - b) * se;
      }
      if (sat !== 1) { const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b; r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat; }
      if (con !== 1) { r = (r - 128) * con + 128; gg = (gg - 128) * con + 128; b = (b - 128) * con + 128; }
      if (bri !== 1) { r *= bri; gg *= bri; b *= bri; }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  // Draw src region → dest rect with filter f (alpha preserved, so cut-outs keep their silhouette).
  function drawFiltered(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, f) {
    if (!f || f.id === "none") { ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    if (SUPPORTS_FILTER) {
      ctx.save();
      ctx.filter = cssOf(f.p); ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
      if (f.glow) {   // soft glow: blurred, brightened copy blended on top
        ctx.filter = `blur(${Math.max(1, f.glow.blur * dw).toFixed(1)}px) brightness(${f.glow.bri})`; ctx.globalAlpha = f.glow.alpha;
        ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
      }
      ctx.restore();
    } else {
      const w = Math.max(1, Math.round(dw)), h = Math.max(1, Math.round(dh));
      fxCanvas.width = w; fxCanvas.height = h; fxCtx = fxCtx || fxCanvas.getContext("2d", { willReadFrequently: true });
      fxCtx.clearRect(0, 0, w, h); fxCtx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
      const img = fxCtx.getImageData(0, 0, w, h); pixelFilter(img.data, f.p); fxCtx.putImageData(img, 0, 0);
      ctx.drawImage(fxCanvas, dx, dy, dw, dh);
    }
  }
  function coverSrc(src, r) {   // source rect that "covers" destination rect r
    const sw = src.width, sh = src.height, ra = r.w / r.h, sa = sw / sh;
    let cw = sw, ch = sh; if (sa > ra) cw = sh * ra; else ch = sw / ra;
    return [(sw - cw) / 2, (sh - ch) / 2, cw, ch];
  }

  function buildFilterGallery() {
    el.fGallery.textContent = "";
    for (const f of FILTER_LIST) {
      const btn = makeThumb(f.id, f.k, (id) => selectFilter(id));
      el.fGallery.append(btn);
    }
    syncFilterGallery(); paintSwatches(); loadSwatchAssets();
  }
  function syncFilterGallery() {
    [...el.fGallery.children].forEach((b) => {
      const on = b.dataset.id === filterId;
      b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1;
    });
    updateNames();
  }
  function selectFilter(id) { filterId = id; prefs.filter = id; savePrefs(); syncFilterGallery(); }
  // Static chip swatches: one sample picture per chip, drawn once (no camera, no timers).
  const sample = new Image(); let overrides = {};
  const overrideImgs = {};
  function paintSwatches() {
    for (const b of el.fGallery.children) {
      const f = filterById(b.dataset.id), x = b.firstChild.getContext("2d");
      x.clearRect(0, 0, 64, 64);
      const ov = overrideImgs[f.id];
      if (ov) { const r = { x: 0, y: 0, w: 64, h: 64 }; x.drawImage(ov, ...coverSrc(ov, r), 0, 0, 64, 64); }
      else if (sample.complete && sample.naturalWidth) drawFiltered(x, sample, 0, 0, sample.naturalWidth, sample.naturalHeight, 0, 0, 64, 64, f);
      else { const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, "#c9ccd1"); g.addColorStop(1, "#8b9098"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
    }
  }
  function refreshSwatches() { paintSwatches(); }
  async function loadSwatchAssets() {
    try { const r = await fetch("/filters/overrides.json", { cache: "no-store" }); if (r.ok) overrides = await r.json(); } catch { /* none */ }
    await Promise.all(Object.entries(overrides || {}).filter(([id, f]) => FILTER_LIST.some((x) => x.id === id) && typeof f === "string").map(([id, f]) => new Promise((res) => {
      const im = new Image(); im.onload = () => { overrideImgs[id] = im; res(); }; im.onerror = () => res(); im.src = "/filters/" + encodeURIComponent(f);
    })));
    paintSwatches();
  }
  sample.onload = paintSwatches; sample.src = "/filters/sample.svg";

  // Live preview: plain camera (Auto) or keyed over a fixed backdrop (Green screen), with the chosen filter.
  function renderFrame(ctx, w, h) {
    const green = el.method.value === "green";
    const mirror = el.mirror.checked;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return false;
    const f = filterById(filterId);

    if (!green) {
      ctx.save();
      if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      drawFiltered(ctx, video, 0, 0, vw, vh, 0, 0, w, h, f);
      ctx.restore();
    } else {
      const sw = Math.min(PREVIEW_W, w), sh = Math.round(sw * h / w);
      if (work.width !== sw || work.height !== sh) { work.width = sw; work.height = sh; }
      workCtx.save();
      workCtx.clearRect(0, 0, sw, sh);
      if (mirror) { workCtx.translate(sw, 0); workCtx.scale(-1, 1); }
      workCtx.drawImage(video, 0, 0, sw, sh);
      workCtx.restore();
      const data = workCtx.getImageData(0, 0, sw, sh);
      chromaKey(data, +el.strength.value, +el.soft.value, +el.despill.value);
      workCtx.putImageData(data, 0, 0);
      drawBackground(ctx, w, h, BACKGROUNDS[2], false);
      drawFiltered(ctx, work, 0, 0, sw, sh, 0, 0, w, h, f);
    }
    drawFrame(ctx, w, h, el.frameOn.checked && curMode() === "single");
    return true;
  }

  // ---------- camera ----------
  function showCamError(key, vars) {
    if (key) { setI(el.camErr, key, vars); el.camErr.hidden = false; el.shutter.disabled = true; }
    else { clearI(el.camErr); el.camErr.hidden = true; el.shutter.disabled = false; }
  }

  const framingMode = () => (["16x9", "4x3"].includes(prefs.framing) ? prefs.framing : "widest");
  function constraintsFor(deviceId) {
    const prod = el.mode.value === "prod", fm = framingMode();
    const v = { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }), frameRate: { ideal: 30 }, resizeMode: { ideal: "none" } };
    if (fm === "4x3") { v.width = { ideal: 1600 }; v.height = { ideal: 1200 }; v.aspectRatio = { ideal: 4 / 3 }; }
    else { v.width = { ideal: prod ? 1920 : fm === "16x9" ? 1280 : 1920 }; v.height = { ideal: prod ? 1080 : fm === "16x9" ? 720 : 1080 }; if (fm === "16x9") v.aspectRatio = { ideal: 16 / 9 }; }
    return { audio: false, video: v };
  }

  // Widest view: when a 4:3 mode is available (the 16:9 stream is usually a crop of a 4:3 sensor), prefer it.
  async function chooseWidest(track) {
    if (framingMode() !== "widest" || !track.applyConstraints) return;
    let caps = {}; try { caps = track.getCapabilities?.() || {}; } catch { /* ignore */ }
    const cur = track.getSettings();
    if (!cur.width || !cur.height || Math.abs(cur.width / cur.height - 4 / 3) < 0.02) return;
    const maxH = caps.height?.max || 0, maxW = caps.width?.max || 0;
    for (const [w, h] of [[1920, 1440], [1600, 1200], [1280, 960], [1024, 768]]) {
      if (h < cur.height * 0.9 || (maxH && h > maxH) || (maxW && w > maxW)) continue;
      try { await track.applyConstraints({ width: { exact: w }, height: { exact: h } }); const n = track.getSettings(); if (n.width / n.height > 1.3 && n.width / n.height < 1.37) return; } catch { /* mode not offered */ }
    }
    try { await track.applyConstraints({ width: { ideal: cur.width }, height: { ideal: cur.height } }); } catch { /* keep whatever we have */ }
  }

  // Force the widest, fixed view on PTZ cameras (Chrome exposes this only for cameras that report pan/tilt/zoom).
  let ptzInfo = "";
  async function lockWidest(track) {
    ptzInfo = "fixed";
    let caps = {}; try { caps = track.getCapabilities?.() || {}; } catch { return; }
    const adv = {};
    if (caps.zoom && caps.zoom.min != null) adv.zoom = caps.zoom.min;
    if (caps.pan && caps.pan.min != null) adv.pan = (caps.pan.min + caps.pan.max) / 2;
    if (caps.tilt && caps.tilt.min != null) adv.tilt = (caps.tilt.min + caps.tilt.max) / 2;
    if (!Object.keys(adv).length) return;
    ptzInfo = "adjustable" + (caps.zoom ? ", locked to widest" : "");
    try { await track.applyConstraints({ advanced: [adv] }); } catch { /* not settable */ }
  }
  const relock = () => { const t = stream?.getVideoTracks()[0]; if (t) lockWidest(t).catch(() => {}); };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function paintCamStatus() {
    const t = stream?.getVideoTracks()[0]; if (!t) { el.camStatus.textContent = "—"; return; }
    const st = t.getSettings(), w = st.width || video?.videoWidth, h = st.height || video?.videoHeight;
    if (!w || !h) { el.camStatus.textContent = "—"; return; }
    const r = w / h, ratio = Math.abs(r - 16 / 9) < 0.03 ? "16:9" : Math.abs(r - 4 / 3) < 0.03 ? "4:3" : `${w / gcd(w, h)}:${h / gcd(w, h)}`;
    el.camStatus.textContent = `${w}×${h} · ${ratio} · ${window.I18N.t("cam.zoom")}: ${window.I18N.t(ptzInfo.startsWith("adjustable") ? "cam.locked" : "cam.fixed")}`;
  }

  function stopStream() {
    cancelAnimationFrame(rafId); rafId = 0;
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    if (video) { video.srcObject = null; video.remove(); video = null; }
  }

  async function listCameras(selectedId) {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    el.camera.textContent = "";
    devices.forEach((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId; o.textContent = d.label || t("camera.n", { n: i + 1 });
      el.camera.append(o);
    });
    if (selectedId && devices.some((d) => d.deviceId === selectedId)) el.camera.value = selectedId;
    return devices;
  }

  async function startCamera(deviceId) {
    stopStream();
    showCamError("");
    if (!navigator.mediaDevices?.getUserMedia) return showCamError("err.camApi");
    try {
      try { stream = await navigator.mediaDevices.getUserMedia(constraintsFor(deviceId)); }
      catch (e) {
        if (e.name === "OverconstrainedError" && deviceId) stream = await navigator.mediaDevices.getUserMedia(constraintsFor(null));
        else throw e;
      }
      const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
      const devices = await listCameras(active);   // labels only exist after permission is granted

      // Production mode: prefer a Nikon / virtual-webcam device the first time.
      if (!deviceId && el.mode.value === "prod") {
        const nikon = devices.find((d) => /nikon|dslr|ndi|virtual/i.test(d.label));
        if (nikon && nikon.deviceId !== active) { stopStream(); return startCamera(nikon.deviceId); }
      }
      prefs.camera = el.camera.value; savePrefs();
      const vt = stream.getVideoTracks()[0];
      try { await chooseWidest(vt); } catch { /* keep the stream we have */ }
      try { await lockWidest(vt); } catch { /* ignore */ }
      vt.addEventListener("unmute", relock);

      video = document.createElement("video");
      video.className = "offscreen"; video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
      // Must stay in the DOM (iOS Safari pauses detached / display:none video).
      Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
      document.body.append(video);
      video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener("ended", () => showCamError("err.camLost"));
      await video.play();
      if (video.videoWidth && video.videoHeight) { prefs.ar = +(video.videoWidth / video.videoHeight).toFixed(4); savePrefs(); el.preview.parentElement.style.setProperty("--ar", String(prefs.ar)); }
      paintCamStatus();
      loop();
      warmSegmenter();
    } catch (e) {
      const map = { NotAllowedError: "err.camDenied", NotFoundError: "err.camNotFound", NotReadableError: "err.camBusy" };
      if (map[e.name]) showCamError(map[e.name]); else showCamError("err.camGeneric", { m: e.message || e.name });
    }
  }

  function loop(ts = 0) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden || state === "result" || state === "review" || state === "processing" || !video) return;
    if (ts - lastFrame < 33) return;   // ~30 fps cap
    lastFrame = ts;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const pw = Math.min(vw, 960), ph = Math.round(pw * vh / vw);
    if (el.preview.width !== pw || el.preview.height !== ph) { el.preview.width = pw; el.preview.height = ph; el.preview.parentElement.style.setProperty("--ar", String(pw / ph)); }
    renderFrame(pctx, pw, ph);
  }

  // ---------- capture ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STRIP_W = 1200, STRIP_FRAME_MAX_W = 1280;

  function freeCapture() {
    cutId++; cutPromise = null;   // discard any in-flight cut-out
    fileBg?.bmp.close(); fileBg = null;                // background image is re-decoded lazily next time
    for (const s of shots) { s.raw.width = s.raw.height = 0; if (s.cut) s.cut.width = s.cut.height = 0; }
    shots = []; hasCap = false; scene = null;
    el.shotThumbs.textContent = ""; el.shotThumbs.hidden = true;
    ST?.clear();
  }

  // Grab the current video frame (mirrored if on) into a new canvas.
  function grabFrame(maxW) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const w = Math.min(vw, maxW), h = Math.round(w * vh / vw);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    if (el.mirror.checked) { x.translate(w, 0); x.scale(-1, 1); }
    x.drawImage(video, 0, 0, w, h);
    return c;
  }

  function warmSegmenter() {
    if (el.method.value === "auto" && window.Segmenter) window.Segmenter.load().catch(() => { /* surfaced when a cut-out is requested */ });
  }

  // Aggregate cut-out status over all shots.
  function cutAgg() {
    if (!shots.length) return "idle";
    if (shots.some((s) => s.status === "error")) return "error";
    return shots.every((s) => s.status === "ready") ? "ready" : "working";
  }

  // Produce cut-outs for every shot, sequentially, cached on each shot.
  function startCutouts() {
    const id = cutId;
    const green = el.method.value === "green";
    shots.forEach((s) => { s.status = "idle"; });
    if (green) {   // chroma key: synchronous
      for (const s of shots) {
        const c = document.createElement("canvas"); c.width = s.raw.width; c.height = s.raw.height;
        const cc = c.getContext("2d", { willReadFrequently: true });
        cc.drawImage(s.raw, 0, 0);
        const data = cc.getImageData(0, 0, c.width, c.height);
        chromaKey(data, +el.strength.value, +el.soft.value, +el.despill.value);
        cc.putImageData(data, 0, 0);
        s.cut = c; s.status = "ready";
      }
      return;
    }
    if (!window.Segmenter) { shots.forEach((s) => { s.status = "error"; }); return; }
    cutPromise = (async () => {
      for (const s of shots) {
        if (id !== cutId) return;
        s.status = "working"; if (state === "review") refreshReview();
        try {
          const c = await window.Segmenter.cutout(s.raw);
          if (id !== cutId) { if (c && c.width) c.width = c.height = 0; return; }   // retaken meanwhile
          s.cut = c; s.status = "ready";
        } catch { if (id === cutId) s.status = "error"; break; }
        if (id === cutId && state === "review") refreshReview();
      }
      if (id === cutId && state === "review") refreshReview();
    })();
  }

  // ---------- scene layout (single photo or photo strip) ----------
  const isStrip = () => shots.length > 1;
  function buildScene() {
    const n = shots.length;
    if (n === 1) { const s = shots[0]; scene = { W: s.raw.width, H: s.raw.height, rects: [{ x: 0, y: 0, w: s.raw.width, h: s.raw.height }], paper: false, footer: 0 }; return; }
    const W = STRIP_W, fa = shots[0].raw.width / shots[0].raw.height, footer = (el.rFrame.checked || prefs.date || prefs.time) ? 200 : 0;
    const grid = n === 4 && prefs.layout === "grid";
    const rects = [];
    let H;
    if (grid) {
      const m = 50, g = 30, fw = (W - 2 * m - g) / 2, fh = fw / fa;
      for (let i = 0; i < 4; i++) rects.push({ x: m + (i % 2) * (fw + g), y: m + Math.floor(i / 2) * (fh + g), w: fw, h: fh });
      H = Math.round(m + 2 * fh + g + m + footer);
    } else {
      const m = 60, g = 36, fw = W - 2 * m, fh = fw / fa;
      for (let i = 0; i < n; i++) rects.push({ x: m, y: m + i * (fh + g), w: fw, h: fh });
      H = Math.round(m + n * fh + (n - 1) * g + m + footer);
    }
    scene = { W, H, rects, paper: true, footer };
  }
  const PAPERS = [["white", "#ffffff", 0], ["black", "#141414", 1], ["cream", "#f6edd9", 0], ["pink", "#f7d4de", 0], ["sky", "#cfe6f7", 0], ["sage", "#d3e2cc", 0], ["lavender", "#e1d8f2", 0]];
  const paper = () => PAPERS.find((p) => p[0] === prefs.paper) || PAPERS[0];
  const crest = new Image(); crest.src = "/logo-crest.png";

  function drawFooter(ctx, k) {
    const y0 = (scene.H - scene.footer) * k, h = scene.footer * k;
    const text = el.frameText.value.trim();
    const now = new Date(), lg = window.I18N.getLang();
    const stamp = [prefs.date && now.toLocaleDateString(lg, { year: "numeric", month: "short", day: "numeric" }),
      prefs.time && now.toLocaleTimeString(lg, { hour: "2-digit", minute: "2-digit" })].filter(Boolean).join("  ·  ");
    const ch = h * 0.5;
    ctx.save();
    const dark = !!paper()[2];
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = dark ? "#f2f2f2" : "#222";
    if (crest.complete && crest.naturalWidth) {
      const cw = ch * crest.naturalWidth / crest.naturalHeight, cx = (scene.W * k - cw) / 2, cy = y0 + h * 0.06;
      if (dark) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(cx - ch * 0.12, cy - ch * 0.08, cw + ch * 0.24, ch + ch * 0.16, ch * 0.14); ctx.fill(); ctx.fillStyle = "#f2f2f2"; }
      ctx.drawImage(crest, cx, cy, cw, ch);
    }
    const fs = h * 0.15;
    ctx.font = `600 ${fs}px system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillText(text || "", scene.W * k / 2, y0 + h * 0.70);
    ctx.font = `400 ${fs * 0.8}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.fillStyle = dark ? "#c8c8c8" : "#555";
    if (stamp) ctx.fillText(stamp, scene.W * k / 2, y0 + h * 0.88);
    ctx.restore();
  }

  // Paint one shot into rect r (already in canvas pixels): background + subject(+filter).
  function paintShot(ctx, s, r, forExport, useCut) {
    const bg = effBg(), f = filterById(photoFilter);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    if (useCut && s.cut) {
      ctx.translate(r.x, r.y);
      if (scene.paper && forExport && bg.type === "transparent") { ctx.fillStyle = paper()[1]; ctx.fillRect(0, 0, r.w, r.h); }
      else drawBackground(ctx, r.w, r.h, bg, forExport);
      ctx.translate(-r.x, -r.y);
      drawFiltered(ctx, s.cut, ...coverSrc(s.cut, r), r.x, r.y, r.w, r.h, f);
    } else drawFiltered(ctx, s.raw, ...coverSrc(s.raw, r), r.x, r.y, r.w, r.h, f);
    ctx.restore();
  }

  function composeScene(ctx, k, forExport, useCut) {
    if (scene.paper) { ctx.fillStyle = paper()[1]; ctx.fillRect(0, 0, scene.W * k, scene.H * k); }
    scene.rects.forEach((r, i) => paintShot(ctx, shots[i], { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }, forExport, useCut));
    if (scene.paper) { if (scene.footer) drawFooter(ctx, k); }
    else drawFrame(ctx, scene.W * k, scene.H * k, el.rFrame.checked);
  }

  // Size the review canvas for the current scene and repaint everything.
  function layoutReview() {
    buildScene();
    const rw = Math.min(scene.W, scene.paper ? 720 : REVIEW_MAX_W), k = rw / scene.W, rh = Math.round(scene.H * k);
    el.rCanvas.width = rw; el.rCanvas.height = rh; el.rCanvas.style.setProperty("--ar", String(rw / rh));
    el.print.classList.toggle("is-strip", scene.paper);
    syncStripTools();
    refreshReview();
  }

  // Repaint the review canvas + overlays for the current background / cut-out status.
  function refreshReview() {
    if (!hasCap || !scene) return;
    const need = needCut(), st = cutAgg();
    const k = el.rCanvas.width / scene.W;
    composeScene(rctx, k, false, need && st === "ready");
    el.cutProgress.hidden = !(need && st === "working");
    if (!el.cutProgress.hidden) {
      if (isStrip()) setI(el.cutText, "review.workingN", { i: Math.min(shots.length, shots.filter((s) => s.status === "ready").length + 1), n: shots.length });
      else setI(el.cutText, "review.working");
    }
    el.cutErr.hidden = !(need && st === "error");
    el.cutToggle.setAttribute("aria-pressed", String(need));
    el.print.classList.toggle("is-cut", need && st === "ready");
  }

  // ----- strip review tools: layout switch, reorder, date/time -----
  function syncStripTools() {
    el.stripTools.hidden = !isStrip();
    if (!isStrip()) return;
    const grid = shots.length === 4 && prefs.layout === "grid";
    el.layoutChips.querySelector('[data-layout="grid"]').hidden = shots.length !== 4;
    el.layoutChips.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layout === (grid ? "grid" : "vertical"))));
    el.paperChips.querySelectorAll("[data-paper]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paper === paper()[0])));
    el.dateChip.setAttribute("aria-pressed", String(!!prefs.date)); el.timeChip.setAttribute("aria-pressed", String(!!prefs.time));
    el.reorder.textContent = "";
    shots.forEach((sh, i) => {
      const th = Math.round(96 * sh.raw.height / sh.raw.width), c = document.createElement("canvas"); c.width = 96; c.height = th; c.dataset.i = String(i); c.className = "reo";
      c.style.aspectRatio = `${sh.raw.width} / ${sh.raw.height}`;
      c.getContext("2d").drawImage(sh.raw, 0, 0, 96, th);
      el.reorder.append(c);
    });
  }
  el.layoutChips.querySelectorAll("[data-layout]").forEach((b) => b.addEventListener("click", () => {
    prefs.layout = b.dataset.layout; el.layoutSel.value = prefs.layout; savePrefs(); if (hasCap) layoutReview();
  }));
  el.paperChips.querySelectorAll("[data-paper]").forEach((b) => b.addEventListener("click", () => { prefs.paper = b.dataset.paper; savePrefs(); if (hasCap) layoutReview(); }));
  [[el.dateChip, "date"], [el.timeChip, "time"]].forEach(([b, k]) => b.addEventListener("click", () => { prefs[k] = !prefs[k]; savePrefs(); if (hasCap) layoutReview(); }));
  // drag & drop reordering (pointer events: mouse + touch)
  (() => {
    let from = -1, ghost = null;
    const idxAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.classList.contains("reo") ? +e.dataset.i : -1; };
    el.reorder.addEventListener("pointerdown", (e) => {
      const t = e.target; if (!t.classList.contains("reo")) return;
      from = +t.dataset.i; t.setPointerCapture(e.pointerId); t.classList.add("drag");
    });
    el.reorder.addEventListener("pointermove", (e) => {
      if (from < 0) return;
      const to = idxAt(e.clientX, e.clientY);
      el.reorder.querySelectorAll(".reo").forEach((c) => c.classList.toggle("over", +c.dataset.i === to && to !== from));
    });
    const end = (e, commit) => {
      if (from < 0) return;
      const to = commit ? idxAt(e.clientX, e.clientY) : -1, f = from; from = -1;
      el.reorder.querySelectorAll(".reo").forEach((c) => c.classList.remove("drag", "over"));
      if (to >= 0 && to !== f) { const [m] = shots.splice(f, 1); shots.splice(to, 0, m); layoutReview(); }
    };
    el.reorder.addEventListener("pointerup", (e) => end(e, true));
    el.reorder.addEventListener("pointercancel", (e) => end(e, false));
  })();

  const curMode = () => { const b = prefs.booth || "guests"; if (b === "single" || b === "strip") return b; return prefs.pick === "strip" ? "strip" : "single"; };
  const shotsN = () => [3, 4, 6].includes(+prefs.shots) ? +prefs.shots : 4;

  let capToken = 0;   // bumped to abort an in-flight capture (Esc / Cancel)
  function cancelCapture() {
    if (state !== "countdown") return;
    capToken++;
    freeCapture();
    el.countdown.hidden = true; el.flash.hidden = true; el.shotInd.hidden = true; el.capBar.hidden = true;
    el.cdNum.textContent = ""; el.cdNum.classList.remove("tick"); clearI(el.cdSub);
    setState("live"); el.shutter.disabled = false;
    el.shutter.focus({ preventScroll: true });
  }
  el.capCancel.addEventListener("click", cancelCapture);

  async function takePicture() {
    if (state !== "live" || !video || !video.videoWidth) return;
    const n = curMode() === "strip" ? shotsN() : 1;
    const tok = ++capToken, dead = () => tok !== capToken;
    freeCapture(); photoFilter = filterId;
    setState("countdown"); el.shutter.disabled = true; el.capBar.hidden = false;
    for (let i = 0; i < n; i++) {
      if (!video) break;
      if (n > 1) { setI(el.shotInd, "shot.of", { i: i + 1, n }); el.shotInd.hidden = false; }
      for (let c = i === 0 ? COUNTDOWN_SEC : 2; c > 0; c--) {   // later shots use a shorter 2-1 countdown
        el.countdown.hidden = false;
        el.cdNum.textContent = String(c); setI(el.cdSub, `cd.${c}`);
        el.cdNum.classList.remove("tick"); void el.cdNum.offsetWidth; el.cdNum.classList.add("tick");   // retrigger pop
        await sleep(1000);
        if (dead()) return;
      }
      el.flash.hidden = false; setTimeout(() => { el.flash.hidden = true; }, 400);
      const c = video ? grabFrame(n > 1 ? STRIP_FRAME_MAX_W : CAPTURE_MAX_W) : null;
      if (!c) break;
      shots.push({ raw: c, cut: null, status: "idle" });
      if (n > 1) addShotThumb(c);
      if (i < n - 1) { el.cdNum.textContent = ""; clearI(el.cdSub); await sleep(500); if (dead()) return; }
    }
    if (dead()) return;
    el.capBar.hidden = true;
    el.shotInd.hidden = true;
    el.cdNum.textContent = ""; el.cdNum.classList.remove("tick"); setI(el.cdSub, "processing");
    setState("processing");
    await sleep(30);   // let the "Processing…" frame paint before the heavy work
    el.countdown.hidden = true;
    if (shots.length !== n) {
      freeCapture(); setState("live"); el.shutter.disabled = false;
      return showCamError("err.create");
    }
    hasCap = true;
    showReview();
  }

  function addShotThumb(src) {
    const th = Math.round(96 * src.height / src.width), c = document.createElement("canvas"); c.width = 96; c.height = th;
    c.style.aspectRatio = `${src.width} / ${src.height}`;
    c.getContext("2d").drawImage(src, 0, 0, 96, th);
    el.shotThumbs.hidden = false; el.shotThumbs.append(c);
  }

  function showReview() {
    el.rErr.hidden = true; el.confirm.disabled = el.retake.disabled = false;
    el.rFrameWrap.hidden = !el.frameOn.checked; el.rFrame.checked = el.frameOn.checked;
    setI(el.rFilterName, filterById(photoFilter).k);
    removeOn = false;
    const saved = prefs.bg;   // last chosen background (falls back to Original if it no longer exists)
    bgId = saved && saved !== "raw" && [...el.rGallery.children].some((b) => b.dataset.id === saved) ? saved : "raw";
    syncGallery(); ensureFileBg(bgId).then(() => { if (state === "review" && hasCap) refreshReview(); });
    startCutouts();   // kick off in the background so it is usually ready by the time a background is picked
    showScreen("review"); setState("review");
    layoutReview();
    if (ST) { ST.setEnabled(true); ST.load().catch(() => {}); }
    el.confirm.focus({ preventScroll: true });
  }

  function retake() {
    if (state !== "review" || confirming) return;
    freeCapture();
    const c = el.rCanvas; c.width = c.height = 0;
    showScreen("live"); setState("live");
    el.shutter.disabled = !el.camErr.hidden;
    el.shutter.focus({ preventScroll: true });
  }

  async function exportBlob(scale) {
    const w = Math.max(2, Math.round(scene.W * scale)), h = Math.round(scene.H * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    composeScene(ctx, w / scene.W, true, needCut() && cutAgg() === "ready");
    if (ST) { const r = ST.renderTo(ctx, w, h); if (r && typeof r.then === "function") await r; }   // bake stickers
    const png = effBg().type === "transparent" && !scene.paper;
    const blob = await new Promise((res) => c.toBlob(res, png ? "image/png" : "image/jpeg", 0.9));
    c.width = c.height = 0;           // release backing store immediately (Safari canvas memory cap)
    if (blob && blob.size > MAX_UPLOAD && scale > 0.4) return exportBlob(scale * 0.7);
    return blob;
  }

  async function confirmPhoto() {
    if (state !== "review" || confirming || !hasCap) return;
    confirming = true; el.confirm.disabled = el.retake.disabled = true; el.rErr.hidden = true;
    const id = cutId;
    if (needCut() && cutAgg() === "working") { refreshReview(); await cutPromise; }   // wait for the cut-outs
    if (id !== cutId || !hasCap) { confirming = false; return; }
    if (needCut() && cutAgg() !== "ready") { confirming = false; el.confirm.disabled = el.retake.disabled = false; refreshReview(); return; }
    if (effBg().type === "file") await ensureFileBg(bgId);
    let blob = null;
    try { blob = await exportBlob(1); } catch { blob = null; }
    if (!blob) { confirming = false; el.confirm.disabled = el.retake.disabled = false; el.rErr.hidden = false; return; }
    lastBlob = blob;
    const strip = scene.paper;
    ST?.setEnabled(false);
    freeCapture();
    beginResult(blob, strip); upload(blob);   // upload runs while the photo slides away
    await slideOut();
    confirming = false;
    enterResult();
  }

  // The review photo slides down off-screen, then the result screen takes over (one continuous "print" motion).
  function slideOut() {
    if (REDUCED.matches) return Promise.resolve();
    el.review.classList.add("leaving");
    return sleep(680);
  }

  function beginResult(blob, strip) {
    stopReset(); el.qr.classList.remove("ok", "fail"); setI(el.heading, "res.head.ok");
    el.img.closest(".result-photo").classList.toggle("is-strip", !!strip);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    el.img.removeAttribute("src"); el.img.src = resultUrl;
    el.qr.textContent = ""; el.qr.append(el.qrStatus); setStatus("res.up", true);
    clearI(el.qrHint); el.retry.hidden = true;
  }
  function enterResult() {
    showScreen("result"); setState("result");
    el.review.classList.remove("leaving");
    const c = el.rCanvas; c.width = c.height = 0;   // release the review canvas
  }

  // ---------- upload ----------
  let keyRequired = true;   // server decides (GET /api/config); assume required if unknown
  const configReady = fetch("/api/config", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.keyRequired === false) keyRequired = false; })
    .catch(() => { /* keep required */ })
    .then(() => paintKeyStatus());
  function paintKeyStatus() {
    setI(el.keyStatus, keyRequired ? "drawer.keyReq" : "drawer.keyNot");
    el.resetToken.hidden = !keyRequired;
  }

  function setStatus(key, dots) { setI(el.qrText, key); el.qrDots.hidden = !dots; }
  function getToken() { return store.get(TOKEN_KEY); }

  // opts.operator: opened from the drawer (shows setup jargon); opts.rejected: previous key got a 401
  function askToken({ operator = false, rejected = false } = {}) {
    return new Promise((resolve) => {
      el.tokenInput.value = "";
      el.tokenErr.hidden = !rejected; el.tokenOp.hidden = !operator; el.tokenGuest.hidden = operator;
      const ac = new AbortController();
      const finish = (v) => { ac.abort(); if (el.tokenDialog.open) el.tokenDialog.close(); resolve(v); };
      const o = { signal: ac.signal };
      el.tokenForm.addEventListener("submit", () => {
        const v = el.tokenInput.value.trim(); if (v) store.set(TOKEN_KEY, v); finish(v);
      }, o);
      el.tokenDialog.addEventListener("cancel", (e) => { e.preventDefault(); finish(""); }, o);
      el.tokenCancel.addEventListener("click", () => finish(""), o);
      if (!el.tokenDialog.open) el.tokenDialog.showModal();
    });
  }

  async function upload(blob) {
    if (uploading) return;
    uploading = true; el.retry.hidden = true; stopReset(); el.qr.classList.remove("ok", "fail");
    setI(el.heading, "res.head.ok"); setStatus("res.up", true); clearI(el.qrHint);
    const slow = setTimeout(() => { if (uploading) setStatus("res.slow", true); }, 6000);
    try {
      await configReady;
      let token = "";
      if (keyRequired) { token = getToken() || (await askToken()); if (!token) throw new Error("unauthorized"); }
      for (let attempt = 0; attempt < UPLOAD_TRIES; attempt++) {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000);
        try {
          const headers = { "Content-Type": blob.type };
          if (keyRequired) headers.Authorization = `Bearer ${token}`;
          const res = await fetch("/api/upload", { method: "POST", body: blob, signal: ctl.signal, credentials: "omit", cache: "no-store", headers });
          clearTimeout(to);
          if (res.status === 401) {
            if (!keyRequired) throw new Error("unauthorized");
            store.del(TOKEN_KEY); token = await askToken({ rejected: true }); if (!token) throw new Error("unauthorized"); continue;
          }
          if (res.status === 429 || res.status >= 500) { if (attempt < UPLOAD_TRIES - 1) await sleep(1000 * 2 ** attempt); continue; }
          if (!res.ok) throw new Error(`upload failed (${res.status})`);
          const data = await res.json();
          return renderQr(data.downloadUrl, data.id);
        } catch (e) {
          clearTimeout(to);
          if (e.message?.startsWith("upload failed") || e.message === "unauthorized") throw e;
          if (attempt < UPLOAD_TRIES - 1) await sleep(1000 * 2 ** attempt);   // network error / timeout → retry
        }
      }
      throw new Error("network");
    } catch (e) {
      setStatus("res.fail", false);
      el.qr.classList.remove("fail"); void el.qr.offsetWidth; el.qr.classList.add("fail");
      setI(el.qrHint, e.message === "unauthorized" ? "res.hint.unauth" : "res.hint.fail");
      el.retry.hidden = false; setI(el.heading, "res.head.fail");
      uploading = false; if (qrWait !== "none") startReset(FAIL_RESET_MS);   // photo is safe on screen; free the kiosk for the next guest
    } finally { clearTimeout(slow); uploading = false; }
  }

  // Operator-set address that phones can reach (localhost on a phone is the phone itself).
  function qrBaseUrl() {
    const v = String(prefs.qrBase || "").trim().replace(/\/+$/, "");
    return /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(v) ? v : "";
  }
  const isLocalHost = (h) => /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i.test(h);
  function renderQr(link, id) {
    let href = "";
    const base = qrBaseUrl();
    if (base && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || "")) {
      href = `${base}/p/${id}?download`;
    } else {
      // Otherwise only ever encode a link to our own origin.
      let u; try { u = new URL(link, location.origin); } catch { u = null; }
      if (!u || u.origin !== location.origin) { setStatus("res.invalid", false); return; }
      href = u.href;
    }
    let host = ""; try { host = new URL(href).hostname; } catch { /* ignore */ }
    el.qrWarn.hidden = !isLocalHost(host);
    const qr = window.qrcode(0, "M");   // type 0 = auto-size
    qr.addData(href); qr.make();
    el.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });   // SVG string from vendored lib, data is our own URL
    const svg = el.qr.querySelector("svg");
    if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("data-i18n-aria", "aria.qr"); applyI(svg); }
    const badge = document.createElement("span"); badge.className = "hop"; badge.setAttribute("aria-hidden", "true");
    badge.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    el.qr.append(badge); el.qr.classList.add("ok");
    setI(el.qrHint, "res.hint.ok");
    startReset();
  }

  // ---------- auto-reset (result screen) ----------
  let resetTotal = QR_WAIT_MS, resetTimer = 0, resetRemain = QR_WAIT_MS, resetLast = 0;
  const RING_LEN = 2 * Math.PI * 15;
  setI(el.resetText, "res.reset", { s: el.againSec });
  setI(el.idleText, "idle", { s: el.idleSec });
  function paintReset() {
    const sec = Math.max(0, Math.ceil(resetRemain / 1000));
    el.againSec.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const bar = el.resetRing.querySelector(".bar");
    if (bar) bar.style.strokeDashoffset = String(RING_LEN * (1 - resetRemain / resetTotal));
  }
  function startReset(total = QR_WAIT_MS) {
    stopReset();
    if (qrWait === "none") return;   // no time limit: the Next guest button is the only exit
    resetTotal = total; resetRemain = total; resetLast = Date.now(); paintReset(); el.resetNote.hidden = false;
    resetTimer = setInterval(() => {
      const now = Date.now(), dt = now - resetLast; resetLast = now;
      if (uploading || state !== "result") return;   // paused while uploading
      resetRemain -= dt; paintReset();
      if (resetRemain <= 0) { stopReset(); backToLive(); }
    }, 250);
  }
  function stopReset() { clearInterval(resetTimer); resetTimer = 0; el.resetNote.hidden = true; }
  el.result.addEventListener("pointerdown", () => { if (resetTimer) { resetRemain = resetTotal; paintReset(); } }, { passive: true });

  el.retry.addEventListener("click", () => lastBlob && upload(lastBlob));
  el.confirm.addEventListener("click", confirmPhoto);
  el.retake.addEventListener("click", retake);
  el.rFrame.addEventListener("change", () => { if (hasCap) layoutReview(); });
  el.cutToggle.addEventListener("click", () => { if (needCut()) selectBg("raw"); else { removeOn = true; refreshReview(); } });
  el.cutKeep.addEventListener("click", () => selectBg("raw"));

  function backToLive() { location.reload(); }   // hard reset: guarantees no leaked canvases/URLs/streams
  el.again.addEventListener("click", backToLive);

  // ---------- settings wiring ----------
  function syncPrefs() {
    prefs.mode = el.mode.value; prefs.method = el.method.value; prefs.mirror = el.mirror.checked; prefs.frameOn = el.frameOn.checked;
    prefs.frameText = el.frameText.value; prefs.strength = el.strength.value; prefs.soft = el.soft.value; prefs.despill = el.despill.value;
    savePrefs();
  }
  function loadPrefs() {
    el.mode.value = prefs.mode || "test";
    el.method.value = prefs.method === "green" ? "green" : "auto"; syncMethod();
    el.mirror.checked = prefs.mirror ?? el.mode.value === "test";
    el.frameOn.checked = !!prefs.frameOn; el.frameText.value = prefs.frameText || "";
    if (prefs.strength) el.strength.value = prefs.strength;
    if (prefs.soft) el.soft.value = prefs.soft;
    if (prefs.despill) el.despill.value = prefs.despill;
    paintSliders();
    el.qrWaitSel.value = qrWait; applyScale(prefs.scale);
    el.boothMode.value = ["single", "strip"].includes(prefs.booth) ? prefs.booth : "guests";
    el.framing.value = framingMode();
    if (prefs.ar) el.preview.parentElement.style.setProperty("--ar", String(prefs.ar));
    el.showPrint.value = prefs.print === false ? "off" : "on"; el.printBtn.hidden = prefs.print === false;
    el.showSettings.value = prefs.showSettings === false ? "off" : "on"; applySettingsBtn();
    el.qrBase.value = prefs.qrBase || "";
    el.shotsSel.value = String(shotsN()); el.layoutSel.value = prefs.layout === "grid" ? "grid" : "vertical"; syncStripOptions(); syncModeUI();
  }
  function applyScale(v) {
    v = Math.min(3, Math.max(1, Math.round((+v || 1) * 10) / 10));
    document.documentElement.style.setProperty("--ui-scale", String(v));
    el.scale.value = String(v); el.scaleVal.textContent = `${v.toFixed(1)}×`;
    return v;
  }
  el.scale.addEventListener("input", () => { prefs.scale = applyScale(el.scale.value); savePrefs(); });
  el.scaleReset.addEventListener("click", () => { prefs.scale = applyScale(1); savePrefs(); });
  el.qrWaitSel.addEventListener("change", () => { qrWait = el.qrWaitSel.value === "none" ? "none" : "3min"; prefs.qrWait = qrWait; savePrefs(); });
  function syncStripOptions() {
    const gridOpt = el.layoutSel.querySelector('option[value="grid"]');
    gridOpt.disabled = shotsN() !== 4;
    if (gridOpt.disabled && prefs.layout === "grid") { prefs.layout = "vertical"; el.layoutSel.value = "vertical"; }
  }
  function syncModeUI() {
    el.modeToggle.hidden = (prefs.booth || "guests") !== "guests";
    const m = curMode();
    el.modeToggle.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  }
  el.modeToggle.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", (e) => {
    prefs.pick = b.dataset.mode; savePrefs(); syncModeUI(); if (e.detail > 0) b.blur();
  }));
  function applySettingsBtn() {
    el.adminOpen.hidden = prefs.showSettings === false && new URLSearchParams(location.search).get("admin") !== "1";
  }
  el.showSettings.addEventListener("change", () => { prefs.showSettings = el.showSettings.value !== "off"; savePrefs(); applySettingsBtn(); });
  el.qrBase.addEventListener("input", () => { prefs.qrBase = el.qrBase.value.trim(); savePrefs(); });
  el.showPrint.addEventListener("change", () => { prefs.print = el.showPrint.value !== "off"; el.printBtn.hidden = !prefs.print; savePrefs(); });
  el.printBtn.addEventListener("click", () => { resetRemain = resetTotal; window.print(); });
  el.framing.addEventListener("change", () => { prefs.framing = el.framing.value; savePrefs(); startCamera(el.camera.value || null); });
  el.boothMode.addEventListener("change", () => { prefs.booth = el.boothMode.value; savePrefs(); syncModeUI(); });
  el.shotsSel.addEventListener("change", () => { prefs.shots = +el.shotsSel.value; syncStripOptions(); savePrefs(); });
  el.layoutSel.addEventListener("change", () => { prefs.layout = el.layoutSel.value; savePrefs(); });
  const SLIDERS = [[el.strength, "key-strength-val", 50], [el.soft, "key-soft-val", 45], [el.despill, "key-despill-val", 80]];
  function paintSliders() { SLIDERS.forEach(([n, id]) => { $(id).textContent = n.value; }); }
  [el.mirror, el.frameOn, el.frameText, el.strength, el.soft, el.despill].forEach((n) => n.addEventListener("input", syncPrefs));
  SLIDERS.forEach(([n]) => n.addEventListener("input", paintSliders));
  el.keyReset.addEventListener("click", () => {
    SLIDERS.forEach(([n, , d]) => { n.value = String(d); });
    paintSliders(); syncPrefs();
  });
  function syncMethod() { el.tuning.hidden = el.method.value !== "green"; }
  el.method.addEventListener("change", () => { syncMethod(); syncPrefs(); warmSegmenter(); });
  el.mode.addEventListener("change", () => { el.mirror.checked = el.mode.value === "test"; syncPrefs(); startCamera(null); });
  el.camera.addEventListener("change", () => startCamera(el.camera.value));
  el.shutter.addEventListener("click", takePicture);
  el.resetToken.addEventListener("click", () => { store.del(TOKEN_KEY); askToken({ operator: true }); });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => { relock(); if (state === "live") listCameras(el.camera.value).catch(() => {}); });

  // language switch: static + dynamic text re-render via I18N; refresh generated option labels
  window.I18N.onChange(() => { relabelFileThumbs(); ST?.refreshLabels?.(); if (navigator.mediaDevices?.enumerateDevices && state === "live") listCameras(el.camera.value).catch(() => {}); });

  // ---------- operator drawer ----------
  let returnFocus = null, openedAt = 0;
  function openDrawer() {
    if (drawerOpen || state !== "live") return;
    drawerOpen = true; openedAt = Date.now(); returnFocus = document.activeElement;
    el.drawer.inert = false; el.drawer.classList.add("open"); el.scrim.classList.add("open");
    el.live.inert = true;
    bump(); el.adminClose.focus();
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false; setPeek(false);
    el.drawer.classList.remove("open"); el.scrim.classList.remove("open");
    el.drawer.inert = true; el.live.inert = false;
    bump();
    const tg = returnFocus && document.contains(returnFocus) && !returnFocus.disabled ? returnFocus : el.shutter;
    (tg.disabled ? document.body : tg).focus?.();
  }
  function setPeek(on) {
    el.drawer.classList.toggle("peek", on); el.scrim.classList.toggle("peek", on);
    el.adminPeek.setAttribute("aria-pressed", String(on)); setI(el.adminPeek, on ? "drawer.back" : "drawer.peek");
  }
  el.adminPeek.addEventListener("click", () => setPeek(!el.drawer.classList.contains("peek")));
  el.adminClose.addEventListener("click", closeDrawer);
  el.scrim.addEventListener("click", () => { if (Date.now() - openedAt > 600) closeDrawer(); });   // ignore the tap's own trailing click
  el.adminOpen.addEventListener("click", openDrawer);
  if (new URLSearchParams(location.search).get("admin") === "1") el.adminOpen.hidden = false;
  else applySettingsBtn();

  // hidden hotspot: long-press 1.5s or 5 quick taps (pointer events cover touch + mouse + pen)
  (() => {
    let tm = 0, taps = 0, tapTimer = 0;
    const cancel = () => { clearTimeout(tm); tm = 0; };
    el.adminHold.addEventListener("pointerdown", () => {
      cancel(); tm = setTimeout(() => { tm = 0; taps = 0; openDrawer(); }, 1500);
      taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => (taps = 0), 3000);
      if (taps >= 5) { taps = 0; cancel(); openDrawer(); }
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.adminHold.addEventListener(ev, cancel));
    el.adminHold.addEventListener("contextmenu", (e) => e.preventDefault());
  })();

  // ---------- settings drawer: collapsible sections + search ----------
  (function settingsSearch() {
    const input = document.getElementById("set-search"), clearBtn = document.getElementById("set-clear"), none = document.getElementById("set-none");
    const secs = [...el.drawer.querySelectorAll(".set-sec")];
    const SECS_KEY = "photobooth.drawerSections";
    let saved = {}; try { saved = JSON.parse(store.get(SECS_KEY) || "{}") || {}; } catch { saved = {}; }
    secs.forEach((d) => {
      const id = d.dataset.sec;
      if (id in saved) d.open = !!saved[id];
      d.addEventListener("toggle", () => { if (input.value.trim()) return; saved[id] = d.open; store.set(SECS_KEY, JSON.stringify(saved)); });
    });
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    // searchable text = what is on screen + the label in BOTH languages + hand-written keywords
    const textOf = (root) => {
      const keys = new Set(); if (root.dataset?.i18n) keys.add(root.dataset.i18n);
      root.querySelectorAll("[data-i18n]").forEach((n) => keys.add(n.dataset.i18n));
      let t = root.innerText + " " + (root.dataset.kw || "");
      for (const k of keys) for (const l of window.I18N.langs()) t += " " + window.I18N.tl(k, l);
      return norm(t);
    };
    function filter() {
      const q = norm(input.value); clearBtn.hidden = !q;
      let any = false;
      secs.forEach((d) => {
        const items = [...d.querySelectorAll(".set-item")].filter((i) => !i.parentElement.closest(".set-item"));
        const titleHit = q && textOf(d.querySelector("summary")).includes(q);
        let hits = 0;
        items.forEach((i) => {
          const ok = !q || titleHit || textOf(i).includes(q);
          i.dataset.sf = ok ? "1" : "0";
          if (ok && !i.hidden) hits++;
        });
        d.dataset.sf = !q || hits ? "1" : "0";
        if (q && hits) { d.open = true; any = true; }
        if (!q) { d.open = saved[d.dataset.sec] != null ? !!saved[d.dataset.sec] : d.dataset.sec === "general"; any = true; }
      });
      none.hidden = !(q && !any);
      if (q && !any) window.I18N.set(none, "drawer.noMatch", { q: input.value.trim().slice(0, 40) });
    }
    input.addEventListener("input", filter);
    clearBtn.addEventListener("click", () => { input.value = ""; filter(); input.focus(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; filter(); } });
    document.getElementById("set-expand").addEventListener("click", () => secs.forEach((d) => { if (d.dataset.sf !== "0") d.open = true; if (!input.value.trim()) saved[d.dataset.sec] = true; store.set(SECS_KEY, JSON.stringify(saved)); }));
    document.getElementById("set-collapse").addEventListener("click", () => secs.forEach((d) => { d.open = false; if (!input.value.trim()) saved[d.dataset.sec] = false; store.set(SECS_KEY, JSON.stringify(saved)); }));
    el.drawer.addEventListener("keydown", (e) => {   // "/" jumps to the search box
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); input.focus(); }
    });
    window.I18N.onChange(() => { if (input.value.trim()) filter(); });   // keep results right after a language switch
  })();

  // ---------- optional stickers (operator can switch groups on/off) ----------
  function buildOptStickers() {
    if (!ST || !ST.listOptionalGroups || !ST.setEnabledGroups) return;
    const groups = ST.listOptionalGroups() || [];
    el.optStk.textContent = ""; el.optStkBox.hidden = !groups.length;
    const on = new Set(Array.isArray(prefs.optStickers) ? prefs.optStickers : []);
    for (const g of groups) {
      const lab = document.createElement("label"), cb = document.createElement("input"), sp = document.createElement("span");
      cb.type = "checkbox"; cb.checked = on.has(g.group);
      sp.textContent = (g.name && (g.name[window.I18N.getLang()] || g.name.en)) || g.group;
      lab.append(cb, sp); el.optStk.append(lab);
      cb.addEventListener("change", () => {
        if (cb.checked) on.add(g.group); else on.delete(g.group);
        prefs.optStickers = [...on]; savePrefs(); ST.setEnabledGroups(prefs.optStickers);
      });
    }
    ST.setEnabledGroups([...on]);
  }

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    const ae = document.activeElement, tag = ae?.tagName || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (e.key === "Escape" && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
    if (e.key === "Escape" && state === "countdown") { e.preventDefault(); cancelCapture(); return; }   // stop the photo-taking phase
    if (e.key === "Enter" && !typing && !drawerOpen && !el.tokenDialog.open) {
      if (state === "result" && tag !== "BUTTON") { e.preventDefault(); backToLive(); return; }          // Next guest
      if (state === "review" && (tag !== "BUTTON" || ae.getAttribute("role") === "radio")) { e.preventDefault(); confirmPhoto(); return; }
    }
    if (e.code === "Space" && state === "live" && !drawerOpen && !typing && tag !== "BUTTON") {
      e.preventDefault(); takePicture();   // also works with wireless clickers
      return;
    }
    if (e.shiftKey && e.key.toLowerCase() === "s" && !drawerOpen && !typing) { e.preventDefault(); openDrawer(); }
  });

  // busy cursor: processing, cutting out, uploading
  setInterval(() => {
    const busy = state === "processing" || uploading || confirming || !el.cutProgress.hidden;
    if (document.body.classList.contains("busy") !== busy) document.body.classList.toggle("busy", busy);
  }, 150);

  // ---------- 3-minute inactivity reset ----------
  let lastActivity = Date.now();
  let idleTimer = 0;
  const bump = () => { lastActivity = Date.now(); if (!el.idleWarn.hidden) el.idleWarn.hidden = true; };
  ["mousemove", "click", "touchstart", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  function idleTick() {
    const idle = Date.now() - lastActivity;
    const busy = state === "countdown" || state === "processing" || uploading || confirming || state === "result" || el.tokenDialog.open || drawerOpen;   // result screen has its own timer (or none)
    if (busy) { lastActivity = Date.now(); }
    else if (idle >= IDLE_MS) { location.reload(); return; }
    else if (idle >= IDLE_MS - IDLE_WARN_MS) { el.idleWarn.hidden = false; el.idleSec.textContent = String(Math.ceil((IDLE_MS - idle) / 1000)); }
    idleTimer = setTimeout(idleTick, 1000);
  }

  // ---------- lifecycle ----------
  let wakeLock = null;
  async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* unsupported / denied */ } }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) keepAwake(); });

  window.addEventListener("pagehide", () => {
    clearTimeout(idleTimer); stopStream(); freeCapture();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    customBg?.img.close(); customFrame?.close(); fileBg?.bmp.close(); try { ST?.destroy(); } catch { /* ignore */ } wakeLock?.release?.().catch?.(() => {});
  });

  // ---------- init ----------
  (function init() {
    // First-run provisioning: https://host/#k=<token> stores the key, then scrubs it from the URL/history.
    const m = location.hash.match(/[#&]k=([^&]+)/);
    if (m) { store.set(TOKEN_KEY, decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname + location.search); }
    loadPrefs(); buildGallery(); buildFilterGallery(); keepAwake(); paintKeyStatus(); loadManifest();
    if (ST) { try { ST.init({ layer: el.stLayer, tray: el.stTray, getLang: () => window.I18N.getLang(), onchange() {} }); ST.load().then(buildOptStickers).catch(() => {}); if (ST.mountManager) ST.mountManager($("stk-manager")); window.I18N.onChange(() => { if (ST.listOptionalGroups) buildOptStickers(); }); } catch { /* stickers unavailable */ } }
    el.stBox.hidden = !ST;
    setI(el.qrText, "res.up"); el.qrDots.hidden = false;
    idleTimer = setTimeout(idleTick, 1000);
    startCamera(null);
  })();
})();
