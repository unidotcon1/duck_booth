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
  const RESET_MS = 45 * 1000, FAIL_RESET_MS = 30 * 1000;
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
    confirm: $("confirm"), cutToggle: $("cut-toggle"), cutProgress: $("cut-progress"), cutErr: $("cut-error"), cutKeep: $("cut-keep"), method: $("cutout-method"), tuning: $("tuning"), retake: $("retake"),
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
  el.againSec = mkB("again-sec", "45"); el.idleSec = mkB("idle-sec", "20");

  // ---------- safe storage ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const prefs = (() => { try { return JSON.parse(store.get(PREFS_KEY) || "{}"); } catch { return {}; } })();
  const savePrefs = () => store.set(PREFS_KEY, JSON.stringify(prefs));

  // ---------- state ----------
  let state = "live"; // live | countdown | processing | review | result
  let stream = null;
  let video = null;
  let rafId = 0;
  let lastFrame = 0;
  let bgId = "raw";          // chosen per photo on the review screen (starts at Original)
  let removeOn = false;     // "Remove background" toggled while Original is selected → transparent preview
  let cutStatus = "idle", cutId = 0, cutPromise = null;   // cut-out cache state for the current capture
  let customBg = null;      // { img: ImageBitmap }
  let customFrame = null;   // ImageBitmap
  let resultUrl = null;     // object URL for result <img>
  let lastBlob = null;
  let uploading = false;
  let confirming = false;
  let drawerOpen = false;
  const setState = (s) => { state = s; document.body.dataset.state = s; };
  const showScreen = (which) => { el.live.hidden = which !== "live"; el.review.hidden = which !== "review"; el.result.hidden = which !== "result"; };

  // work canvases (reused → no per-frame allocation)
  const work = document.createElement("canvas");
  const workCtx = work.getContext("2d", { willReadFrequently: true });
  const pctx = el.preview.getContext("2d");
  // captured photo (full-res): raw frame + keyed cut-out. Freed on retake / confirm.
  const capRaw = document.createElement("canvas");
  const capCut = document.createElement("canvas");
  let hasCap = false, capW = 0, capH = 0;
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

  function makeThumb(id, k) {
    const btn = document.createElement("button");
    btn.type = "button"; btn.setAttribute("role", "radio"); btn.dataset.id = id;
    btn.setAttribute("data-i18n-aria", k); btn.setAttribute("data-i18n-title", k);
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const chk = document.createElement("span"); chk.className = "chk"; chk.setAttribute("aria-hidden", "true"); chk.textContent = "✓";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.setAttribute("aria-hidden", "true"); lbl.dataset.i18n = k;
    btn.append(c, chk, lbl);
    btn.addEventListener("click", (e) => { selectBg(id); if (e.detail > 0) btn.blur(); });   // pointer click: let Space reach the shutter
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
  }
  function selectBg(id) {
    bgId = id; removeOn = false; syncGallery();
    if (state === "review" && hasCap) refreshReview();   // instant re-composite at preview size
  }

  GALLERIES.forEach((g) => g.addEventListener("keydown", (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const items = [...g.children];
    let i = items.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === "Home") i = 0; else if (e.key === "End") i = items.length - 1;
    else if (keys[e.key]) i = (i + keys[e.key] + items.length) % items.length;
    else return;
    e.preventDefault();
    selectBg(items[i].dataset.id); items[i].focus();
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

  // Live preview: render keyed subject of the current video frame.
  function renderFrame(ctx, w, h) {
    // Auto mode: plain camera. Green-screen mode: keyed live preview over a fixed backdrop.
    const bg = el.method.value === "green" ? BACKGROUNDS[2] : BACKGROUNDS[0];
    const mirror = el.mirror.checked;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return false;

    if (bg.type === "raw") {
      ctx.save();
      if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, w, h);
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
      drawBackground(ctx, w, h, bg, false);
      ctx.drawImage(work, 0, 0, w, h);
    }
    drawFrame(ctx, w, h, el.frameOn.checked);
    return true;
  }

  // ---------- camera ----------
  function showCamError(key, vars) {
    if (key) { setI(el.camErr, key, vars); el.camErr.hidden = false; el.shutter.disabled = true; }
    else { clearI(el.camErr); el.camErr.hidden = true; el.shutter.disabled = false; }
  }

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

      video = document.createElement("video");
      video.className = "offscreen"; video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
      // Must stay in the DOM (iOS Safari pauses detached / display:none video).
      Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
      document.body.append(video);
      video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener("ended", () => showCamError("err.camLost"));
      await video.play();
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

  function freeCapture() {
    cutId++; cutStatus = "idle"; cutPromise = null;   // discard any in-flight cut-out
    capRaw.width = capRaw.height = 0; capCut.width = capCut.height = 0;   // release backing stores
    hasCap = false;
  }

  // Grab the current frame at full resolution (mirrored if on). The cut-out is produced separately.
  function captureFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return false;
    capW = Math.min(vw, CAPTURE_MAX_W); capH = Math.round(capW * vh / vw);
    capRaw.width = capW; capRaw.height = capH;
    const rc = capRaw.getContext("2d");
    rc.save();
    if (el.mirror.checked) { rc.translate(capW, 0); rc.scale(-1, 1); }
    rc.drawImage(video, 0, 0, capW, capH);
    rc.restore();
    hasCap = true;
    return true;
  }

  function warmSegmenter() {
    if (el.method.value === "auto" && window.Segmenter) window.Segmenter.load().catch(() => { /* surfaced when a cut-out is requested */ });
  }

  // Start (or restart) producing the cut-out for the current capture. Cached in capCut once ready.
  function startCutout() {
    const id = cutId;
    if (el.method.value === "green") {   // chroma key: synchronous
      capCut.width = capW; capCut.height = capH;
      const cc = capCut.getContext("2d", { willReadFrequently: true });
      cc.drawImage(capRaw, 0, 0);
      const data = cc.getImageData(0, 0, capW, capH);
      chromaKey(data, +el.strength.value, +el.soft.value, +el.despill.value);
      cc.putImageData(data, 0, 0);
      cutStatus = "ready"; return;
    }
    if (!window.Segmenter) { cutStatus = "error"; return; }
    cutStatus = "working";
    cutPromise = Promise.resolve()
      .then(() => window.Segmenter.cutout(capRaw))
      .then((c) => {
        if (id !== cutId || !hasCap) { if (c && c.width) c.width = c.height = 0; return; }   // retaken meanwhile
        capCut.width = capW; capCut.height = capH;
        const x = capCut.getContext("2d"); x.clearRect(0, 0, capW, capH); x.drawImage(c, 0, 0, capW, capH);
        c.width = c.height = 0;
        cutStatus = "ready";
      })
      .catch(() => { if (id === cutId) cutStatus = "error"; })
      .then(() => { if (id === cutId && state === "review") refreshReview(); });
  }

  function compose(ctx, w, h, forExport, withFrame) {
    const bg = effBg();
    if (bg.type === "raw") ctx.drawImage(capRaw, 0, 0, w, h);
    else { drawBackground(ctx, w, h, bg, forExport); ctx.drawImage(capCut, 0, 0, w, h); }
    drawFrame(ctx, w, h, withFrame);
  }

  // Repaint the review canvas + overlays for the current background / cut-out status.
  function refreshReview() {
    if (!hasCap) return;
    const need = needCut();
    const cw = el.rCanvas.width, ch = el.rCanvas.height;
    if (need && cutStatus === "ready") compose(rctx, cw, ch, false, el.rFrame.checked);
    else { rctx.drawImage(capRaw, 0, 0, cw, ch); drawFrame(rctx, cw, ch, el.rFrame.checked); }   // original while waiting / on error
    el.cutProgress.hidden = !(need && cutStatus === "working");
    el.cutErr.hidden = !(need && cutStatus === "error");
    el.cutToggle.setAttribute("aria-pressed", String(need));
    el.print.classList.toggle("is-cut", need && cutStatus === "ready");
  }

  async function takePicture() {
    if (state !== "live" || !video || !video.videoWidth) return;
    setState("countdown"); el.shutter.disabled = true;
    for (let n = COUNTDOWN_SEC; n > 0; n--) {
      el.countdown.hidden = false;
      el.cdNum.textContent = String(n); setI(el.cdSub, `cd.${n}`);
      el.cdNum.classList.remove("tick"); void el.cdNum.offsetWidth; el.cdNum.classList.add("tick");   // retrigger pop
      await sleep(1000);
    }
    el.flash.hidden = false; setTimeout(() => { el.flash.hidden = true; }, 400);
    el.cdNum.textContent = ""; el.cdNum.classList.remove("tick"); setI(el.cdSub, "processing");
    setState("processing");
    await sleep(30);   // let the "Processing…" frame paint before the heavy work

    let ok = false;
    try { ok = !!video && captureFrame(); } catch { ok = false; }
    el.countdown.hidden = true;
    if (!ok) {
      freeCapture(); setState("live"); el.shutter.disabled = false;
      return showCamError("err.create");
    }
    showReview();
  }

  function showReview() {
    const rw = Math.min(capW, REVIEW_MAX_W), rh = Math.round(rw * capH / capW);
    el.rCanvas.width = rw; el.rCanvas.height = rh; el.rCanvas.style.setProperty("--ar", String(rw / rh));
    const frameShown = el.frameOn.checked;
    el.rFrame.checked = frameShown; el.rFrameWrap.hidden = !frameShown;
    el.rErr.hidden = true; el.confirm.disabled = el.retake.disabled = false;
    bgId = "raw"; removeOn = false; syncGallery();
    startCutout();   // kick off in the background so it is usually ready by the time a background is picked
    refreshReview();
    showScreen("review"); setState("review");
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
    const w = Math.max(2, Math.round(capW * scale)), h = Math.round(w * capH / capW);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    compose(c.getContext("2d"), w, h, true, el.rFrame.checked);
    const png = effBg().type === "transparent";
    const blob = await new Promise((res) => c.toBlob(res, png ? "image/png" : "image/jpeg", 0.9));
    c.width = c.height = 0;           // release backing store immediately (Safari canvas memory cap)
    if (blob && blob.size > MAX_UPLOAD && scale > 0.4) return exportBlob(scale * 0.7);
    return blob;
  }

  async function confirmPhoto() {
    if (state !== "review" || confirming || !hasCap) return;
    confirming = true; el.confirm.disabled = el.retake.disabled = true; el.rErr.hidden = true;
    const id = cutId;
    if (needCut() && cutStatus === "working") { refreshReview(); await cutPromise; }   // wait for the cut-out
    if (id !== cutId || !hasCap) { confirming = false; return; }
    if (needCut() && cutStatus !== "ready") { confirming = false; el.confirm.disabled = el.retake.disabled = false; refreshReview(); return; }
    let blob = null;
    try { blob = await exportBlob(1); } catch { blob = null; }
    confirming = false;
    if (!blob) { el.confirm.disabled = el.retake.disabled = false; el.rErr.hidden = false; return; }
    lastBlob = blob;
    freeCapture();
    showResult(blob);
    upload(blob);
  }

  function showResult(blob) {
    setState("result");
    stopReset(); el.qr.classList.remove("ok", "fail"); setI(el.heading, "res.head.ok");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    el.img.removeAttribute("src"); void el.img.offsetWidth; el.img.src = resultUrl;   // restart the slide-out
    el.qr.textContent = ""; el.qr.append(el.qrStatus); setStatus("res.up", true);
    clearI(el.qrHint); el.retry.hidden = true;
    showScreen("result");
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
          return renderQr(data.downloadUrl);
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
      uploading = false; startReset(FAIL_RESET_MS);   // photo is safe on screen; free the kiosk for the next guest
    } finally { clearTimeout(slow); uploading = false; }
  }

  function renderQr(link) {
    // Only ever encode a link to our own origin.
    let u; try { u = new URL(link, location.origin); } catch { u = null; }
    if (!u || u.origin !== location.origin) { setStatus("res.invalid", false); return; }
    const qr = window.qrcode(0, "M");   // type 0 = auto-size
    qr.addData(u.href); qr.make();
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
  let resetTotal = RESET_MS, resetTimer = 0, resetRemain = RESET_MS, resetLast = 0;
  const RING_LEN = 2 * Math.PI * 15;
  setI(el.resetText, "res.reset", { s: el.againSec });
  setI(el.idleText, "idle", { s: el.idleSec });
  function paintReset() {
    el.againSec.textContent = String(Math.max(0, Math.ceil(resetRemain / 1000)));
    const bar = el.resetRing.querySelector(".bar");
    if (bar) bar.style.strokeDashoffset = String(RING_LEN * (1 - resetRemain / resetTotal));
  }
  function startReset(total = RESET_MS) {
    stopReset(); resetTotal = total; resetRemain = total; resetLast = Date.now(); paintReset(); el.resetNote.hidden = false;
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
  el.rFrame.addEventListener("change", () => { if (hasCap) refreshReview(); });
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
  }
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
  navigator.mediaDevices?.addEventListener?.("devicechange", () => { if (state === "live") listCameras(el.camera.value).catch(() => {}); });

  // language switch: static + dynamic text re-render via I18N; refresh generated option labels
  window.I18N.onChange(() => { if (navigator.mediaDevices?.enumerateDevices && state === "live") listCameras(el.camera.value).catch(() => {}); });

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

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    const ae = document.activeElement, tag = ae?.tagName || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (e.key === "Escape" && drawerOpen) { e.preventDefault(); closeDrawer(); return; }
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

  // ---------- 3-minute inactivity reset ----------
  let lastActivity = Date.now();
  let idleTimer = 0;
  const bump = () => { lastActivity = Date.now(); if (!el.idleWarn.hidden) el.idleWarn.hidden = true; };
  ["mousemove", "click", "touchstart", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

  function idleTick() {
    const idle = Date.now() - lastActivity;
    const busy = state === "countdown" || state === "processing" || uploading || confirming || el.tokenDialog.open || drawerOpen;
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
    customBg?.img.close(); customFrame?.close(); wakeLock?.release?.().catch?.(() => {});
  });

  // ---------- init ----------
  (function init() {
    // First-run provisioning: https://host/#k=<token> stores the key, then scrubs it from the URL/history.
    const m = location.hash.match(/[#&]k=([^&]+)/);
    if (m) { store.set(TOKEN_KEY, decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname + location.search); }
    loadPrefs(); buildGallery(); keepAwake(); paintKeyStatus();
    setI(el.qrText, "res.up"); el.qrDots.hidden = false;
    idleTimer = setTimeout(idleTick, 1000);
    startCamera(null);
  })();
})();
