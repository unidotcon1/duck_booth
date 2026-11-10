/* Segmenter: self-hosted MediaPipe Tasks Vision (Apache-2.0) selfie segmentation -> person cut-out.
   API: Segmenter.load(): Promise<void>; Segmenter.cutout(source, opts?): Promise<HTMLCanvasElement>
        Segmenter.status: 'idle'|'loading'|'ready'|'error'; Segmenter.onstatus = (status, err?) => {} */
(function () {
  'use strict';
  var BASE = '/vendor/mediapipe/';
  var seg = null, loadP = null, personIdx = 0;

  function setStatus(s, err) {
    S.status = s;
    S.error = err || null;
    if (typeof S.onstatus === 'function') { try { S.onstatus(s, err); } catch (e) { /* ignore */ } }
  }

  function load() {
    if (loadP) return loadP;
    setStatus('loading');
    loadP = (async function () {
      var mod = await import(BASE + 'vision_bundle.mjs');
      var fileset = await mod.FilesetResolver.forVisionTasks(BASE.replace(/\/$/, ''));
      seg = await mod.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: BASE + 'selfie_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false
      });
      try { // person channel: label "selfie"/"person" if model names it, else assume single-channel person prob
        var labels = seg.getLabels();
        for (var i = 0; i < labels.length; i++) if (/person|selfie|foreground/i.test(labels[i])) personIdx = i;
      } catch (e) { /* ignore */ }
      setStatus('ready');
    })().catch(function (e) {
      loadP = null; seg = null;
      var err = new Error('Segmenter failed to load (WASM/model): ' + (e && e.message || e));
      err.cause = e;
      setStatus('error', err);
      throw err;
    });
    return loadP;
  }

  // keep only connected components (4-neighbour, p>0.5) with area >= minFrac of the largest; zero the rest
  function despeckle(m, w, h, minFrac) {
    var n = w * h, lab = new Int32Array(n), stack = new Int32Array(n), sizes = [0], cur = 0, i, k;
    for (i = 0; i < n; i++) {
      if (m[i] <= 0.5 || lab[i]) continue;
      cur++; var sp = 0, sz = 0; stack[sp++] = i; lab[i] = cur;
      while (sp) {
        k = stack[--sp]; sz++;
        var x = k % w;
        if (x > 0 && m[k - 1] > 0.5 && !lab[k - 1]) { lab[k - 1] = cur; stack[sp++] = k - 1; }
        if (x < w - 1 && m[k + 1] > 0.5 && !lab[k + 1]) { lab[k + 1] = cur; stack[sp++] = k + 1; }
        if (k >= w && m[k - w] > 0.5 && !lab[k - w]) { lab[k - w] = cur; stack[sp++] = k - w; }
        if (k < n - w && m[k + w] > 0.5 && !lab[k + w]) { lab[k + w] = cur; stack[sp++] = k + w; }
      }
      sizes.push(sz);
    }
    if (!cur) return;
    var max = 0; for (i = 1; i <= cur; i++) if (sizes[i] > max) max = sizes[i];
    var thr = max * minFrac;
    // dilate kept regions by 2 cells so soft edge pixels near them survive
    var keep = new Uint8Array(n);
    for (i = 0; i < n; i++) if (lab[i] && sizes[lab[i]] >= thr) keep[i] = 1;
    var keep2 = new Uint8Array(n);
    for (var pass = 0; pass < 2; pass++) {
      var src = pass ? keep2 : keep, dst = pass ? keep : keep2;
      for (i = 0; i < n; i++) {
        var x2 = i % w, v = src[i];
        if (!v && ((x2 > 0 && src[i - 1]) || (x2 < w - 1 && src[i + 1]) || (i >= w && src[i - w]) || (i < n - w && src[i + w]))) v = 1;
        dst[i] = v;
      }
    }
    for (i = 0; i < n; i++) if (!keep[i]) m[i] = 0;
  }

  function boxBlur(a, w, h, r, tmp) { // separable box blur on Uint8/Float arrays, edge-clamped
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

  async function cutout(source, opts) {
    opts = opts || {};
    var low = opts.low != null ? opts.low : 0.35, high = opts.high != null ? opts.high : 0.75;
    var feather = opts.feather != null ? opts.feather : 1;          // box-blur radius in px (0 = off)
    var despk = opts.despeckle !== false;
    await load();
    var W = source.videoWidth || source.naturalWidth || source.width;
    var H = source.videoHeight || source.naturalHeight || source.height;
    if (!W || !H) throw new Error('Segmenter.cutout: source has no size');

    var out = document.createElement('canvas'); out.width = W; out.height = H;
    var ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, W, H);

    var result = seg.segment(out), mask = null, masks = null;
    var img, a;
    try {
      masks = result.confidenceMasks;
      if (!masks || !masks.length) throw new Error('model returned no confidence mask');
      mask = masks[Math.min(personIdx, masks.length - 1)];
      var mw = mask.width, mh = mask.height;
      var m = new Float32Array(mask.getAsFloat32Array()); // copy before close()
      // single-channel selfie model: output is person probability. Guard against inverted channel.
      if (masks.length === 1) {
        var c = 0, b = 0, i;
        for (i = 0; i < m.length; i++) { b += m[i]; }
        // heuristic only if the whole frame is almost entirely "person" and the border is higher than the centre
        var border = 0, bn = 0;
        for (i = 0; i < mw; i++) { border += m[i] + m[(mh - 1) * mw + i]; bn += 2; }
        var ctr = 0, cn = 0;
        for (var yy = mh >> 2; yy < 3 * mh >> 2; yy++) for (var xx = mw >> 2; xx < 3 * mw >> 2; xx++) { ctr += m[yy * mw + xx]; cn++; }
        if (border / bn > 0.9 && ctr / cn < 0.1) for (i = 0; i < m.length; i++) m[i] = 1 - m[i];
      }
      if (despk) despeckle(m, mw, mh, opts.despeckleFrac != null ? opts.despeckleFrac : 0.04);

      // bilinear upsample + smoothstep -> alpha (Float32, full res)
      a = new Float32Array(W * H);
      var xs = new Int32Array(W), xf = new Float32Array(W), x, y;
      for (x = 0; x < W; x++) {
        var fx = Math.min(mw - 1, Math.max(0, (x + 0.5) * mw / W - 0.5));
        var x0 = fx | 0; xs[x] = x0; xf[x] = fx - x0;
      }
      var inv = 1 / (high - low);
      for (y = 0; y < H; y++) {
        var fy = Math.min(mh - 1, Math.max(0, (y + 0.5) * mh / H - 0.5));
        var y0 = fy | 0, y1 = Math.min(mh - 1, y0 + 1), wy = fy - y0;
        var r0 = y0 * mw, r1 = y1 * mw, o = y * W;
        for (x = 0; x < W; x++) {
          var x0b = xs[x], x1 = x0b + 1 < mw ? x0b + 1 : x0b, wx = xf[x];
          var top = m[r0 + x0b] * (1 - wx) + m[r0 + x1] * wx;
          var bot = m[r1 + x0b] * (1 - wx) + m[r1 + x1] * wx;
          var t = ((top * (1 - wy) + bot * wy) - low) * inv;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          a[o + x] = t * t * (3 - 2 * t);
        }
      }
      if (feather > 0) boxBlur(a, W, H, feather, new Float32Array(W * H));

      img = ctx.getImageData(0, 0, W, H);
      var d = img.data;
      for (var p = 0, q = 3, n = W * H; p < n; p++, q += 4) d[q] = (a[p] * d[q] + 0.5) | 0;
      ctx.putImageData(img, 0, 0);
    } finally {
      try { if (result && result.close) result.close(); } catch (e) { /* ignore */ }
      if (masks) masks.forEach(function (mm) { try { mm.close(); } catch (e) { /* ignore */ } });
      img = null; a = null;
    }
    return out;
  }

  var S = window.Segmenter = { status: 'idle', error: null, onstatus: null, load: load, cutout: cutout };
})();
