# Security notes

## What is protected and how

| Risk | What the project does |
|---|---|
| Strangers uploading files to your booth/bucket | Optional upload key (`KIOSK_TOKEN`) checked in constant time; **forced on automatically by `start-tunnel`**; per-IP rate limit; 5 MB cap read from the stream (not from headers); only real JPEG/PNG (magic bytes checked). |
| Guessing other people's photos | IDs are random UUIDs (122 bits); the storage is never public; IDs are validated before any lookup. |
| Photos kept forever | Expiry on every photo (default 7 days) + automatic sweep + delete scripts + a **Delete this photo** button for the person holding the link. |
| Cross-site abuse | Same-origin only: no CORS headers; cross-origin `Origin` is rejected on upload and delete. |
| Script injection | Strict Content-Security-Policy on every page (`script-src 'self'`; no inline scripts or styles, no third-party hosts); user text is inserted with `textContent`; uploaded SVG stickers are drawn as images (their scripts never run); the QR address is validated as a plain http(s) URL. |
| Search engines / caches | `noindex, nofollow, noarchive` header on photos and the API; `Referrer-Policy: no-referrer`; `X-Frame-Options: DENY`. |
| Camera/microphone misuse | `Permissions-Policy` allows only the camera, only for this site; the microphone is never requested; the camera is released on the review/result screens. |
| Phone numbers | Never leave the browser except inside the WhatsApp link the guest chooses to open; never stored. |
| Vulnerable dependencies | `npm audit`: 0 known vulnerabilities at the time of writing. Run it again now and then (`npm audit`). Dependencies are pinned in `package-lock.json`. |
| Secrets in Git | `.dev.vars`, `archive/`, `photobooth-data/`, `photos-export/` and `.wrangler/` are git-ignored. The repository contains no keys. |

## Things you must still do yourself
* **Never** commit your upload key (`.dev.vars`).
* Keep the upload key **on** whenever the booth is reachable from the internet (tunnel or online deployment).
* The quick tunnel address works for anyone who has it while it runs; stop it when you are not using it.
* Keep Node.js, Chrome and Windows updated.
* The `.claude/` folder in this repository (AI-assistant agents and plugin caches) is not part of the booth; you can delete
  it from your own copy to make downloads smaller.
* Check you are allowed to use the logo, stickers and pictures (see `THIRD-PARTY-NOTICES.md`).

## Reporting a problem
Open an issue on <https://github.com/unidotcon1/duck_booth/issues> (don't post photos or keys). For anything sensitive,
use GitHub's "Report a vulnerability" feature on the repository's Security tab.
