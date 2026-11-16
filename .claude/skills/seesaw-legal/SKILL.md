---
name: seesaw-legal
description: Legal-safety review and guardrails for the Seesaw photo booth website (privacy, photo consent, copyright and artwork, third-party licences, the Seesaw Evaluation Licence and its 60-day check, security headers). Use when changing features that handle photos, personal data, QR/WhatsApp sharing, images or stickers, dependencies, licence text, or docs; or when asked "is this legal / safe".
---

# Seesaw legal guardrails

Seesaw is a laptop photo booth (Cloudflare Worker + static app, local by default) used at events, including by churches and schools,
in Singapore and elsewhere. **You are not a lawyer.** Every legal conclusion ends with "have a lawyer / the organisation's data
protection officer confirm", and gaps are listed, never hidden. Never claim something is "legal", "compliant" or "safe" without the
evidence in the repo.

## Always check these before you finish a change

1. **Personal data (PDPA Singapore, GDPR-style principles)**
   - Photos of faces are personal data. Keep: purpose limitation, short retention (`PHOTO_TTL_DAYS`, default 7), guest delete link, no analytics/cookies/third-party scripts (CSP `script-src 'self'`).
   - Guest phone number (WhatsApp sender) must stay in the browser: never sent to the Worker, logged, or stored.
   - Any new field, log, request or storage key → update `docs/legal/privacy.md` and the in-app privacy dialog (EN **and** 中文).
   - The licence check must stay **offline** and collect nothing. A "phone home", telemetry or hardware fingerprint needs explicit user approval, a privacy-notice change, and a lawful basis.
2. **Consent and children**: the operator must tell guests photos are taken and kept; no photos of minors without guardian consent; no filming people who didn't step up to the booth. Keep the privacy notice reachable from the guest screen.
3. **Copyright of content**
   - Only ship artwork/sounds/fonts we made, or whose licence allows it. Log every item in `docs/legal/third-party-notices.md` with licence + source + file path; add licence text to `docs/legal/licenses/`.
   - Never copy another booth's (Lumabooth, photobooth-io.cc…) code, text, layouts, images or branding; ideas and general features are fine, expression is not. No use of others' trademarks/characters as stickers unless permitted (flag meme/character stickers as a risk).
   - The church logo and user-added backgrounds/stickers belong to the operator: the notices say so.
4. **Dependencies**: only permissive licences (MIT, Apache-2.0, BSD, ISC). Vendored files keep their licence text. Check the licence before adding a package/model; refuse GPL/AGPL/non-commercial models for shipped code.
5. **Security that supports legality** (duty to protect personal data): upload key when exposed via tunnel, rate limit, magic-byte image check, size cap, `X-Robots-Tag: noindex`, strict CSP in `app/public/_headers`, no secrets in Git (`.dev.vars`, `archive/`, the licence **private key**).
6. **Seesaw Evaluation Licence** (`docs/legal/LICENSE`, `docs/guides/licensing.md`)
   - Own code = Seesaw Evaluation Licence: 60 days from first run, then a signed licence file. Earlier "Photo Booth" versions (before 16 Nov 2026) were MIT and stay MIT for copies already given out: never claim they were revoked.
   - Third-party components keep their own licences; the Seesaw licence must not claim to restrict them.
   - The licence check code is `app/scripts/licence-lib.mjs`, `licence-gate.mjs`, `licence.mjs`, plus `licenceExpired()` in `app/src/worker.js`. If you change terms (60 days, grace, scope) change all of: LICENSE, README licence section, licensing guide, i18n texts, `TRIAL_DAYS`, third-party notices, package.json `license` field.
   - The private key (`app/archive/seesaw-private-key.pem`) is never committed, printed, logged or sent. Run `git status` before any commit.
   - Be honest in docs that the check is not copy protection.
7. **Bilingual**: every user-visible legal or privacy sentence exists in EN and 中文 and layout does not shift.

## Review procedure

1. `git diff` the change; list what personal data, files, requests, storage keys, dependencies, images or text it adds.
2. Walk the checklist above; for each item write PASS / FIX / RISK (with file path).
3. Fix what is in scope; list residual risks and "ask a lawyer/DPO" items for the user in plain, non-technical words.
4. Run `grep -rIn "TODO\|FIXME" docs/legal` and check links in `docs/` still resolve.
5. Never publish, push or open a PR with secrets, private keys, photos or personal data in it.

## Wording rules

- Say "reduces risk" / "supports compliance", not "makes it legal".
- Always mark documents as "not legal advice" and name who should review (lawyer, PDPA DPO).
- Prefer plain English a church volunteer can follow; keep legal terms in the licence itself.
