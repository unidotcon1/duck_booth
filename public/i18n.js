// photo buth — tiny i18n layer (en + zh-CN). No inline script (CSP: script-src 'self').
// Static HTML: data-i18n (text), data-i18n-aria, data-i18n-title, data-i18n-ph, data-i18n-alt.
// Dynamic text: I18N.set(node, key, vars) stores key+vars on the node so a language switch re-renders it.
// A var may be a DOM Node (e.g. a <b id="..."> counter) — it is moved into the {placeholder} slot.
(() => {
  "use strict";
  const KEY = "photobuth.lang";

  const DICT = {
    en: {
      "aria.preview": "Live camera preview",
      "aria.bg": "Background",
      "aria.lang": "Language",
      "aria.qr": "QR code to download your photo",
      "aria.reviewPhoto": "Your photo",
      "shutter": "Take a picture",
      "kbd": "or press Space",
      "cd.3": "Get ready", "cd.2": "Look at the camera", "cd.1": "Smile",
      "processing": "Processing…",
      "bg.raw": "No effect", "bg.transparent": "Transparent", "bg.sunset": "Sunset", "bg.ocean": "Ocean",
      "bg.neon": "Neon", "bg.studio": "Studio", "bg.white": "White", "bg.custom": "Custom",
      "review.label": "Review",
      "review.title": "Choose a background",
      "review.frame": "Event frame",
      "review.retake": "Retake",
      "review.confirm": "Looks good — get QR",
      "plate": "Scan to download",
      "res.head.ok": "Your photo is ready",
      "res.head.fail": "Something went wrong",
      "res.up": "Preparing your download…",
      "res.slow": "Still working…",
      "res.fail": "Upload failed — your photo is safe here",
      "res.hint.ok": "Scan with your phone camera",
      "res.hint.fail": "Check the network connection, then try again.",
      "res.hint.unauth": "This kiosk needs an upload key. Please ask a host.",
      "res.invalid": "Invalid link",
      "res.again": "Next guest",
      "res.retry": "Try again",
      "res.reset": "Next guest in {s}s · tap anywhere to stay",
      "idle": "Still there? Starting over in {s}s. Tap to stay.",
      "camera.n": "Camera {n}",
      "err.camApi": "Camera API unavailable. Open this page over HTTPS (or localhost).",
      "err.camDenied": "Camera permission denied. Allow camera access in the browser and reload.",
      "err.camNotFound": "No camera found. Connect a webcam or the Nikon virtual-webcam utility.",
      "err.camBusy": "Camera is busy (used by another app?). Close it and reload.",
      "err.camGeneric": "Camera error: {m}",
      "err.camLost": "Camera disconnected. Reconnect it and press any key.",
      "err.create": "Could not create the photo. Please try again.",
      "drawer.title": "Operator settings",
      "drawer.peek": "Peek", "drawer.back": "Back to settings",
      "drawer.close": "Close settings", "drawer.open": "Open operator settings",
      "drawer.mode": "Mode",
      "drawer.modeTest": "Testing — laptop webcam",
      "drawer.modeProd": "Production — Nikon DSLR (virtual webcam)",
      "drawer.camera": "Camera",
      "drawer.customBg": "Custom background",
      "drawer.chooseImg": "+ Choose an image",
      "drawer.tuning": "Green-screen tuning",
      "drawer.strength": "Key strength",
      "drawer.soft": "Edge softness",
      "drawer.despill": "Despill",
      "drawer.resetSliders": "Reset sliders",
      "drawer.frame": "Event frame",
      "drawer.showFrame": "Show frame",
      "drawer.eventName": "Event name",
      "drawer.framePng": "+ Frame PNG (transparent)",
      "drawer.mirror": "Mirror image",
      "drawer.mirrorNote": "Mirror (on for webcam, off for Nikon)",
      "drawer.resetKey": "Reset upload key",
      "drawer.keyReq": "Upload key: required",
      "drawer.keyNot": "Upload key: not required",
      "tok.title": "Upload key required",
      "tok.err": "That key didn't work. Try again.",
      "tok.guest": "Please ask a host for help.",
      "tok.op": "Paste the key set with wrangler secret put KIOSK_TOKEN. It is stored only on this device.",
      "tok.hint": "Operator access: hold the top-right corner for 1.5 seconds, or add ?admin=1 to the address.",
      "tok.cancel": "Cancel", "tok.save": "Save",
    },
    "zh-CN": {
      "aria.preview": "实时摄像头画面",
      "aria.bg": "背景",
      "aria.lang": "语言",
      "aria.qr": "下载照片的二维码",
      "aria.reviewPhoto": "你的照片",
      "shutter": "拍照",
      "kbd": "或按空格键",
      "cd.3": "准备好", "cd.2": "看向镜头", "cd.1": "笑一个",
      "processing": "处理中…",
      "bg.raw": "原图", "bg.transparent": "透明", "bg.sunset": "日落", "bg.ocean": "海洋",
      "bg.neon": "霓虹", "bg.studio": "影棚", "bg.white": "纯白", "bg.custom": "自定义",
      "review.label": "预览",
      "review.title": "选择背景",
      "review.frame": "活动相框",
      "review.retake": "重拍",
      "review.confirm": "确认，生成二维码",
      "plate": "扫码下载",
      "res.head.ok": "照片已就绪",
      "res.head.fail": "出了点问题",
      "res.up": "正在准备下载…",
      "res.slow": "仍在处理中…",
      "res.fail": "上传失败，照片已安全保存在此",
      "res.hint.ok": "请用手机相机扫描二维码",
      "res.hint.fail": "请检查网络连接后重试。",
      "res.hint.unauth": "此设备需要上传密钥，请联系工作人员。",
      "res.invalid": "链接无效",
      "res.again": "下一位",
      "res.retry": "重试",
      "res.reset": "{s} 秒后切换到下一位 · 点按屏幕可继续停留",
      "idle": "还在吗？{s} 秒后将重新开始，点按屏幕继续。",
      "camera.n": "摄像头 {n}",
      "err.camApi": "无法使用摄像头接口。请通过 HTTPS（或 localhost）打开此页面。",
      "err.camDenied": "摄像头权限被拒绝。请在浏览器中允许访问摄像头后刷新页面。",
      "err.camNotFound": "未找到摄像头。请连接网络摄像头或尼康虚拟摄像头工具。",
      "err.camBusy": "摄像头正被占用（可能被其他应用使用）。请关闭后刷新页面。",
      "err.camGeneric": "摄像头错误：{m}",
      "err.camLost": "摄像头已断开。请重新连接后按任意键。",
      "err.create": "无法生成照片，请重试。",
      "drawer.title": "操作员设置",
      "drawer.peek": "预览", "drawer.back": "返回设置",
      "drawer.close": "关闭设置", "drawer.open": "打开操作员设置",
      "drawer.mode": "模式",
      "drawer.modeTest": "测试：笔记本摄像头",
      "drawer.modeProd": "正式：尼康单反（虚拟摄像头）",
      "drawer.camera": "摄像头",
      "drawer.customBg": "自定义背景",
      "drawer.chooseImg": "＋ 选择图片",
      "drawer.tuning": "绿幕调节",
      "drawer.strength": "抠像强度",
      "drawer.soft": "边缘柔化",
      "drawer.despill": "去溢色",
      "drawer.resetSliders": "重置滑块",
      "drawer.frame": "活动相框",
      "drawer.showFrame": "显示相框",
      "drawer.eventName": "活动名称",
      "drawer.framePng": "＋ 相框 PNG（透明）",
      "drawer.mirror": "镜像画面",
      "drawer.mirrorNote": "镜像（网络摄像头开启，尼康关闭）",
      "drawer.resetKey": "重置上传密钥",
      "drawer.keyReq": "上传密钥：需要",
      "drawer.keyNot": "上传密钥：不需要",
      "tok.title": "需要上传密钥",
      "tok.err": "密钥无效，请重试。",
      "tok.guest": "请联系工作人员协助。",
      "tok.op": "请粘贴通过 wrangler secret put KIOSK_TOKEN 设置的密钥。密钥仅保存在本设备上。",
      "tok.hint": "操作员入口：长按右上角 1.5 秒，或在地址后添加 ?admin=1。",
      "tok.cancel": "取消", "tok.save": "保存",
    },
  };

  let lang = "en";
  try { const s = localStorage.getItem(KEY); if (s && DICT[s]) lang = s; else throw 0; }
  catch {
    const n = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    lang = /^zh/i.test(n) ? "zh-CN" : "en";
  }

  const raw = (key) => (DICT[lang] && DICT[lang][key]) ?? DICT.en[key] ?? key;
  function t(key, vars) {
    return raw(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars && !(vars[k] instanceof Node) ? String(vars[k]) : m));
  }

  function render(node) {
    const vars = node._i18nVars;
    const parts = raw(node.dataset.i18n).split(/(\{\w+\})/);
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      const m = /^\{(\w+)\}$/.exec(p);
      if (!m) { if (p) frag.append(p); continue; }
      const v = vars && vars[m[1]];
      if (v instanceof Node) frag.append(v); else if (v != null) frag.append(String(v));
    }
    node.replaceChildren(frag);
  }

  function set(node, key, vars) { node.dataset.i18n = key; node._i18nVars = vars; render(node); }
  function clear(node) { delete node.dataset.i18n; node._i18nVars = undefined; node.textContent = ""; }

  const ATTRS = [["data-i18n-aria", "aria-label"], ["data-i18n-title", "title"], ["data-i18n-ph", "placeholder"], ["data-i18n-alt", "alt"]];
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(render);
    for (const [src, dst] of ATTRS) root.querySelectorAll(`[${src}]`).forEach((n) => n.setAttribute(dst, raw(n.getAttribute(src))));
    if (root.nodeType === 1) {   // root itself
      if (root.dataset && root.dataset.i18n) render(root);
      for (const [src, dst] of ATTRS) if (root.hasAttribute(src)) root.setAttribute(dst, raw(root.getAttribute(src)));
    }
  }

  const listeners = [];
  function syncToggle() {
    document.querySelectorAll("#lang-toggle [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }
  function setLang(l) {
    if (!DICT[l]) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
    document.documentElement.lang = l;
    apply(); syncToggle(); listeners.forEach((f) => f(l));
  }

  document.documentElement.lang = lang;
  apply(); syncToggle();
  document.querySelectorAll("#lang-toggle [data-lang]").forEach((b) =>
    b.addEventListener("click", (e) => { setLang(b.dataset.lang); if (e.detail > 0) b.blur(); }));

  window.I18N = { t, set, clear, apply, setLang, getLang: () => lang, onChange: (f) => listeners.push(f) };
})();
