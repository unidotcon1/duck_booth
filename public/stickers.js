/* Photo Booth stickers: drag-and-drop sticker palette + placed-sticker editor.
 * Classic script, no dependencies. API: window.Stickers
 *   init({layer, tray, getLang, onchange}), load(), clear(), count(), destroy(),
 *   refreshLabels(), renderTo(ctx, w, h), setEnabled(bool)
 * State is normalised (centre x,y in 0..1 of the photo box, w = fraction of photo width,
 * r = radians) so renderTo() matches the preview at any export resolution. */
(function () {
  'use strict';

  var MAX_ITEMS = 30, MIN_W = 0.05, MAX_W = 0.8, DEF_SIDE = 0.22, FULL_PX = 1536, THUMB_PX = 96;
  var BASE = '/stickers/';
  var STR = {
    en: {
      tray: 'Stickers', sticker: 'sticker', del: 'Delete sticker', flip: 'Flip sticker', all: 'All', cats: 'Sticker categories',
      hint: 'Arrow keys move, plus and minus resize, left and right square brackets rotate, F flips, Delete removes, Escape deselects.',
      added: function (n, c) { return 'Added ' + n + '. ' + c + (c === 1 ? ' sticker' : ' stickers') + ' placed.'; },
      removed: function (n, c) { return 'Removed ' + n + '. ' + c + (c === 1 ? ' sticker' : ' stickers') + ' placed.'; },
      limit: 'Sticker limit reached (' + MAX_ITEMS + ').'
    },
    'zh-CN': {
      tray: '贴纸', sticker: '贴纸', del: '删除贴纸', flip: '翻转贴纸', all: '全部', cats: '贴纸分类',
      hint: '方向键移动，加号和减号缩放，左右方括号旋转，F 键翻转，Delete 键删除，Esc 键取消选择。',
      added: function (n, c) { return '已添加' + n + '，共 ' + c + ' 个贴纸。'; },
      removed: function (n, c) { return '已删除' + n + '，共 ' + c + ' 个贴纸。'; },
      limit: '贴纸数量已达上限（' + MAX_ITEMS + '）。'
    }
  };

  var st = null;          // live instance state (null when not initialised)
  var uid = 0;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function lang() {
    var l = '';
    try { l = (st && st.getLang && st.getLang()) || ''; } catch (e) { /* ignore */ }
    return /^zh/i.test(l) ? 'zh-CN' : 'en';
  }
  function T() { return STR[lang()]; }
  function defName(d) { var l = lang(); return (d.name && (d.name[l] || d.name.en)) || d.id; }
  function fire() { if (st && st.onchange) { try { st.onchange(); } catch (e) { /* host error must not break us */ } } }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  /* ---------- sources, thumbnails, full images ---------- */
  function fileUrl(d) { return BASE + d.file.split('/').map(encodeURIComponent).join('/'); }

  // Make sure an SVG has numeric width/height so it has intrinsic size everywhere (canvas, <img>).
  function normSvg(text) {
    var m = /<svg\b[^>]*>/i.exec(text);
    if (!m) return { text: text, w: 512, h: 512 };
    var tag = m[0], num = function (re) { var r = re.exec(tag); return r ? parseFloat(r[1]) : NaN; };
    var w = num(/\swidth\s*=\s*["']\s*([\d.]+)\s*(?:px)?\s*["']/i), h = num(/\sheight\s*=\s*["']\s*([\d.]+)\s*(?:px)?\s*["']/i);
    if (!(w > 0 && h > 0)) {
      var vb = /\sviewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/i.exec(tag);
      if (vb && +vb[1] > 0 && +vb[2] > 0) { var k = 512 / Math.max(+vb[1], +vb[2]); w = +vb[1] * k; h = +vb[2] * k; }
      else { w = 512; h = 512; }
      var nt = tag.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/<svg\b/i, '<svg width="' + w + '" height="' + h + '"');
      text = text.replace(tag, nt);
    }
    return { text: text, w: w, h: h };
  }
  function loadSource(d) {
    return fetch(fileUrl(d)).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.blob();
    }).then(function (blob) {
      if (!/\.svg$/i.test(d.file)) return { blob: blob };
      return blob.text().then(function (t) {
        var n = normSvg(t);
        return { blob: new Blob([n.text], { type: 'image/svg+xml' }), nw: n.w, nh: n.h, svg: true };
      });
    });
  }
  function decode(blob) {
    var url = URL.createObjectURL(blob), img = new Image();
    img.decoding = 'async'; img.src = url;
    return img.decode().then(function () { return { img: img, url: url }; }, function (e) { URL.revokeObjectURL(url); throw e; });
  }
  function makeThumb(d) {
    return loadSource(d).then(function (src) {
      return decode(src.blob).then(function (r) {
        var nw = src.nw || r.img.naturalWidth, nh = src.nh || r.img.naturalHeight;
        if (!(nw > 0 && nh > 0)) { URL.revokeObjectURL(r.url); throw new Error('no size'); }
        var s = THUMB_PX / Math.max(nw, nh), c = el('canvas');
        c.width = Math.max(1, Math.round(nw * s)); c.height = Math.max(1, Math.round(nh * s));
        c.getContext('2d').drawImage(r.img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(r.url);
        d.nw = nw; d.nh = nh; d.ar = nh / nw; d.thumb = c;
      });
    });
  }
  // Full-quality raster (ImageBitmap) + blob URL for the DOM <img>, kept only while stickers use it.
  function ensureFull(d) {
    if (d.full) return d.full;
    d.full = loadSource(d).then(function (src) {
      var url = URL.createObjectURL(src.blob), img = new Image();
      img.decoding = 'async'; img.src = url;
      return img.decode().then(function () {
        var nw = src.nw || img.naturalWidth, nh = src.nh || img.naturalHeight;
        if (!(nw > 0 && nh > 0)) throw new Error('no size');
        var s = src.svg ? FULL_PX / Math.max(nw, nh) : Math.min(1, FULL_PX / Math.max(nw, nh));
        var c = el('canvas'); c.width = Math.max(1, Math.round(nw * s)); c.height = Math.max(1, Math.round(nh * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        d.ar = nh / nw; d.url = url;
        if (window.createImageBitmap) {
          return createImageBitmap(c).then(function (b) { d.bmp = b; }, function () { d.bmp = c; });
        }
        d.bmp = c;
      }).catch(function (e) { URL.revokeObjectURL(url); throw e; });
    }).then(function () { return d; }, function (e) { d.full = null; d.broken = true; throw e; });
    return d.full;
  }
  function releaseDef(d) {
    if (--d.refs > 0) return;
    d.refs = 0;
    if (d.bmp && d.bmp.close) { try { d.bmp.close(); } catch (e) { /* ignore */ } }
    if (d.url) URL.revokeObjectURL(d.url);
    d.bmp = null; d.url = null; d.full = null;
  }

  /* ---------- geometry / layout ---------- */
  function rect() { return st.layer.getBoundingClientRect(); }
  function place(node, it) {
    var LW = st.layer.clientWidth, LH = st.layer.clientHeight;
    if (!LW || !LH) return;
    var w = it.w * LW, h = w * it.def.ar, s = node.style;
    s.width = w + 'px'; s.height = h + 'px';
    s.left = (it.x * LW) + 'px'; s.top = (it.y * LH) + 'px';
    s.transform = 'translate(-50%,-50%) rotate(' + it.r + 'rad)';
  }
  function layout(it) { place(it.el, it); if (it === st.selected) syncChrome(); }
  function layoutAll() { st.items.forEach(function (it) { place(it.el, it); }); syncChrome(); }
  function syncChrome() {
    var it = st.selected, c = st.chrome;
    c.hidden = !it || !st.enabled;
    if (c.hidden) return;
    place(c, it);
    c.style.setProperty('--stk-rot', it.r + 'rad');
  }
  function findItem(node) { for (var i = 0; i < st.items.length; i++) if (st.items[i].el === node) return st.items[i]; return null; }

  /* ---------- selection / add / remove ---------- */
  function select(it, o) {
    o = o || {};
    if (it && o.raise && st.items[st.items.length - 1] !== it) {
      var had = document.activeElement === it.el;
      st.items.splice(st.items.indexOf(it), 1); st.items.push(it);
      st.clip.appendChild(it.el);
      if (had) it.el.focus({ preventScroll: true });
    }
    st.selected = it;
    st.items.forEach(function (x) { x.el.classList.toggle('stk-sel', x === it); x.el.setAttribute('aria-current', x === it ? 'true' : 'false'); });
    if (!it && st.clip.contains(document.activeElement)) document.activeElement.blur();
    syncChrome();
  }
  function itemLabel(it) { return defName(it.def) + (lang() === 'zh-CN' ? '，' : ' ') + T().sticker; }
  function announce(msg) { st.live.textContent = ''; var s = st; setTimeout(function () { if (st === s) s.live.textContent = msg; }, 30); }

  function addSticker(d, nx, ny, o) {
    if (!st || d.broken) return Promise.resolve();
    var inst = st;
    if (inst.items.length >= MAX_ITEMS) { announce(T().limit); return Promise.resolve(); }
    return ensureFull(d).then(function () {
      if (st !== inst) return;
      if (inst.items.length >= MAX_ITEMS) { announce(T().limit); return; }
      d.refs = (d.refs || 0) + 1;
      var node = el('div', 'stk-item stk-new'), img = new Image();
      node.tabIndex = 0; node.setAttribute('role', 'button'); node.setAttribute('aria-describedby', inst.descId);
      img.className = 'stk-img'; img.alt = ''; img.draggable = false; img.src = d.url;
      node.appendChild(img);
      var w = clamp(d.ar <= 1 ? DEF_SIDE : DEF_SIDE / d.ar, MIN_W, MAX_W);
      var it = { def: d, el: node, x: clamp(nx, 0, 1), y: clamp(ny, 0, 1), w: w, r: 0, f: false };
      node.setAttribute('aria-label', itemLabel(it));
      inst.items.push(it); inst.clip.appendChild(node);
      place(node, it);
      node.addEventListener('animationend', function () { node.classList.remove('stk-new'); });
      select(it, {});
      if (o && o.focus) node.focus({ preventScroll: true });
      announce(T().added(defName(d), inst.items.length));
      fire();
    }, function () { /* broken file: drop its tray button silently */ removeBroken(d); });
  }
  function removeBroken(d) {
    if (!st) return;
    var b = st.tray.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(d.id) : d.id) + '"]');
    if (b) b.remove();
  }
  function removeItem(it, o) {
    var i = st.items.indexOf(it); if (i < 0) return;
    st.items.splice(i, 1); it.el.remove();
    var wasSel = st.selected === it; if (wasSel) st.selected = null;
    releaseDef(it.def);
    select(wasSel ? null : st.selected);
    if (o && o.kb) { var nx = st.items[st.items.length - 1]; if (nx) nx.el.focus({ preventScroll: true }); else { var b = st.grid && st.grid.querySelector('.stk-thumb:not([hidden])'); if (b) b.focus({ preventScroll: true }); } }
    if (!(o && o.silent)) { announce(T().removed(defName(it.def), st.items.length)); fire(); }
  }
  function applyFlip(it) { it.el.firstChild.style.transform = it.f ? 'scaleX(-1)' : ''; }
  function flipItem(it) { it.f = !it.f; applyFlip(it); fire(); }
  function nudge(it, dx, dy, ds, dr) {
    it.x = clamp(it.x + dx, 0, 1); it.y = clamp(it.y + dy, 0, 1);
    it.w = clamp(it.w * ds, MIN_W, MAX_W); it.r = wrapAngle(it.r + dr);
    layout(it); fire();
  }

  /* ---------- placed-sticker pointer gestures ---------- */
  function inTray(x, y) {
    var r = st.tray.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function trayHover(on, it) {
    st.tray.classList.toggle('stk-tray-del', on);
    if (it) it.el.classList.toggle('stk-dying', on);
  }
  function startMove(e, it) { st.g = { type: 'move', item: it, id: e.pointerId, lx: e.clientX, ly: e.clientY, changed: false, ex: e.clientX, ey: e.clientY }; }
  function startPinch(it) {
    var ids = Object.keys(st.pts).slice(0, 2), a = st.pts[ids[0]], b = st.pts[ids[1]];
    trayHover(false, it);
    st.g = { type: 'pinch', item: it, ids: ids, changed: st.g ? st.g.changed : false,
      d0: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)), a0: Math.atan2(b.y - a.y, b.x - a.x), w0: it.w, r0: it.r,
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  function startHandle(e, it) {
    var r = rect(), cx = r.left + it.x * r.width, cy = r.top + it.y * r.height;
    var vx = e.clientX - cx, vy = e.clientY - cy;
    st.g = { type: 'handle', item: it, id: e.pointerId, cx: cx, cy: cy, d0: Math.max(8, Math.hypot(vx, vy)), a0: Math.atan2(vy, vx), w0: it.w, r0: it.r, changed: false };
    st.layer.classList.add('stk-busy');
  }
  function onLayerDown(e) {
    if (!st.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var t = e.target, tc = t && t.closest ? t : null;
    if (tc && tc.closest('.stk-del, .stk-flip')) return;
    var isHandle = tc && tc.closest('.stk-handle'), nodeEl = tc && tc.closest('.stk-item'), it = nodeEl && findItem(nodeEl);
    if (st.g && st.g.type === 'move') {
      st.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { st.layer.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      if (Object.keys(st.pts).length >= 2) startPinch(st.g.item);
      e.preventDefault(); return;
    }
    if (st.g) return;
    if (isHandle && st.selected) { startHandle(e, st.selected); }
    else if (it) { select(it, { raise: true }); it.el.focus({ preventScroll: true }); startMove(e, it); }
    else { select(null); return; }
    st.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { st.layer.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    e.preventDefault();
  }
  function onLayerMove(e) {
    var p = st.pts[e.pointerId], g = st.g;
    if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    var it = g.item, r = rect();
    if (!r.width || !r.height) return;
    if (g.type === 'move') {
      if (!g.changed && Math.hypot(e.clientX - g.ex, e.clientY - g.ey) < 2) return;
      it.x = clamp(it.x + (e.clientX - g.lx) / r.width, 0, 1);
      it.y = clamp(it.y + (e.clientY - g.ly) / r.height, 0, 1);
      g.lx = e.clientX; g.ly = e.clientY; g.changed = true;
      trayHover(inTray(e.clientX, e.clientY), it);
    } else if (g.type === 'handle') {
      var vx = e.clientX - g.cx, vy = e.clientY - g.cy;
      it.w = clamp(g.w0 * Math.hypot(vx, vy) / g.d0, MIN_W, MAX_W);
      it.r = wrapAngle(g.r0 + wrapAngle(Math.atan2(vy, vx) - g.a0));
      g.changed = true;
    } else if (g.type === 'pinch') {
      var a = st.pts[g.ids[0]], b = st.pts[g.ids[1]];
      if (!a || !b) return;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      it.w = clamp(g.w0 * Math.hypot(b.x - a.x, b.y - a.y) / g.d0, MIN_W, MAX_W);
      it.r = wrapAngle(g.r0 + wrapAngle(Math.atan2(b.y - a.y, b.x - a.x) - g.a0));
      it.x = clamp(it.x + (mx - g.mx) / r.width, 0, 1); it.y = clamp(it.y + (my - g.my) / r.height, 0, 1);
      g.mx = mx; g.my = my; g.changed = true;
    }
    layout(it);
  }
  function endGesture(cancel) {
    var g = st.g; if (!g) return;
    st.g = null; st.layer.classList.remove('stk-busy');
    trayHover(false, g.item);
    if (g.type === 'move' && !cancel && g.changed && inTray(g.lx, g.ly)) { removeItem(g.item, {}); return; }
    if (g.changed) fire();
  }
  function onLayerUp(e) {
    if (!st.pts[e.pointerId]) return;
    delete st.pts[e.pointerId];
    try { st.layer.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    var g = st.g; if (!g) return;
    var cancel = e.type === 'pointercancel';
    if (g.type === 'pinch') {
      var rest = Object.keys(st.pts);
      if (rest.length === 1) {
        var p = st.pts[rest[0]], ch = g.changed;
        st.g = { type: 'move', item: g.item, id: +rest[0], lx: p.x, ly: p.y, ex: p.x, ey: p.y, changed: ch };
        return;
      }
      if (rest.length === 0) endGesture(cancel);
      return;
    }
    if (g.id === e.pointerId) endGesture(cancel);
  }

  function onKey(e) {
    if (!st.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    var it = e.target.closest && e.target.closest('.stk-item'); it = it && findItem(it);
    if (e.key === 'Escape') { if (st.selected) { select(null); e.preventDefault(); } return; }
    if (!it) return;
    var k = e.key, step = e.shiftKey ? 0.05 : 0.01, rot = (e.shiftKey ? 15 : 5) * Math.PI / 180, sc = e.shiftKey ? 1.2 : 1.08;
    if (k === 'ArrowLeft') nudge(it, -step, 0, 1, 0);
    else if (k === 'ArrowRight') nudge(it, step, 0, 1, 0);
    else if (k === 'ArrowUp') nudge(it, 0, -step, 1, 0);
    else if (k === 'ArrowDown') nudge(it, 0, step, 1, 0);
    else if (k === '+' || k === '=') nudge(it, 0, 0, sc, 0);
    else if (k === '-' || k === '_') nudge(it, 0, 0, 1 / sc, 0);
    else if (k === '[') nudge(it, 0, 0, 1, -rot);
    else if (k === ']') nudge(it, 0, 0, 1, rot);
    else if (k === 'f' || k === 'F') flipItem(it);
    else if (k === 'Delete' || k === 'Backspace') removeItem(it, { kb: true });
    else return;
    e.preventDefault();
  }
  function onFocusIn(e) {
    var n = e.target.closest && e.target.closest('.stk-item'); if (!n) return;
    var it = findItem(n); if (!it) return;
    if (st.selected !== it) select(it, {});
    var kb = false; try { kb = n.matches(':focus-visible'); } catch (x) { /* ignore */ }
    st.chrome.classList.toggle('stk-kb', kb);
  }
  function onFocusOut(e) { if (e.target.closest && e.target.closest('.stk-item')) st.chrome.classList.remove('stk-kb'); }
  function onWheel(e) {
    if (!st.enabled || !e.ctrlKey) return;
    var n = e.target.closest && e.target.closest('.stk-item'), it = n && findItem(n);
    if (!it) return;
    e.preventDefault();
    if (st.selected !== it) select(it, { raise: true });
    nudge(it, 0, 0, Math.exp(-clamp(e.deltaY, -50, 50) * 0.01), 0);
  }

  /* ---------- tray (palette) + drag from tray ---------- */
  function layerHit(x, y) { var r = rect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function startTrayDrag(tp, x, y) {
    if (!tp.def.thumb) return;
    tp.active = true; st.didDrag = true;
    var g = el('canvas', 'stk-ghost'), t = tp.def.thumb, r = rect();
    var side = clamp(r.width * DEF_SIDE, 64, 220), s = side / Math.max(t.width, t.height);
    g.width = t.width; g.height = t.height; g.getContext('2d').drawImage(t, 0, 0);
    g.style.width = (t.width * s) + 'px'; g.style.height = (t.height * s) + 'px';
    g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(g); tp.ghost = g;
    st.tray.classList.add('stk-dragging');
    moveGhost(tp, x, y);
    document.addEventListener('keydown', onDragKey, true);
  }
  function moveGhost(tp, x, y) {
    tp.ghost.style.left = x + 'px'; tp.ghost.style.top = y + 'px';
    var over = layerHit(x, y);
    tp.ghost.classList.toggle('stk-ghost-out', !over);
    st.layer.classList.toggle('stk-drop', over);
  }
  function onDragKey(e) { if (e.key === 'Escape' && st && st.tp) { e.stopPropagation(); endTrayDrag(true); } }
  function endTrayDrag(cancel, x, y) {
    var tp = st.tp; if (!tp) return;
    clearTimeout(tp.timer);
    document.removeEventListener('keydown', onDragKey, true);
    if (tp.ghost) tp.ghost.remove();
    st.tray.classList.remove('stk-dragging'); st.layer.classList.remove('stk-drop');
    try { tp.btn.releasePointerCapture(tp.id); } catch (e) { /* ignore */ }
    st.tp = null;
    if (!cancel && tp.active && layerHit(x, y)) {
      var r = rect();
      addSticker(tp.def, (x - r.left) / r.width, (y - r.top) / r.height, {});
    }
  }
  function onTrayDown(e) {
    var btn = e.target.closest && e.target.closest('.stk-thumb');
    if (!btn || st.tp || !st.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var d = st.defById[btn.getAttribute('data-id')]; if (!d) return;
    var tp = st.tp = { btn: btn, def: d, id: e.pointerId, type: e.pointerType, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false, timer: 0, ghost: null };
    st.didDrag = false;
    try { btn.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    if (e.pointerType === 'touch') tp.timer = setTimeout(function () { if (st && st.tp === tp && !tp.active) startTrayDrag(tp, tp.x, tp.y); }, 220);
  }
  function onTrayMove(e) {
    var tp = st.tp; if (!tp || e.pointerId !== tp.id) return;
    tp.x = e.clientX; tp.y = e.clientY;
    if (tp.active) { moveGhost(tp, e.clientX, e.clientY); return; }
    var dist = Math.hypot(e.clientX - tp.sx, e.clientY - tp.sy);
    if (tp.type === 'touch') { if (dist > 10) { clearTimeout(tp.timer); endTrayDrag(true); } }   // finger is scrolling the tray
    else if (dist > 5) startTrayDrag(tp, e.clientX, e.clientY);
  }
  function onTrayUp(e) {
    var tp = st.tp; if (!tp || e.pointerId !== tp.id) return;
    endTrayDrag(e.type === 'pointercancel', e.clientX, e.clientY);
  }
  function onTrayTouchMove(e) { if (st.tp && st.tp.active && e.cancelable) e.preventDefault(); }
  function onTrayClick(e) {
    var tab = e.target.closest && e.target.closest('.stk-tab');
    if (tab) { setCat(tab.getAttribute('data-cat')); return; }
    var btn = e.target.closest && e.target.closest('.stk-thumb'); if (!btn) return;
    if (st.didDrag) { st.didDrag = false; return; }
    var d = st.defById[btn.getAttribute('data-id')]; if (!d || !st.enabled) return;
    addSticker(d, 0.5 + (Math.random() - 0.5) * 0.12, 0.5 + (Math.random() - 0.5) * 0.12, {});
  }

  function catName(c) { var l = lang(); return (c.name && (c.name[l] || c.name.en)) || c.id; }
  function setCat(id, focus) {
    st.cat = id;
    if (st.cats) st.cats.forEach(function (c) {
      var on = c.id === id; c.btn.setAttribute('aria-selected', on ? 'true' : 'false'); c.btn.tabIndex = on ? 0 : -1; c.btn.classList.toggle('stk-tab-on', on);
      if (on) { if (focus) c.btn.focus({ preventScroll: true }); if (c.btn.scrollIntoView) c.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
    st.defs.forEach(function (d) { if (d.btn) d.btn.hidden = !(id === 'all' || d.category === id); });
    st.grid.scrollTop = 0;
  }
  function onTabKey(e) {
    var t = e.target.closest && e.target.closest('.stk-tab'); if (!t || !st.cats) return;
    var i = st.cats.findIndex(function (c) { return c.btn === t; }), n = st.cats.length, k = e.key;
    if (k === 'ArrowRight') i = (i + 1) % n; else if (k === 'ArrowLeft') i = (i + n - 1) % n; else if (k === 'Home') i = 0; else if (k === 'End') i = n - 1; else return;
    e.preventDefault(); setCat(st.cats[i].id, true);
  }
  function buildTray() {
    st.tray.textContent = '';
    st.tabs = null; st.cat = 'all';
    // categories (only those that have stickers); tabs hidden if fewer than 2
    var cats = [];
    (st.manifestCats || []).forEach(function (c) { if (st.defs.some(function (d) { return d.category === c.id; })) cats.push({ id: c.id, name: c.name }); });
    st.defs.forEach(function (d) { if (!cats.some(function (c) { return c.id === d.category; })) cats.push({ id: d.category, name: { en: d.category } }); });
    if (cats.length > 1) {
      st.cats = [{ id: 'all' }].concat(cats);
      st.tabs = el('div', 'stk-tabs'); st.tabs.setAttribute('role', 'tablist');
      st.cats.forEach(function (c) {
        var t = el('button', 'stk-tab'); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('data-cat', c.id);
        c.btn = t; st.tabs.appendChild(t);
      });
      st.tray.appendChild(st.tabs);
    }
    st.grid = el('div', 'stk-grid'); st.tray.appendChild(st.grid);
    st.defs.forEach(function (d) {
      var b = el('button', 'stk-thumb'); b.type = 'button'; b.setAttribute('data-id', d.id);
      var l = el('span', 'stk-lbl'); b.appendChild(l);
      d.btn = b; d.lbl = l;
      st.grid.appendChild(b);
    });
    setCat('all');
    refreshLabels();
    var queue = st.defs.slice(), active = 0, inst = st;
    (function pump() {
      while (active < 4 && queue.length) (function (d) {
        active++;
        var ready = d.thumb ? Promise.resolve() : makeThumb(d);
        ready.then(function () {
          if (st !== inst) return;
          d.thumb.className = 'stk-thumb-img'; d.thumb.setAttribute('aria-hidden', 'true');
          d.btn.insertBefore(d.thumb, d.btn.firstChild);
        }, function () { d.broken = true; if (d.btn) d.btn.remove(); }).then(function () { active--; pump(); });
      })(queue.shift());
    })();
  }

  /* ---------- public API ---------- */
  function refreshLabels() {
    if (!st) return;
    var s = T();
    st.tray.setAttribute('role', 'group'); st.tray.setAttribute('aria-label', s.tray);
    st.defs.forEach(function (d) {
      var n = defName(d);
      if (d.btn) { d.btn.setAttribute('aria-label', n); d.btn.title = n; }
      if (d.lbl) d.lbl.textContent = n;
    });
    st.items.forEach(function (it) { it.el.setAttribute('aria-label', itemLabel(it)); });
    st.desc.textContent = s.hint;
    st.delBtn.setAttribute('aria-label', s.del); st.delBtn.title = s.del;
    st.flipBtn.setAttribute('aria-label', s.flip); st.flipBtn.title = s.flip;
    if (st.tabs) { st.tabs.setAttribute('aria-label', s.cats); st.cats.forEach(function (c) { c.btn.textContent = c.id === 'all' ? s.all : catName(c); }); }
  }

  function init(o) {
    if (st) destroy();
    o = o || {};
    var layer = o.layer, tray = o.tray;
    if (!layer || !tray) throw new Error('Stickers.init needs {layer, tray}');
    var inst = st = {
      layer: layer, tray: tray, getLang: o.getLang, onchange: o.onchange, items: [], selected: null, enabled: true,
      defs: [], defById: {}, g: null, pts: {}, tp: null, didDrag: false, off: [], descId: 'stk-desc-' + (++uid), ro: null
    };
    var on = function (t, type, fn, opt) { t.addEventListener(type, fn, opt); inst.off.push(function () { t.removeEventListener(type, fn, opt); }); };

    layer.classList.add('stk-layer');
    layer.style.touchAction = 'none';
    tray.classList.add('stk-tray');

    inst.clip = el('div', 'stk-clip');
    inst.chrome = el('div', 'stk-chrome'); inst.chrome.hidden = true;
    inst.chrome.appendChild(el('div', 'stk-outline'));
    ['nw', 'ne', 'se', 'sw'].forEach(function (c) { var h = el('span', 'stk-handle stk-h-' + c); h.setAttribute('aria-hidden', 'true'); inst.chrome.appendChild(h); });
    inst.delBtn = el('button', 'stk-del'); inst.delBtn.type = 'button';
    var svg = document.createElementNS(SVGNS, 'svg'), path = document.createElementNS(SVGNS, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', 'M7 7l10 10M17 7L7 17'); svg.appendChild(path); inst.delBtn.appendChild(svg);
    inst.chrome.appendChild(inst.delBtn);
    inst.flipBtn = el('button', 'stk-flip'); inst.flipBtn.type = 'button';
    var fs = document.createElementNS(SVGNS, 'svg'), fp = document.createElementNS(SVGNS, 'path');
    fs.setAttribute('viewBox', '0 0 24 24'); fs.setAttribute('aria-hidden', 'true');
    fp.setAttribute('d', 'M12 3v18M9 7L3 18h6zM15 7l6 11h-6z'); fs.appendChild(fp); inst.flipBtn.appendChild(fs);
    inst.chrome.appendChild(inst.flipBtn);
    inst.live = el('div', 'stk-sr'); inst.live.setAttribute('role', 'status'); inst.live.setAttribute('aria-live', 'polite');
    inst.desc = el('div', 'stk-sr'); inst.desc.id = inst.descId;
    layer.appendChild(inst.clip); layer.appendChild(inst.chrome); layer.appendChild(inst.live); layer.appendChild(inst.desc);

    on(layer, 'pointerdown', onLayerDown);
    on(layer, 'pointermove', onLayerMove);
    on(layer, 'pointerup', onLayerUp);
    on(layer, 'pointercancel', onLayerUp);
    on(layer, 'contextmenu', function (e) { e.preventDefault(); });
    on(layer, 'keydown', onKey);
    on(layer, 'focusin', onFocusIn);
    on(layer, 'focusout', onFocusOut);
    on(layer, 'wheel', onWheel, { passive: false });
    on(inst.flipBtn, 'click', function () { if (inst.selected) flipItem(inst.selected); });
    on(inst.delBtn, 'click', function () { if (inst.selected) removeItem(inst.selected, {}); });
    on(tray, 'pointerdown', onTrayDown);
    on(tray, 'pointermove', onTrayMove);
    on(tray, 'pointerup', onTrayUp);
    on(tray, 'pointercancel', onTrayUp);
    on(tray, 'touchmove', onTrayTouchMove, { passive: false });
    on(tray, 'click', onTrayClick);
    on(tray, 'keydown', onTabKey);
    on(tray, 'contextmenu', function (e) { if (e.target.closest && e.target.closest('.stk-thumb')) e.preventDefault(); });
    if (window.ResizeObserver) { inst.ro = new ResizeObserver(function () { if (st === inst) layoutAll(); }); inst.ro.observe(layer); }
    else on(window, 'resize', layoutAll);
    refreshLabels();
  }

  function load() {
    if (!st) return Promise.resolve();
    var inst = st;
    return fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (m) {
        if (st !== inst) return;
        var list = m && Array.isArray(m.items) ? m.items : [];
        var old = inst.defById, defs = [], by = {};
        list.forEach(function (x) {
          if (!x || typeof x.id !== 'string' || typeof x.file !== 'string' || by[x.id]) return;
          if (m.includeBuiltins === false && x.builtin) return;
          var d = old[x.id] || { id: x.id, refs: 0 };
          d.file = x.file; d.name = x.name && typeof x.name === 'object' ? x.name : { en: String(x.name || x.id) };
          d.builtin = !!x.builtin; d.broken = false; d.category = typeof x.category === 'string' && x.category ? x.category : (x.builtin ? 'builtin' : 'mine');
          defs.push(d); by[x.id] = d;
        });
        inst.defs = defs; inst.defById = by; inst.manifestCats = m && Array.isArray(m.categories) ? m.categories.filter(function (c) { return c && typeof c.id === 'string'; }) : [];
        buildTray();
      });
  }

  function clear() {
    if (!st) return;
    var had = st.items.length > 0;
    endGesture(true);
    st.items.slice().forEach(function (it) { removeItem(it, { silent: true }); });
    select(null);
    if (had) fire();
  }
  function count() { return st ? st.items.length : 0; }

  function renderTo(ctx, w, h) {
    if (st) {
      st.items.forEach(function (it) {
        var bmp = it.def.bmp; if (!bmp) return;
        var sw = it.w * w, sh = sw * it.def.ar;
        ctx.save();
        ctx.translate(it.x * w, it.y * h); ctx.rotate(it.r); if (it.f) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
      });
    }
    return Promise.resolve();
  }

  function setEnabled(b) {
    if (!st) return;
    st.enabled = !!b;
    st.layer.classList.toggle('stk-off', !st.enabled);
    st.layer.style.pointerEvents = st.enabled ? '' : 'none';
    if (!st.enabled) { endGesture(true); st.pts = {}; if (st.tp) endTrayDrag(true); }
    syncChrome();
  }

  function destroy() {
    if (!st) return;
    var s = st;
    try { endGesture(true); if (s.tp) endTrayDrag(true); } catch (e) { /* ignore */ }
    st = s;
    s.off.forEach(function (f) { f(); });
    if (s.ro) s.ro.disconnect();
    s.items.forEach(function (it) { releaseDef(it.def); });
    s.defs.forEach(function (d) {
      if (d.bmp && d.bmp.close) { try { d.bmp.close(); } catch (e) { /* ignore */ } }
      if (d.url) URL.revokeObjectURL(d.url);
      d.bmp = null; d.url = null; d.full = null; d.refs = 0; d.thumb = null;
    });
    [s.clip, s.chrome, s.live, s.desc].forEach(function (n) { n.remove(); });
    s.layer.classList.remove('stk-layer', 'stk-drop', 'stk-off', 'stk-busy');
    s.layer.style.touchAction = ''; s.layer.style.pointerEvents = '';
    s.tray.classList.remove('stk-tray', 'stk-dragging', 'stk-tray-del');
    s.tray.textContent = '';
    s.tray.removeAttribute('aria-label'); s.tray.removeAttribute('role');
    st = null;
  }

  window.Stickers = { init: init, load: load, clear: clear, count: count, destroy: destroy, refreshLabels: refreshLabels, renderTo: renderTo, setEnabled: setEnabled, MAX: MAX_ITEMS };
})();
