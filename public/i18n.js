// Photo Booth — tiny i18n layer (en + zh-CN). No inline script (CSP: script-src 'self').
// Static HTML: data-i18n (text), data-i18n-aria, data-i18n-title, data-i18n-ph, data-i18n-alt.
// Dynamic text: I18N.set(node, key, vars) stores key+vars on the node so a language switch re-renders it.
// A var may be a DOM Node (e.g. a <b id="..."> counter) — it is moved into the {placeholder} slot.
(() => {
  "use strict";
  const KEY = "photobooth.lang";

  const DICT = {
    en: {
      "brand": "Photo Booth",
      "aria.preview": "Live camera preview",
      "aria.bg": "Background",
      "aria.lang": "Language",
      "aria.qr": "QR code to download your photo",
      "aria.reviewPhoto": "Your photo",
      "shutter": "Take a picture",
      "filter.aria": "Filter",
      "f.none": "Original", "f.bw": "Black & White", "f.sepia": "Sepia", "f.vivid": "Vivid", "f.warm": "Warm",
      "f.cool": "Cool", "f.fade": "Fade", "f.dream": "Dream", "f.noir": "Noir", "f.beauty": "Beauty",
      "mode.aria": "Photo mode", "mode.single": "Single", "mode.strip": "Photo Strip",
      "shot.of": "Photo {i} of {n}",
      "cam.framing": "Camera framing", "cam.widest": "Widest (full camera image)", "cam.16x9": "16:9 crop", "cam.4x3": "4:3",
      "cam.status": "Camera", "cam.zoom": "zoom", "cam.fixed": "fixed", "cam.locked": "locked to widest",
      "cam.note": "Turn off Center Stage / Automatic framing / Studio Effects in your operating system if the picture still moves or zooms. (macOS: Control Center → Video Effects. Windows: Settings → Bluetooth & devices → Cameras → Windows Studio Effects → Automatic framing.)",
      "strip.paper": "Frame colour", "paper.white": "White", "paper.black": "Black", "paper.cream": "Cream", "paper.pink": "Soft pink", "paper.sky": "Sky blue", "paper.sage": "Sage", "paper.lavender": "Lavender",
      "strip.layout": "Layout", "strip.grid": "2×2 grid", "strip.date": "Add date", "strip.time": "Add time",
      "strip.reorder": "Drag photos to reorder",
      "res.print": "Print", "settings.btn": "Settings", "cap.esc": "Press Esc to cancel", "cap.cancel": "Cancel",
      "res.localWarn": "This QR only works on this computer. Set a QR link address in settings.",
      "drawer.showSettings": "Show settings button", "drawer.qrBase": "QR link address", "drawer.qrBasePh": "http://192.168.1.23:8787",
      "drawer.qrBaseHelp": "Phones cannot open localhost. Use your computer's Wi-Fi address, e.g. http://192.168.1.23:8787, and start the server with --ip 0.0.0.0 (or deploy to Cloudflare). Leave empty to use the page address.",
      "drawer.optStk": "Optional stickers", "drawer.stkMgr": "Manage stickers",
      "drawer.showPrint": "Show print button", "drawer.on": "On", "drawer.off": "Off",
      "review.workingN": "Removing backgrounds {i}/{n}…",
      "review.filterLbl": "Filter",
      "st.title": "Stickers",
      "st.hint": "Drag stickers onto your photo",
      "st.hint2": "Tap a sticker to adjust · ✕ to delete",
      "drawer.boothMode": "Booth mode",
      "drawer.bmGuests": "Guests choose", "drawer.bmSingle": "Single only", "drawer.bmStrip": "Photo Strip only",
      "drawer.shots": "Shots per strip", "drawer.layout": "Strip layout",
      "drawer.layoutV": "Vertical strip", "drawer.layoutG": "2×2 grid (4 shots only)",
      "kbd": "or press Space",
      "cd.3": "Get ready", "cd.2": "Look at the camera", "cd.1": "Smile",
      "processing": "Processing…",
      "bg.raw": "Original", "bg.transparent": "Transparent", "bg.sunset": "Sunset", "bg.ocean": "Ocean",
      "bg.neon": "Neon", "bg.studio": "Studio", "bg.white": "White", "bg.custom": "Custom",
      "review.label": "Review",
      "review.title": "Choose a background",
      "review.frame": "Event frame",
      "review.cut": "Remove background",
      "review.working": "Removing background…",
      "review.cutErr": "Couldn't remove the background. You can keep the original photo.",
      "review.keep": "Keep original",
      "review.retake": "Retake",
      "review.confirm": "Looks good — get QR",
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
      "res.reset": "Next guest in {s} · tap anywhere to stay",
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
      "drawer.mode": "Camera mode",
      "drawer.modeTest": "Testing — laptop webcam",
      "drawer.modeProd": "Production — Nikon DSLR (virtual webcam)",
      "drawer.camera": "Camera",
      "drawer.customBg": "Custom background",
      "drawer.chooseImg": "+ Choose an image",
      "drawer.qrWait": "QR wait time",
      "drawer.qr3": "3 minutes",
      "drawer.qrNone": "No time limit",
      "drawer.scale": "Text size",
      "drawer.scaleReset": "Reset",
      "drawer.method": "Cut-out method",
      "drawer.methodAuto": "Auto (AI, no green screen)",
      "drawer.methodGreen": "Green screen",
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
      "brand": "拍照亭",
      "aria.preview": "实时摄像头画面",
      "aria.bg": "背景",
      "aria.lang": "语言",
      "aria.qr": "下载照片的二维码",
      "aria.reviewPhoto": "你的照片",
      "shutter": "拍照",
      "filter.aria": "滤镜",
      "f.none": "原图", "f.bw": "黑白", "f.sepia": "复古褐", "f.vivid": "鲜艳", "f.warm": "暖色",
      "f.cool": "冷色", "f.fade": "褪色", "f.dream": "梦幻", "f.noir": "黑金", "f.beauty": "美颜",
      "mode.aria": "拍摄模式", "mode.single": "单张", "mode.strip": "照片条",
      "shot.of": "第 {i} 张，共 {n} 张",
      "cam.framing": "相机取景", "cam.widest": "最广（完整画面）", "cam.16x9": "16:9 裁切", "cam.4x3": "4:3",
      "cam.status": "摄像头", "cam.zoom": "变焦", "cam.fixed": "固定", "cam.locked": "已锁定最广",
      "cam.note": "如果画面仍然移动或放大，请在操作系统中关闭“居中取景 / 自动取景 / 工作室效果”。（macOS：控制中心 → 视频效果。Windows：设置 → 蓝牙和设备 → 摄像头 → Windows 工作室效果 → 自动取景。）",
      "strip.paper": "边框颜色", "paper.white": "白色", "paper.black": "黑色", "paper.cream": "奶油色", "paper.pink": "浅粉", "paper.sky": "天蓝", "paper.sage": "鼠尾草绿", "paper.lavender": "薰衣草紫",
      "strip.layout": "版式", "strip.grid": "2×2 方格", "strip.date": "添加日期", "strip.time": "添加时间",
      "strip.reorder": "拖动照片可调整顺序",
      "res.print": "打印", "settings.btn": "设置", "cap.esc": "按 Esc 取消", "cap.cancel": "取消",
      "res.localWarn": "此二维码仅在本机可用。请在设置中填写二维码网址。",
      "drawer.showSettings": "显示设置按钮", "drawer.qrBase": "二维码网址", "drawer.qrBasePh": "http://192.168.1.23:8787",
      "drawer.qrBaseHelp": "手机无法打开 localhost。请填写电脑的 Wi-Fi 地址，例如 http://192.168.1.23:8787，并用 --ip 0.0.0.0 启动服务（或部署到 Cloudflare）。留空则使用当前页面地址。",
      "drawer.optStk": "可选贴纸", "drawer.stkMgr": "管理贴纸",
      "drawer.showPrint": "显示打印按钮", "drawer.on": "开", "drawer.off": "关",
      "review.workingN": "正在抠图 {i}/{n}…",
      "review.filterLbl": "滤镜",
      "st.title": "贴纸",
      "st.hint": "把贴纸拖到照片上",
      "st.hint2": "点击贴纸可调整 · ✕ 删除",
      "drawer.boothMode": "拍摄模式",
      "drawer.bmGuests": "由访客选择", "drawer.bmSingle": "仅单张", "drawer.bmStrip": "仅照片条",
      "drawer.shots": "每条张数", "drawer.layout": "照片条版式",
      "drawer.layoutV": "竖条", "drawer.layoutG": "2×2 方格（仅 4 张）",
      "kbd": "或按空格键",
      "cd.3": "准备好", "cd.2": "看向镜头", "cd.1": "笑一个",
      "processing": "处理中…",
      "bg.raw": "原图", "bg.transparent": "透明", "bg.sunset": "日落", "bg.ocean": "海洋",
      "bg.neon": "霓虹", "bg.studio": "影棚", "bg.white": "纯白", "bg.custom": "自定义",
      "review.label": "预览",
      "review.title": "选择背景",
      "review.frame": "活动相框",
      "review.cut": "去除背景",
      "review.working": "正在抠图…",
      "review.cutErr": "抠图失败，您可以保留原图。",
      "review.keep": "保留原图",
      "review.retake": "重拍",
      "review.confirm": "确认，生成二维码",
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
      "res.reset": "{s} 后切换到下一位 · 点按屏幕可继续停留",
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
      "drawer.mode": "摄像头模式",
      "drawer.modeTest": "测试：笔记本摄像头",
      "drawer.modeProd": "正式：尼康单反（虚拟摄像头）",
      "drawer.camera": "摄像头",
      "drawer.customBg": "自定义背景",
      "drawer.chooseImg": "＋ 选择图片",
      "drawer.qrWait": "二维码等待时间",
      "drawer.qr3": "3 分钟",
      "drawer.qrNone": "不限时",
      "drawer.scale": "文字大小",
      "drawer.scaleReset": "重置",
      "drawer.method": "抠图方式",
      "drawer.methodAuto": "自动（AI，无需绿幕）",
      "drawer.methodGreen": "绿幕",
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
    document.title = t("brand");
    apply(); syncToggle(); listeners.forEach((f) => f(l));
  }

  document.documentElement.lang = lang;
  document.title = t("brand");
  apply(); syncToggle();
  document.querySelectorAll("#lang-toggle [data-lang]").forEach((b) =>
    b.addEventListener("click", (e) => { setLang(b.dataset.lang); if (e.detail > 0) b.blur(); }));

  window.I18N = { t, set, clear, apply, setLang, getLang: () => lang, onChange: (f) => listeners.push(f) };
})();
