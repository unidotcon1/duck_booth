# Licensing guide: the 60-day evaluation and licence files

Seesaw uses the [Seesaw Evaluation Licence](../legal/LICENSE). This page explains how the 60 days work, and (for the copyright
holder) how to issue a licence. It is practical help, **not legal advice**; have the licence reviewed by a lawyer.

## For people using Seesaw

- **Day 1** is the first time you start Seesaw (`start-tunnel.bat`, `npm start` or `npm run tunnel`). The window shows
  *"Seesaw evaluation: N days left"*, and the same line appears under **Settings → QR code & upload**.
- To check at any time (inside the `app` folder): `npm run licence`
- **After day 60** Seesaw refuses to start, and a booth that is still open stops saving new photos (guests see a message).
  Photos already taken keep working until they expire.
- **To continue:** ask the copyright holder for a licence file, put it in **`app/licence/`** (named `seesaw-licence.json`), start again.
- Everything is checked **on your computer**. Nothing is sent to the internet.

## For the copyright holder: issuing licences (once set up)

1. **Make your key pair, once, on your own computer** (inside `app`):
   ```bash
   npm run licence -- keygen
   ```
   This creates a **private key** in `app/archive/` (git-ignored: **never share it, back it up**) and a **public key** in
   `app/licence/public-key.pem`. Commit and publish the public key so every copy can check your licences.
   Until a public key is committed, licence files cannot be verified and everyone stays on the 60-day evaluation.
   If you lose the private key you cannot issue more licences; if you replace it, old licences stop working.
2. **Issue a licence:**
   ```bash
   npm run licence -- issue --licensee "Example Church" --days 365
   ```
   or with a fixed date: `--expires 2027-06-30`. A file `app/licence/seesaw-licence.json` is written; send it to the licensee.
   Use `--out somewhere/name.json` to write it elsewhere.

## How it works, and its limits (honest)

| Mechanism | What it does |
|---|---|
| First-start date | Saved in two local files; the earliest date found wins, so deleting one file does not restart the clock. |
| Clock check | The latest date ever seen is saved, so setting the clock back does not add days. |
| Licence file | The holder's private key signs *licensee + end date*. Seesaw checks it with the public key (Ed25519). A forged or edited file is rejected. |
| Server | The launcher tells the booth the end date; after it, new uploads are refused. |

**This is not copy protection.** The source code is readable, so a determined person can delete the check, run `wrangler dev`
directly, or delete both date files and the folder. The licence forbids that (clause 5); the script keeps honest users honest
and makes the rules clear. If you need real enforcement, only offer Seesaw as an online service that *you* host.

**Already-given-out copies:** versions published before 16 November 2026 were MIT-licensed. You cannot take that back for
copies people already have; the new licence covers versions published after the change.
