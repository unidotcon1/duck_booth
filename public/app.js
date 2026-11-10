// photo buth — browser app. No framework, no inline script (CSP: script-src 'self').
(() => {
  "use strict";

  // ---------- config ----------
  const IDLE_MS = 3 * 60 * 1000;
  const IDLE_WARN_MS = 20 * 1000;
  const PREVIEW_W = 640;            // keying runs at this width for speed
  const CAPTURE_MAX_W = 1920;       // full-res capture cap
  const MAX_UPLOAD = 5 * 1024 * 1024;
  const COUNTDOWN_SEC = 3;
  const TOKEN_KEY = "photobuth.kioskToken";
  const PREFS_KEY = "photobuth.prefs";

  const $ = (id) => document.getElementById(id);
  const el = {
    live: $("screen-live"), result: $("screen-result"), preview: $("preview"),
    shutter: $("shutter"), countdown: $("countdown"), flash: $("flash"), camErr: $("camera-error"),
    mode: $("mode"), camera: $("camera"), gallery: $("bg-gallery"), bgFile: $("bg-file"),
    strength: $("key-strength"), soft: $("key-soft"), despill: $("key-despill"),
    frameOn: $("frame-on"), frameText: $("frame-text"), frameFile: $("frame-file"), mirror: $("mirror"),
    resetToken: $("reset-token"),
    img: $("result-img"), qr: $("qr"), qrStatus: $("qr-status"), qrHint: $("qr-hint"),
    retry: $("retry"), again: $("again"),
    idleWarn: $("idle-warning"), idleSec: $("idle-sec"),
    cdNum: $("cd-num"), cdSub: $("cd-sub"),
    resetNote: $("reset-note"), resetRing: $("reset-ring"), againSec: $("again-sec"),
    drawer: $("admin-drawer"), scrim: $("admin-scrim"), adminClose: $("admin-close"),
    adminHold: $("admin-hold"), adminOpen: $("admin-open"),
    tokenDialog: $("token-dialog"), tokenForm: $("token-form"), tokenInput: $("token-input"),
  };

  // ---------- safe storage ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const prefs = (() => { try { return JSON.parse(store.get(PREFS_KEY) || "{}"); } catch { return {}; } })();
  const savePrefs = () => store.set(PREFS_KEY, JSON.stringify(prefs));

  // ---------- state ----------
  let state = "live"; // live | countdown | processing | result
  let stream = null;
  let video = null;
  let rafId = 0;
  let lastFrame = 0;
  let bgId = prefs.bg || "gradient-sunset";
  let customBg = null;      // { img: ImageBitmap }
  let customFrame = null;   // ImageBitmap
  let resultUrl = null;     // object URL for result <img>
  let lastBlob = null;
  let uploading = false;
  const setState = (s) => { state = s; document.body.dataset.state = s; };

  // work canvases (reused → no per-frame allocation)
  const work = document.createElement("canvas");
  const workCtx = work.getContext("2d", { willReadFrequently: true });
  const pctx = el.preview.getContext("2d");

  // ---------- backgrounds ----------
  const BACKGROUNDS = [
    { id: "raw", short: "Plain", label: "No keying", type: "raw" },
    { id: "transparent", short: "Clear", label: "Transparent (PNG)", type: "transparent" },
    { id: "gradient-sunset", short: "Sunset", label: "Sunset", type: "gradient", stops: ["#ff7e5f", "#feb47b", "#7f53ac"] },
    { id: "gradient-ocean", short: "Ocean", label: "Ocean", type: "gradient", stops: ["#00c6ff", "#0072ff", "#0b0b3b"] },
    { id: "gradient-neon", short: "Neon", label: "Neon", type: "gradient", stops: ["#f72585", "#7209b7", "#3a0ca3", "#4cc9f0"] },
    { id: "solid-dark", short: "Studio", label: "Studio dark", type: "solid", color: "#15151f" },
    { id: "solid-white", short: "White", label: "White", type: "solid", color: "#ffffff" },
  ];

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
    } else if (bg.type === "image" && customBg) {
      const { img } = customBg;
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
    return BACKGROUNDS.find((b) => b.id === bgId) || BACKGROUNDS[2];
  }

  function makeThumb(id, label, short) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.setAttribute("role", "radio"); btn.title = label;
    btn.setAttribute("aria-label", label); btn.dataset.id = id;
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const chk = document.createElement("span"); chk.className = "chk"; chk.setAttribute("aria-hidden", "true"); chk.textContent = "✓";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.setAttribute("aria-hidden", "true"); lbl.textContent = short;
    btn.append(c, chk, lbl);
    btn.addEventListener("click", () => selectBg(id));
    return btn;
  }

  function buildGallery() {
    el.gallery.textContent = "";
    for (const bg of BACKGROUNDS) {
      const btn = makeThumb(bg.id, bg.label, bg.short || bg.label);
      const c = btn.firstChild;
      drawBackground(c.getContext("2d"), 64, 64, bg, false);
      if (bg.type === "raw") { const x = c.getContext("2d"); x.fillStyle = "#fff"; x.font = "28px sans-serif"; x.textAlign = "center"; x.fillText("🎥", 32, 42); }
      el.gallery.append(btn);
    }
    syncGallery();
  }
  // roving tabindex: only the checked radio is in the tab order
  function syncGallery() {
    const items = [...el.gallery.children];
    const any = items.some((b) => b.dataset.id === bgId);
    items.forEach((b, i) => {
      const on = b.dataset.id === bgId;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on || (!any && i === 0) ? 0 : -1;
    });
  }
  function selectBg(id) { bgId = id; prefs.bg = id; savePrefs(); syncGallery(); }

  el.gallery.addEventListener("keydown", (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const items = [...el.gallery.children];
    let i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === "Home") i = 0; else if (e.key === "End") i = items.length - 1;
    else if (keys[e.key]) i = (i + keys[e.key] + items.length) % items.length;
    else return;
    e.preventDefault();
    selectBg(items[i].dataset.id); items[i].focus();
    items[i].scrollIntoView({ block: "nearest", inline: "center" });
  });

  el.bgFile.addEventListener("change", async () => {
    const f = el.bgFile.files?.[0]; el.bgFile.value = "";
    if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024) return;
    try {
      const bmp = await createImageBitmap(f);
      customBg?.img.close();         // free GPU/CPU memory of the previous one
      customBg = { img: bmp };
      let btn = el.gallery.querySelector('[data-id="custom"]');
      if (!btn) { btn = makeThumb("custom", "Custom background", "Mine"); el.gallery.append(btn); }
      btn.firstChild.getContext("2d").drawImage(bmp, 0, 0, 64, 64);
      selectBg("custom");
    } catch { /* unreadable image → ignore */ }
  });

  // ---------- frame ----------
  el.frameFile.addEventListener("change", async () => {
    const f = el.frameFile.files?.[0]; el.frameFile.value = "";
    if (!f || f.type !== "image/png" || f.size > 10 * 1024 * 1024) return;
    try { customFrame?.close(); customFrame = await createImageBitmap(f); el.frameOn.checked = true; syncPrefs(); } catch { /* ignore */ }
  });

  function drawFrame(ctx, w, h) {
    if (!el.frameOn.checked) return;
    if (customFrame) { ctx.drawImage(customFrame, 0, 0, w, h); return; }
    const b = Math.round(Math.min(w, h) * 0.035);
    ctx.save();
    ctx.lineWidth = b; ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(b / 2, b / 2, w - b, h - b);
    const text = el.frameText.value.trim();
    if (text) {
      const fs = Math.round(h * 0.055);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
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
      let t = (dom - lo) / span;
      if (t >= 1) { d[i + 3] = 0; continue; }
      if (t > 0) { d[i + 3] = (255 * (1 - t * t * (3 - 2 * t))) | 0; }
      d[i + 1] = g - dom * sp;                      // despill: pull green toward max(r,b)
    }
  }

  // Render keyed subject of the current video frame into `target` canvas.
  function renderFrame(ctx, w, h, { forExport }) {
    const bg = currentBg();
    const mirror = el.mirror.checked;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return false;

    if (bg.type === "raw") {
      ctx.save();
      if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      const sw = forExport ? w : Math.min(PREVIEW_W, w), sh = Math.round(sw * h / w);
      if (work.width !== sw || work.height !== sh) { work.width = sw; work.height = sh; }
      workCtx.save();
      workCtx.clearRect(0, 0, sw, sh);
      if (mirror) { workCtx.translate(sw, 0); workCtx.scale(-1, 1); }
      workCtx.drawImage(video, 0, 0, sw, sh);
      workCtx.restore();
      const data = workCtx.getImageData(0, 0, sw, sh);
      chromaKey(data, +el.strength.value, +el.soft.value, +el.despill.value);
      workCtx.putImageData(data, 0, 0);
      drawBackground(ctx, w, h, bg, forExport);
      ctx.drawImage(work, 0, 0, w, h);
    }
    drawFrame(ctx, w, h);
    return true;
  }

  // ---------- camera ----------
  function showCamError(msg) { el.camErr.textContent = msg; el.camErr.hidden = !msg; el.shutter.disabled = !!msg; }

  function constraintsFor(deviceId) {
    const prod = el.mode.value === "prod";
    return {
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
        width: { ideal: prod ? 1920 : 1280 }, height: { ideal: prod ? 1080 : 720 },
        frameRate: { ideal: 30 },
      },
    };
  }

  function stopStream() {
    cancelAnimationFrame(rafId); rafId = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (video) { video.srcObject = null; video.remove(); video = null; }
  }

  async function listCameras(selectedId) {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    el.camera.textContent = "";
    devices.forEach((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId; o.textContent = d.label || `Camera ${i + 1}`;
      el.camera.append(o);
    });
    if (selectedId && devices.some((d) => d.deviceId === selectedId)) el.camera.value = selectedId;
    return devices;
  }

  async function startCamera(deviceId) {
    stopStream();
    showCamError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      return showCamError("Camera API unavailable. Open this page over HTTPS (or localhost).");
    }
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

      video = document.createElement("video");
      video.className = "offscreen"; video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
      // Must stay in the DOM (iOS Safari pauses detached / display:none video).
      Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
      document.body.append(video);
      video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener("ended", () => showCamError("Camera disconnected. Reconnect it and press any key."));
      await video.play();
      loop();
    } catch (e) {
      const map = {
        NotAllowedError: "Camera permission denied. Allow camera access in the browser and reload.",
        NotFoundError: "No camera found. Connect a webcam or the Nikon virtual-webcam utility.",
        NotReadableError: "Camera is busy (used by another app?). Close it and reload.",
      };
      showCamError(map[e.name] || `Camera error: ${e.message || e.name}`);
    }
  }

  function loop(ts = 0) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden || state === "result" || state === "processing" || !video) return;
    if (ts - lastFrame < 33) return;   // ~30 fps cap
    lastFrame = ts;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const pw = Math.min(vw, 960), ph = Math.round(pw * vh / vw);
    if (el.preview.width !== pw || el.preview.height !== ph) { el.preview.width = pw; el.preview.height = ph; }
    renderFrame(pctx, pw, ph, { forExport: false });
  }

  // ---------- capture ----------
  const COUNT_SUBS = ["Big grin…", "Chin up…", "Get cozy…"];   // indexed by n-1
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function takePicture() {
    if (state !== "live" || !video || !video.videoWidth) return;
    setState("countdown"); el.shutter.disabled = true;
    for (let n = COUNTDOWN_SEC; n > 0; n--) {
      el.countdown.hidden = false;
      el.cdNum.textContent = String(n); el.cdSub.textContent = COUNT_SUBS[n - 1] || "";
      el.cdNum.classList.remove("tick"); void el.cdNum.offsetWidth; el.cdNum.classList.add("tick");   // retrigger pop
      await sleep(1000);
    }
    el.flash.textContent = "Smile!"; el.flash.hidden = false;
    setTimeout(() => { el.flash.hidden = true; el.flash.textContent = ""; }, 400);
    el.cdNum.textContent = ""; el.cdNum.classList.remove("tick"); el.cdSub.textContent = "Developing…";
    setState("processing");

    const blob = await renderToBlob(1);
    el.countdown.hidden = true;
    if (!blob) { setState("live"); el.shutter.disabled = false; return showCamError("Could not create the photo. Try again."); }
    lastBlob = blob;
    showResult(blob);
    upload(blob);
  }

  async function renderToBlob(scale) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const w = Math.round(Math.min(vw, CAPTURE_MAX_W) * scale), h = Math.round(w * vh / vw);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!renderFrame(ctx, w, h, { forExport: true })) return null;
    const png = currentBg().type === "transparent";
    const blob = await new Promise((res) => c.toBlob(res, png ? "image/png" : "image/jpeg", 0.9));
    c.width = c.height = 0;           // release backing store immediately (Safari canvas memory cap)
    if (blob && blob.size > MAX_UPLOAD && scale > 0.4) return renderToBlob(scale * 0.7);
    return blob;
  }

  function showResult(blob) {
    setState("result");
    stopReset(); el.qr.classList.remove("ok", "fail");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    el.img.src = resultUrl;
    el.qr.textContent = ""; el.qr.append(el.qrStatus); setStatus("Waddling your photo to the cloud…", true);
    el.qrHint.textContent = ""; el.retry.hidden = true;
    el.live.hidden = true; el.result.hidden = false;
  }

  // ---------- upload ----------
  function setStatus(text, dots) {
    el.qrStatus.textContent = text;
    if (dots) {
      const d = document.createElement("span"); d.className = "dots"; d.setAttribute("aria-hidden", "true");
      d.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
      el.qrStatus.append(d);
    }
  }
  function getToken() { return store.get(TOKEN_KEY); }

  function askToken() {
    return new Promise((resolve) => {
      el.tokenInput.value = "";
      el.tokenForm.addEventListener("submit", () => {
        const v = el.tokenInput.value.trim(); if (v) store.set(TOKEN_KEY, v); resolve(v);
      }, { once: true });
      el.tokenDialog.addEventListener("cancel", () => resolve(""), { once: true });
      if (!el.tokenDialog.open) el.tokenDialog.showModal();
    });
  }

  async function upload(blob) {
    if (uploading) return;
    uploading = true; el.retry.hidden = true; stopReset(); el.qr.classList.remove("ok", "fail");
    setStatus("Waddling your photo to the cloud…", true); el.qrHint.textContent = "";
    try {
      let token = getToken() || (await askToken());
      for (let attempt = 0; attempt < 4; attempt++) {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
        try {
          const res = await fetch("/api/upload", {
            method: "POST", body: blob, signal: ctl.signal, credentials: "omit", cache: "no-store",
            headers: { "Content-Type": blob.type, Authorization: `Bearer ${token}` },
          });
          clearTimeout(to);
          if (res.status === 401) { store.del(TOKEN_KEY); token = await askToken(); if (!token) throw new Error("unauthorized"); continue; }
          if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
          if (!res.ok) throw new Error(`upload failed (${res.status})`);
          const data = await res.json();
          return renderQr(data.downloadUrl);
        } catch (e) {
          clearTimeout(to);
          if (e.message?.startsWith("upload failed") || e.message === "unauthorized") throw e;
          await sleep(1000 * 2 ** attempt);   // network error / timeout → retry
        }
      }
      throw new Error("network");
    } catch (e) {
      setStatus("Quack! Upload hiccup", false);
      el.qr.classList.remove("fail"); void el.qr.offsetWidth; el.qr.classList.add("fail");   // retrigger shake
      el.qrHint.textContent = e.message === "unauthorized" ? "The duck needs the kiosk key. Ask a host." : "Your photo is safe right here. Check the Wi-Fi and give it another waddle.";
      el.retry.hidden = false;
    } finally { uploading = false; }
  }

  function renderQr(link) {
    // Only ever encode a link to our own origin.
    let u; try { u = new URL(link, location.origin); } catch { u = null; }
    if (!u || u.origin !== location.origin) { el.qrStatus.textContent = "Invalid link"; return; }
    const qr = window.qrcode(0, "M");   // type 0 = auto-size
    qr.addData(u.href); qr.make();
    el.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });   // SVG string from vendored lib, data is our own URL
    const svg = el.qr.querySelector("svg");
    if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "QR code to download your photo"); }
    const hop = document.createElement("span"); hop.className = "hop"; hop.setAttribute("aria-hidden", "true"); hop.textContent = "🦆";
    el.qr.append(hop); el.qr.classList.add("ok");
    el.qrHint.textContent = "Fresh out of the pond. Point your phone camera at the code.";
    startReset();
  }

  // ---------- auto-reset (result screen) ----------
  const RESET_MS = 45 * 1000;
  let resetTimer = 0, resetRemain = RESET_MS, resetLast = 0;
  const RING_LEN = 2 * Math.PI * 15;
  function paintReset() {
    el.againSec.textContent = String(Math.max(0, Math.ceil(resetRemain / 1000)));
    const bar = el.resetRing.querySelector(".bar");
    if (bar) bar.style.strokeDashoffset = String(RING_LEN * (1 - resetRemain / RESET_MS));
  }
  function startReset() {
    stopReset(); resetRemain = RESET_MS; resetLast = Date.now(); paintReset(); el.resetNote.hidden = false;
    resetTimer = setInterval(() => {
      const now = Date.now(), dt = now - resetLast; resetLast = now;
      if (uploading || state !== "result") return;   // paused while uploading / failed
      resetRemain -= dt; paintReset();
      if (resetRemain <= 0) { stopReset(); backToLive(); }
    }, 250);
  }
  function stopReset() { clearInterval(resetTimer); resetTimer = 0; el.resetNote.hidden = true; }
  el.result.addEventListener("pointerdown", () => { if (resetTimer) { resetRemain = RESET_MS; paintReset(); } }, { passive: true });

  el.retry.addEventListener("click", () => lastBlob && upload(lastBlob));

  function backToLive() { location.reload(); }   // hard reset: guarantees no leaked canvases/URLs/streams
  el.again.addEventListener("click", backToLive);

  // ---------- settings wiring ----------
  function syncPrefs() {
    prefs.mode = el.mode.value; prefs.mirror = el.mirror.checked; prefs.frameOn = el.frameOn.checked;
    prefs.frameText = el.frameText.value; prefs.strength = el.strength.value; prefs.soft = el.soft.value; prefs.despill = el.despill.value;
    savePrefs();
  }
  function loadPrefs() {
    el.mode.value = prefs.mode || "test";
    el.mirror.checked = prefs.mirror ?? el.mode.value === "test";
    el.frameOn.checked = !!prefs.frameOn; el.frameText.value = prefs.frameText || "";
    if (prefs.strength) el.strength.value = prefs.strength;
    if (prefs.soft) el.soft.value = prefs.soft;
    if (prefs.despill) el.despill.value = prefs.despill;
  }
  [el.mirror, el.frameOn, el.frameText, el.strength, el.soft, el.despill].forEach((n) => n.addEventListener("input", syncPrefs));
  el.mode.addEventListener("change", () => { el.mirror.checked = el.mode.value === "test"; syncPrefs(); startCamera(null); });
  el.camera.addEventListener("change", () => startCamera(el.camera.value));
  el.shutter.addEventListener("click", takePicture);
  el.resetToken.addEventListener("click", () => { store.del(TOKEN_KEY); askToken(); });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => { if (state === "live") listCameras(el.camera.value).catch(() => {}); });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && state === "live" && !drawerOpen && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName || "")) {
      e.preventDefault(); takePicture();   // also works with wireless clickers
    }
  });

  // ---------- operator drawer ----------
  let drawerOpen = false;
  let returnFocus = null;
  function openDrawer() {
    if (drawerOpen || state !== "live") return;
    drawerOpen = true; returnFocus = document.activeElement;
    el.drawer.inert = false; el.drawer.classList.add("open"); el.scrim.classList.add("open");
    el.live.inert = true;
    bump(); el.adminClose.focus();
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    el.drawer.classList.remove("open"); el.scrim.classList.remove("open");
    el.drawer.inert = true; el.live.inert = false;
    bump();
    const t = returnFocus && document.contains(returnFocus) && !returnFocus.disabled ? returnFocus : el.shutter;
    (t.disabled ? document.body : t).focus?.();
  }
  el.adminClose.addEventListener("click", closeDrawer);
  el.scrim.addEventListener("click", closeDrawer);
  el.adminOpen.addEventListener("click", openDrawer);
  if (new URLSearchParams(location.search).get("admin") === "1") el.adminOpen.hidden = false;

  // hidden hotspot: long-press 1.5s or 5 quick taps
  (() => {
    let t = 0, taps = 0, tapTimer = 0;
    const cancel = () => { clearTimeout(t); t = 0; };
    el.adminHold.addEventListener("pointerdown", () => {
      cancel(); t = setTimeout(() => { t = 0; taps = 0; openDrawer(); }, 1500);
      taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => (taps = 0), 3000);
      if (taps >= 5) { taps = 0; cancel(); openDrawer(); }
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.adminHold.addEventListener(ev, cancel));
    el.adminHold.addEventListener("contextmenu", (e) => e.preventDefault());
  })();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
    if (e.shiftKey && e.key.toLowerCase() === "s" && !drawerOpen && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); openDrawer(); }
  });

  // ---------- 3-minute inactivity reset ----------
  let lastActivity = Date.now();
  let idleTimer = 0;
  const bump = () => { lastActivity = Date.now(); if (!el.idleWarn.hidden) el.idleWarn.hidden = true; };
  ["mousemove", "click", "touchstart", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  function idleTick() {
    const idle = Date.now() - lastActivity;
    const busy = state === "countdown" || state === "processing" || uploading || el.tokenDialog.open || drawerOpen;
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
    clearTimeout(idleTimer); stopStream();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    customBg?.img.close(); customFrame?.close(); wakeLock?.release?.().catch?.(() => {});
  });

  // ---------- init ----------
  (function init() {
    // First-run provisioning: https://host/#k=<token> stores the key, then scrubs it from the URL/history.
    const m = location.hash.match(/[#&]k=([^&]+)/);
    if (m) { store.set(TOKEN_KEY, decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname + location.search); }
    loadPrefs(); buildGallery(); keepAwake();
    idleTimer = setTimeout(idleTick, 1000);
    startCamera(null);
  })();
})();
