/* Segmenter: self-hosted person cut-out.
   Engines: 'matting' = MODNet (Apache-2.0) via onnxruntime-web (MIT) if /vendor/modnet/modnet.onnx exists,
            'mediapipe' = MediaPipe selfie segmenter (Apache-2.0). Both are followed by the same edge refinement
            (guided filter on the full-res source, hole fill, 1px shrink, colour decontamination).
   API: Segmenter.load(): Promise<void>; Segmenter.cutout(source, opts?): Promise<HTMLCanvasElement>
        Segmenter.status: 'idle'|'loading'|'ready'|'error'; Segmenter.onstatus = (status, err) => {}
        Segmenter.engine: null|'matting'|'mediapipe' (active engine for opts.engine 'auto') */
(function () {
  'use strict';
  var MP = '/vendor/mediapipe/', ORT = '/vendor/ort/', MODEL = '/vendor/modnet/modnet.onnx';
  var seg = null, mpP = null, personIdx = 0;
  var ort = null, sess = null, matP = null, modelOk = null, loadP = null;

  function setStatus(s, err) {
    S.status = s; S.error = err || null;
    if (typeof S.onstatus === 'function') { try { S.onstatus(s, err); } catch (e) { /* ignore */ } }
  }

  /* ---------------- engines ---------------- */
  function ensureMP() {
    if (mpP) return mpP;
    mpP = (async function () {
      var mod = await import(MP + 'vision_bundle.mjs');
      var fileset = await mod.FilesetResolver.forVisionTasks(MP.replace(/\/$/, ''));
      seg = await mod.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP + 'selfie_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false
      });
      try {
        var labels = seg.getLabels();
        for (var i = 0; i < labels.length; i++) if (/person|selfie|foreground/i.test(labels[i])) personIdx = i;
      } catch (e) { /* ignore */ }
    })().catch(function (e) {
      mpP = null; seg = null;
      var err = new Error('Segmenter failed to load (WASM/model): ' + (e && e.message || e));
      err.cause = e; throw err;
    });
    return mpP;
  }

  function modelAvailable() { // HEAD-check once, cached
    if (modelOk) return modelOk;
    modelOk = fetch(MODEL, { method: 'HEAD' }).then(function (r) {
      var ct = r.headers.get('content-type') || '', len = +(r.headers.get('content-length') || 0);
      return r.ok && !/html/i.test(ct) && (len === 0 || len > 1e6);
    }).catch(function () { return false; });
    return modelOk;
  }

  function ensureMat() {
    if (matP) return matP;
    matP = (async function () {
      if (!(await modelAvailable())) throw new Error('matting model not installed (' + MODEL + ')');
      ort = await import(ORT + 'ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = ORT;
      ort.env.wasm.numThreads = 1;   // no cross-origin isolation => no SharedArrayBuffer threads
      ort.env.wasm.proxy = false;
      sess = await ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })().catch(function (e) {
      matP = null; sess = null;
      var err = new Error('Matting engine failed to load: ' + (e && e.message || e));
      err.cause = e; throw err;
    });
    return matP;
  }

  function load() {
    if (loadP) return loadP;
    setStatus('loading');
    loadP = (async function () {
      var ok = false;
      if (await modelAvailable()) {
        try { await ensureMat(); S.engine = 'matting'; ok = true; }
        catch (e) { console.warn('[Segmenter] matting unavailable, using MediaPipe:', e && e.message); }
      }
      if (!ok) { await ensureMP(); S.engine = 'mediapipe'; }
      setStatus('ready');
    })().catch(function (e) { loadP = null; setStatus('error', e); throw e; });
    return loadP;
  }

  // returns {m: Float32Array person-probability mask, w, h}
  function runMediaPipe(canvas) {
    var result = seg.segment(canvas), masks = null;
    try {
      masks = result.confidenceMasks;
      if (!masks || !masks.length) throw new Error('model returned no confidence mask');
      var mask = masks[Math.min(personIdx, masks.length - 1)], mw = mask.width, mh = mask.height;
      var m = new Float32Array(mask.getAsFloat32Array());
      if (masks.length === 1) { // guard against an inverted single channel
        var i, border = 0, bn = 0, ctr = 0, cn = 0;
        for (i = 0; i < mw; i++) { border += m[i] + m[(mh - 1) * mw + i]; bn += 2; }
        for (var yy = mh >> 2; yy < 3 * mh >> 2; yy++) for (var xx = mw >> 2; xx < 3 * mw >> 2; xx++) { ctr += m[yy * mw + xx]; cn++; }
        if (border / bn > 0.9 && ctr / cn < 0.1) for (i = 0; i < m.length; i++) m[i] = 1 - m[i];
      }
      return { m: m, w: mw, h: mh };
    } finally {
      if (masks) masks.forEach(function (mm) { try { mm.close(); } catch (e) { /* ignore */ } });
      try { if (result.close) result.close(); } catch (e) { /* ignore */ }
    }
  }

  async function runMatting(canvas, W, H, size) {
    var s = size / Math.max(W, H);
    var w = Math.max(32, Math.round(W * s / 32) * 32), h = Math.max(32, Math.round(H * s / 32) * 32);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(canvas, 0, 0, w, h);
    var px = cx.getImageData(0, 0, w, h).data, n = w * h, f = new Float32Array(3 * n), i;
    for (i = 0; i < n; i++) {
      f[i] = (px[4 * i] - 127.5) / 127.5; f[n + i] = (px[4 * i + 1] - 127.5) / 127.5; f[2 * n + i] = (px[4 * i + 2] - 127.5) / 127.5;
    }
    c.width = c.height = 0;
    var feeds = {}, input = new ort.Tensor('float32', f, [1, 3, h, w]);
    feeds[sess.inputNames[0]] = input;
    var out = await sess.run(feeds), t = out[sess.outputNames[0]];
    try {
      var m = new Float32Array(t.data); // copy
      return { m: m, w: w, h: h };
    } finally {
      try { t.dispose(); } catch (e) { /* ignore */ }
      try { input.dispose(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- mask clean-up (mask resolution) ---------------- */
  // keep person blobs >= minFrac of the largest; fill enclosed background holes < holeFrac of the image;
  // force the deep interior opaque (kills mosaic noise inside the body).
  function cleanMask(m, w, h, minFrac, holeFrac, soft) {
    var n = w * h, lab = new Int32Array(n), stack = new Int32Array(n), sizes = [0], cur = 0, i, k, sp, sz, x;
    var T = soft ? 0.5 : 0.5;
    for (i = 0; i < n; i++) {
      if (m[i] <= T || lab[i]) continue;
      cur++; sp = 0; sz = 0; stack[sp++] = i; lab[i] = cur;
      while (sp) {
        k = stack[--sp]; sz++; x = k % w;
        if (x > 0 && m[k - 1] > T && !lab[k - 1]) { lab[k - 1] = cur; stack[sp++] = k - 1; }
        if (x < w - 1 && m[k + 1] > T && !lab[k + 1]) { lab[k + 1] = cur; stack[sp++] = k + 1; }
        if (k >= w && m[k - w] > T && !lab[k - w]) { lab[k - w] = cur; stack[sp++] = k - w; }
        if (k < n - w && m[k + w] > T && !lab[k + w]) { lab[k + w] = cur; stack[sp++] = k + w; }
      }
      sizes.push(sz);
    }
    if (!cur) return;
    var max = 0; for (i = 1; i <= cur; i++) if (sizes[i] > max) max = sizes[i];
    var bin = new Uint8Array(n);
    for (i = 0; i < n; i++) if (lab[i] && sizes[lab[i]] >= max * minFrac) bin[i] = 1;
    // drop small blobs (dilate kept by 2 cells first so their soft fringe is not cut)
    var d = bin.slice(), d2 = new Uint8Array(n), pass;
    for (pass = 0; pass < 2; pass++) {
      var src = pass ? d2 : d, dst = pass ? d : d2;
      for (i = 0; i < n; i++) {
        x = i % w; var v = src[i];
        if (!v && ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (i >= w && src[i - w]) || (i < n - w && src[i + w]))) v = 1;
        dst[i] = v;
      }
    }
    for (i = 0; i < n; i++) if (!d[i]) m[i] = 0;
    // fill holes: flood background from the border over bin==0
    var bg = new Uint8Array(n); sp = 0;
    var push = function (j) { if (!bin[j] && !bg[j]) { bg[j] = 1; stack[sp++] = j; } };
    for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (var y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      k = stack[--sp]; x = k % w;
      if (x > 0) push(k - 1); if (x < w - 1) push(k + 1); if (k >= w) push(k - w); if (k < n - w) push(k + w);
    }
    // enclosed background components (bin==0 && !bg): fill the small ones
    var seen = new Uint8Array(n), comp = new Int32Array(n), cn;
    for (i = 0; i < n; i++) {
      if (bin[i] || bg[i] || seen[i]) continue;
      cn = 0; sp = 0; stack[sp++] = i; seen[i] = 1;
      while (sp) {
        k = stack[--sp]; comp[cn++] = k; x = k % w;
        if (x > 0 && !bin[k - 1] && !bg[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack[sp++] = k - 1; }
        if (x < w - 1 && !bin[k + 1] && !bg[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack[sp++] = k + 1; }
        if (k >= w && !bin[k - w] && !bg[k - w] && !seen[k - w]) { seen[k - w] = 1; stack[sp++] = k - w; }
        if (k < n - w && !bin[k + w] && !bg[k + w] && !seen[k + w]) { seen[k + w] = 1; stack[sp++] = k + w; }
      }
      if (cn < holeFrac * n) for (var q = 0; q < cn; q++) { bin[comp[q]] = 1; if (m[comp[q]] < 0.9) m[comp[q]] = 0.9; }
    }
    // deep interior (erode bin by 2 cells) -> fully opaque
    var e = bin.slice(), e2 = new Uint8Array(n);
    for (pass = 0; pass < 2; pass++) {
      var s2 = pass ? e2 : e, d3 = pass ? e : e2;
      for (i = 0; i < n; i++) {
        x = i % w;
        d3[i] = (s2[i] && x > 0 && x < w - 1 && i >= w && i < n - w && s2[i - 1] && s2[i + 1] && s2[i - w] && s2[i + w]) ? 1 : 0;
      }
    }
    for (i = 0; i < n; i++) if (e[i]) m[i] = 1;
  }

  /* ---------------- filters ---------------- */
  function boxBlur(a, w, h, r, tmp) { // separable, edge-clamped, in place
    var x, y, k, acc, inv = 1 / (2 * r + 1), o;
    for (y = 0; y < h; y++) {
      o = y * w;
      for (acc = 0, k = -r; k <= r; k++) acc += a[o + Math.min(w - 1, Math.max(0, k))];
      for (x = 0; x < w; x++) {
        tmp[o + x] = acc * inv;
        acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < w; x++) {
      for (acc = 0, k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }

  function minFilter3(a, w, h, tmp) { // 3x3 min (separable), in place
    var x, y, o, v;
    for (y = 0; y < h; y++) { o = y * w; for (x = 0; x < w; x++) { v = a[o + x]; if (x > 0 && a[o + x - 1] < v) v = a[o + x - 1]; if (x < w - 1 && a[o + x + 1] < v) v = a[o + x + 1]; tmp[o + x] = v; } }
    for (y = 0; y < h; y++) { o = y * w; for (x = 0; x < w; x++) { v = tmp[o + x]; if (y > 0 && tmp[o - w + x] < v) v = tmp[o - w + x]; if (y < h - 1 && tmp[o + w + x] < v) v = tmp[o + w + x]; a[o + x] = v; } }
  }

  // bilinear sample grid prep: dst size D -> src size N
  function axis(D, N) {
    var i0 = new Int32Array(D), i1 = new Int32Array(D), f = new Float32Array(D);
    for (var i = 0; i < D; i++) {
      var p = Math.min(N - 1, Math.max(0, (i + 0.5) * N / D - 0.5)), a = p | 0;
      i0[i] = a; i1[i] = a + 1 < N ? a + 1 : a; f[i] = p - a;
    }
    return { i0: i0, i1: i1, f: f };
  }
  function resample(src, sw, sh, dw, dh) { // bilinear Float32 -> Float32
    var out = new Float32Array(dw * dh), ax = axis(dw, sw), ay = axis(dh, sh);
    for (var y = 0; y < dh; y++) {
      var r0 = ay.i0[y] * sw, r1 = ay.i1[y] * sw, wy = ay.f[y], o = y * dw;
      for (var x = 0; x < dw; x++) {
        var a = ax.i0[x], b = ax.i1[x], wx = ax.f[x];
        out[o + x] = (src[r0 + a] * (1 - wx) + src[r0 + b] * wx) * (1 - wy) + (src[r1 + a] * (1 - wx) + src[r1 + b] * wx) * wy;
      }
    }
    return out;
  }

  /* ---------------- alpha construction ---------------- */
  function buildAlpha(d, W, H, m, mw, mh, o) {
    var i, x, y;
    var s = Math.max(1, Math.round(W / 640)), lw = Math.ceil(W / s), lh = Math.ceil(H / s), ln = lw * lh;
    var p = resample(m, mw, mh, lw, lh);                   // low-res probability
    var q;
    if (o.refine) {
      // guide = luminance. low-res copy by block averaging
      var G = new Float32Array(ln), cnt = new Float32Array(ln);
      for (y = 0; y < H; y++) {
        var ly = (y / s) | 0, ro = y * W, lo = ly * lw;
        for (x = 0; x < W; x++) {
          var j = 4 * (ro + x), li = lo + ((x / s) | 0);
          G[li] += 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; cnt[li]++;
        }
      }
      for (i = 0; i < ln; i++) G[i] = G[i] / (cnt[i] * 255);
      var r = Math.max(1, Math.round(o.radius / s)), eps = o.eps, tmp = new Float32Array(ln);
      var mI = G.slice(), mP = p.slice(), cII = new Float32Array(ln), cIP = new Float32Array(ln);
      for (i = 0; i < ln; i++) { cII[i] = G[i] * G[i]; cIP[i] = G[i] * p[i]; }
      boxBlur(mI, lw, lh, r, tmp); boxBlur(mP, lw, lh, r, tmp); boxBlur(cII, lw, lh, r, tmp); boxBlur(cIP, lw, lh, r, tmp);
      var A = cII, B = cIP; // reuse buffers
      for (i = 0; i < ln; i++) {
        var vI = cII[i] - mI[i] * mI[i], cov = cIP[i] - mI[i] * mP[i], aa = cov / (vI + eps);
        A[i] = aa; B[i] = mP[i] - aa * mI[i];
      }
      boxBlur(A, lw, lh, r, tmp); boxBlur(B, lw, lh, r, tmp);
      var axx = axis(W, lw), ayy = axis(H, lh);
      q = new Float32Array(W * H);
      for (y = 0; y < H; y++) {
        var a0 = ayy.i0[y] * lw, a1 = ayy.i1[y] * lw, wy = ayy.f[y], oo = y * W;
        for (x = 0; x < W; x++) {
          var xa = axx.i0[x], xb = axx.i1[x], wx = axx.f[x];
          var Av = (A[a0 + xa] * (1 - wx) + A[a0 + xb] * wx) * (1 - wy) + (A[a1 + xa] * (1 - wx) + A[a1 + xb] * wx) * wy;
          var Bv = (B[a0 + xa] * (1 - wx) + B[a0 + xb] * wx) * (1 - wy) + (B[a1 + xa] * (1 - wx) + B[a1 + xb] * wx) * wy;
          var jj = 4 * (oo + x), I = (0.299 * d[jj] + 0.587 * d[jj + 1] + 0.114 * d[jj + 2]) / 255;
          q[oo + x] = Av * I + Bv;
        }
      }
    } else {
      q = resample(m, mw, mh, W, H);
    }
    // smoothstep
    var inv = 1 / (o.high - o.low), n = W * H;
    for (i = 0; i < n; i++) {
      var t = (q[i] - o.low) * inv; t = t < 0 ? 0 : t > 1 ? 1 : t; q[i] = t * t * (3 - 2 * t);
    }
    var tmpF = null;
    if (o.refine && o.shrink > 0) { tmpF = new Float32Array(n); for (i = 0; i < o.shrink; i++) minFilter3(q, W, H, tmpF); }
    if (o.feather > 0) boxBlur(q, W, H, o.feather, tmpF || new Float32Array(n));
    return q;
  }

  // replace RGB of semi-transparent pixels with nearby opaque foreground colour
  function decontaminate(d, a, W, H, rad) {
    var s = Math.max(1, Math.round(W / 640)), lw = Math.ceil(W / s), lh = Math.ceil(H / s), ln = lw * lh;
    var wR = new Float32Array(ln), cR = new Float32Array(ln), cG = new Float32Array(ln), cB = new Float32Array(ln);
    var x, y, i, any = false;
    for (y = 0; y < H; y++) {
      var lo = ((y / s) | 0) * lw, ro = y * W;
      for (x = 0; x < W; x++) {
        var k = ro + x;
        if (a[k] > 0.95) {
          var li = lo + ((x / s) | 0), j = 4 * k;
          wR[li] += 1; cR[li] += d[j]; cG[li] += d[j + 1]; cB[li] += d[j + 2];
        } else if (a[k] > 0) any = true;
      }
    }
    if (!any) return;
    var tmp = new Float32Array(ln), r = Math.max(1, Math.round(rad / s));
    boxBlur(wR, lw, lh, r, tmp); boxBlur(cR, lw, lh, r, tmp); boxBlur(cG, lw, lh, r, tmp); boxBlur(cB, lw, lh, r, tmp);
    for (y = 0; y < H; y++) {
      var fy = Math.min(lh - 1, Math.max(0, (y + 0.5) / s - 0.5)), y0 = fy | 0, y1 = Math.min(lh - 1, y0 + 1), wy = fy - y0;
      for (x = 0; x < W; x++) {
        var kk = y * W + x, av = a[kk];
        if (av <= 0 || av >= 0.97) continue;
        var fx = Math.min(lw - 1, Math.max(0, (x + 0.5) / s - 0.5)), x0 = fx | 0, x1 = Math.min(lw - 1, x0 + 1), wx = fx - x0;
        var i00 = y0 * lw + x0, i01 = y0 * lw + x1, i10 = y1 * lw + x0, i11 = y1 * lw + x1;
        var w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
        var ws = wR[i00] * w00 + wR[i01] * w01 + wR[i10] * w10 + wR[i11] * w11;
        if (ws < 0.02) continue;
        var t = (1 - av) * 2; if (t > 1) t = 1;
        var jx = 4 * kk, ir = 1 / ws;
        var fr = (cR[i00] * w00 + cR[i01] * w01 + cR[i10] * w10 + cR[i11] * w11) * ir;
        var fg = (cG[i00] * w00 + cG[i01] * w01 + cG[i10] * w10 + cG[i11] * w11) * ir;
        var fb = (cB[i00] * w00 + cB[i01] * w01 + cB[i10] * w10 + cB[i11] * w11) * ir;
        d[jx] = d[jx] + (fr - d[jx]) * t; d[jx + 1] = d[jx + 1] + (fg - d[jx + 1]) * t; d[jx + 2] = d[jx + 2] + (fb - d[jx + 2]) * t;
      }
    }
  }

  /* ---------------- public cutout ---------------- */
  async function cutout(source, opts) {
    opts = opts || {};
    var eng = opts.engine || 'auto';
    if (eng !== 'auto' && eng !== 'mediapipe' && eng !== 'matting') throw new Error('Segmenter.cutout: unknown engine ' + eng);
    await load();
    if (eng === 'matting') await ensureMat();
    if (eng === 'mediapipe') await ensureMP();
    if (eng === 'auto') eng = S.engine;

    var W = source.videoWidth || source.naturalWidth || source.width;
    var H = source.videoHeight || source.naturalHeight || source.height;
    if (!W || !H) throw new Error('Segmenter.cutout: source has no size');
    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, W, H);

    var r;
    if (eng === 'matting') {
      try { r = await runMatting(out, W, H, opts.matteSize || 512); }
      catch (e) {
        if (opts.engine === 'matting') throw e;
        console.warn('[Segmenter] matting failed, falling back to MediaPipe:', e && e.message);
        S.engine = 'mediapipe'; eng = 'mediapipe'; await ensureMP();
      }
    }
    if (eng === 'mediapipe') r = runMediaPipe(out);

    var isMat = eng === 'matting';
    var o = {
      low: opts.low != null ? opts.low : (isMat ? 0.3 : 0.35),
      high: opts.high != null ? opts.high : (isMat ? 0.7 : 0.75),
      feather: opts.feather != null ? opts.feather : 1,
      refine: opts.refine !== false,
      radius: opts.radius != null ? opts.radius : Math.max(4, Math.round(W / 110)),
      eps: opts.eps != null ? opts.eps : 0.002,
      shrink: opts.shrink != null ? opts.shrink : 1,
      decontaminate: opts.decontaminate !== false
    };
    if (opts.despeckle !== false && o.refine) cleanMask(r.m, r.w, r.h, opts.despeckleFrac != null ? opts.despeckleFrac : 0.04, opts.holeFrac != null ? opts.holeFrac : 0.01, isMat);
    else if (opts.despeckle !== false) cleanMask(r.m, r.w, r.h, 0.04, 0, isMat);

    var img = ctx.getImageData(0, 0, W, H), d = img.data;
    var a = buildAlpha(d, W, H, r.m, r.w, r.h, o);
    if (o.refine && o.decontaminate) decontaminate(d, a, W, H, opts.decontRadius || 10);
    for (var p = 0, qq = 3, n = W * H; p < n; p++, qq += 4) d[qq] = (a[p] * 255 + 0.5) | 0;
    ctx.putImageData(img, 0, 0);
    return out;
  }

  var S = window.Segmenter = { status: 'idle', error: null, engine: null, onstatus: null, load: load, cutout: cutout };
})();
