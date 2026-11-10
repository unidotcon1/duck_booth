# photo buth — architecture audit ("grill") & what was changed

## Security findings in the original blueprint → fix applied
| # | Finding | Fix in code |
|---|---------|-------------|
| 1 | **Unauthenticated `POST /api/upload`** = anyone can fill R2 (cost/abuse/illegal content hosting). The kiosk is a *public* web app, so a secret in JS is not a secret. | Kiosk bearer token (`KIOSK_TOKEN` Worker secret, SHA-256 digest compare), provisioned once via `/#k=…` and scrubbed from the URL. **Better:** put the kiosk behind Cloudflare Access (service token / device posture) and drop the shared token. |
| 2 | No rate limiting | Workers Rate Limiting binding `UPLOAD_LIMITER` (12/min/IP). Add a WAF rate rule as a second layer. |
| 3 | `Content-Length` and `Content-Type` are attacker-controlled | Body read as a stream with a hard 5 MB cap; magic-byte sniffing; stored type = sniffed type, must equal declared. |
| 4 | CORS "policy" | Not needed — same-origin only. Cross-origin `Origin` rejected, no `Access-Control-*` headers ever emitted. |
| 5 | **IDOR / enumeration** | Keys are `crypto.randomUUID()` (122 bits); IDs validated against a strict v4 regex before touching R2; bucket is never public. Caveat: link = capability, anyone with the QR can view. |
| 6 | Stored XSS via SVG/HTML upload | Only JPEG/PNG accepted; served with `nosniff`, `CSP: default-src 'none'; sandbox`, `CORP: same-origin`. |
| 7 | Photos live forever (privacy + cost) | `expiresAt` metadata enforced on read (30 d). **You must also add an R2 lifecycle rule** (below) for real deletion. |
| 8 | CSP / clickjacking | `_headers` ships a strict CSP (no inline JS/CSS), `frame-ancestors 'none'`, `Permissions-Policy`. No CDN dependency: QR lib is vendored. |
| 9 | Landing page / QR link leaking via Referer | `Referrer-Policy: no-referrer`, `noindex`. |

## Performance & UX findings
- **`getImageData` every frame at 1080p** burns CPU → keying runs on a 640 px work canvas; full-res only at capture. Further upgrade: WebGL fragment shader (10× cheaper) or MediaPipe segmentation as the "no green screen" fallback.
- **Canvas / object-URL leaks**: reused work canvas, export canvas zeroed after `toBlob`, `ImageBitmap.close()`, `revokeObjectURL`, tracks stopped on `pagehide`; the Done button and the idle timer use a hard `location.reload()` so a 12-hour event cannot accumulate leaks.
- **Idle timer**: timestamp + one 1 s tick instead of clearing/creating timeouts on every `mousemove`; 20 s "still there?" warning; never resets mid-countdown/upload (otherwise a slow upload loses the photo).
- **Upload failure on flaky venue Wi-Fi**: photo is shown immediately from the local blob, upload retries with backoff, manual Retry keeps the photo. Next step: queue in IndexedDB + Background Sync.
- **iOS/Safari quirks**: `<video>` must be in the DOM and `playsinline`/muted (not `display:none`); canvas memory cap; `?download` attachments go to Files, not Photos → QR opens the attachment per spec, but `/p/:id` landing page explains "Add to Photos". Consider making the QR point to the landing page.
- **Camera**: DSLR via a virtual webcam (Nikon Webcam Utility / NDI) appears in `enumerateDevices`; Production mode prefers it, requests 1080p, no mirroring. HDMI capture cards are the more reliable alternative. Live view from many Nikons is capped (~720p, auto-off timers) — test the body.
- **Transparent background** can't be JPEG → exported as PNG (auto-downscaled if >5 MB).
- Kiosk should run in Chrome kiosk mode with auto-granted camera permission; the app requests a wake lock.
- Green-screen keying quality depends on lighting far more than code; offer manual tuning (sliders included).

## Deploy
```bash
npm install
npx wrangler r2 bucket create photo-buth-photos
npx wrangler r2 bucket lifecycle add photo-buth-photos expire-photos --prefix photos/ --expire-days 31
npx wrangler secret put KIOSK_TOKEN      # long random string
npx wrangler deploy
# open https://<worker>.workers.dev/#k=<KIOSK_TOKEN> once on the kiosk
```
Local dev: put `KIOSK_TOKEN=dev` in `.dev.vars`, run `npx wrangler dev`.
