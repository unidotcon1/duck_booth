# Photo Booth

A browser photo booth for events. Guests take a single photo or a photo strip, pick a filter before the shot, then **after the shot** remove the background, choose a new one, add stickers, and scan a QR code to download it. English and 中文.

Works on a laptop with a webcam (tested design: Windows laptop, Chrome). No account or payment is needed to run it on your own computer.

---

## What is where

```
start-tunnel.bat      ← double-click this to run the booth (the only file in the main folder)
app/                  the booth itself
  public/             the web page, AI models, stickers, backgrounds, filters, logo, cursors
  src/                the small server (Cloudflare Worker)
  scripts/            helper programs (export / delete photos, tunnel starter…)
  launchers/          Mac/Linux starters and a "start without tunnel" starter
  package.json, wrangler.jsonc   settings (photo expiry time is in wrangler.jsonc)
docs/                 these guides: README, customize, deploy, privacy, security, licences
```

## Before you start (once)

1. **Install Node.js** (the free "LTS" version): <https://nodejs.org> — click through the installer with the default options.
2. Use **Google Chrome** or **Microsoft Edge**.
3. Have an internet connection for the first run (it downloads a few packages). After that the booth works offline.

---

## Option A — Using the ZIP file (no Git needed)

1. Download the project as a ZIP:
   **<https://github.com/unidotcon1/duck_booth/archive/refs/heads/claude/vibrant-archimedes-gjxulv.zip>**
   (or open the repository on GitHub → green **Code** button → **Download ZIP**).
   > Once the work is merged into `main`, use `…/archive/refs/heads/main.zip` instead.
2. **Right-click the ZIP → Extract All** (Windows) or double-click it (Mac). Put the folder somewhere easy, like your Desktop. Don't run it from inside the ZIP.
3. Open the folder and start it:
   - **Windows:** double-click **`start-tunnel.bat`** (it is the only file in the main folder). If the free tunnel program is not installed it offers to start the booth without it.
   - **Mac / Linux:** open Terminal in the folder and run `bash app/launchers/start-local.sh`.
4. The first run installs everything (about a minute) and then your browser opens **<http://localhost:8787>**.
   If it doesn't open by itself, type that address into Chrome.
5. Click **Allow** when the browser asks to use the camera.
6. To stop: close the black window (or press `Ctrl+C` in it).

If Windows asks about the firewall, choose **Allow** for private networks (needed only so phones on the same Wi-Fi can open the download link).

## Option B — Using commands

Needs [Git](https://git-scm.com/downloads) too.

```bash
git clone https://github.com/unidotcon1/duck_booth.git
cd duck_booth/app
git checkout claude/vibrant-archimedes-gjxulv
npm install
npm start
```

Then open **<http://localhost:8787>** in Chrome and allow the camera.
Next time you only need `cd duck_booth/app` and `npm start`. To update later: `git pull`.

---

## Using the booth

| Do this | How |
|---|---|
| Take a photo | Press **Take a picture** (or the **Space** bar) |
| Choose a filter | Tap one on the right **before** taking the photo |
| Single photo or strip | Toggle **Single / Photo Strip** on the camera |
| Stop a countdown | Press **Esc** (or the Cancel button) |
| After the photo | Pick a background (the person is cut out automatically), add stickers, then **Looks good — get QR**. The **Background**, **Strip options** and **Stickers** sections fold open and closed — opening Stickers makes room for at least 3 full rows |
| Save to a phone | Guest scans the QR code → **see "Phones can't scan localhost" below** |
| Send the link by WhatsApp | Result screen → **Send to phone** → type a mobile number → **Open WhatsApp** (see below) |
| Open settings | The round **gear** button (top right), or press **Shift+S** |
| Switch language | **EN \| 中文** button (top right) |

### Phones can't scan `localhost` — set the QR link address (important)
On your laptop the booth lives at `localhost`, but to a phone "localhost" means *the phone itself*, so the QR code would fail with "refused to connect".

1. Make sure the phone is on the **same Wi-Fi** as the laptop.
2. Find your laptop's Wi-Fi address: Windows → open **Command Prompt** → type `ipconfig` → look for **IPv4 Address** under *Wi-Fi* (looks like `192.168.1.23`).
3. In the booth, open **settings (gear)** → **QR link address** → type `http://192.168.1.23:8787` (use *your* number).
4. Keep using `http://localhost:8787` on the booth laptop itself (the camera needs that).

A warning appears under the QR code whenever it would only work on the laptop.

### Phone on a different Wi-Fi or on mobile data? Use the free quick tunnel
The steps above only work when the phone and the laptop share the same Wi-Fi. If guests use **mobile data** or a **different Wi-Fi** (for example the venue's guest network), the phone must reach your laptop through the internet. A *Cloudflare quick tunnel* does that for free: it gives your laptop a temporary public `https://…trycloudflare.com` address. **No Cloudflare account, no credit card.**

#### Easiest: one click
1. Install the tunnel program once (Step 1 below).
2. Double-click **`start-tunnel.bat`** (Mac/Linux: `bash app/launchers/start-tunnel.sh`, or `npm run tunnel` inside the `app` folder).

That one script starts the tunnel, starts the booth with the new public address already filled into the QR codes, switches the upload password on for you (a random one for each run, or the one in your `.dev.vars` file), and opens the booth in your browser. Keep its window open; press `Ctrl+C` to stop. You can skip steps 2–4 below — they describe doing the same thing by hand.

#### The manual way
**What you need to know first**
- The laptop must stay **on, awake and online** while guests download. If it sleeps or loses internet, the QR codes stop working.
- The address is **new every time** you start the tunnel (old QR codes stop working when you restart it). Download links stay valid only while the tunnel and the booth are running.
- It's meant for testing and small events — Cloudflare gives no uptime promise for quick tunnels.
- Photos stay on your laptop; guests' phones fetch them through the tunnel.
- The tunnel makes the **whole booth reachable from the internet**, so turn on the upload password first (step 2). Without it, anyone who finds the address could upload files to your laptop.

**Step 1 — Install the tunnel program (once)**
- **Windows:** open *Command Prompt* and run `winget install Cloudflare.cloudflared`, then **close and reopen** Command Prompt.
  (No winget? Download `cloudflared-windows-amd64.exe` from <https://github.com/cloudflare/cloudflared/releases/latest>, rename it `cloudflared.exe`, and run it from the folder where you saved it.)
- **Mac:** `brew install cloudflared`.
- Check it worked: `cloudflared --version` prints a version number.

**Step 2 — Turn on the upload password (once)**
1. In the **`app`** folder, create a text file named exactly **`.dev.vars`** containing one line, with your own long password (letters and numbers, no spaces):
   ```
   KIOSK_TOKEN=pick-a-long-random-password-here
   ```
   (Windows: in Notepad choose *Save as → All files* so it doesn't become `.dev.vars.txt`.)
2. Restart the booth (close its black window, start it again).
3. In Chrome, open this address **once** to save the password on the booth laptop:
   `http://localhost:8787/#k=pick-a-long-random-password-here`
   After that the booth never asks again on this computer. Guests' phones never need it.

**Step 3 — Start the tunnel (every time)**
1. Start the booth as usual (`start-tunnel.bat`, or `npm start` inside the `app` folder) and wait until it is running.
2. Open a **second** Command Prompt / Terminal window and run:
   ```bash
   cloudflared tunnel --url http://localhost:8787
   ```
3. After a few seconds it prints a boxed message with an address like
   **`https://random-words-here.trycloudflare.com`** — copy that address (select it, right-click to copy). Keep this window open.

**Step 4 — Give the address to the booth**
1. On the booth, open **settings** (gear) → **QR code & upload** → **QR link address**.
2. Paste the `https://…trycloudflare.com` address (no `/` at the end) and close settings.
3. Keep using `http://localhost:8787` on the booth laptop itself (the camera needs it).

**Step 5 — Test it before the event**
Take a photo, then scan the QR code with a phone that is on **mobile data** (switch the phone's Wi-Fi off). The photo page should open and the **Download photo** button should save the picture. The warning under the QR code about "only works on this computer" should be gone.

**Every time you restart the tunnel**, repeat step 4 with the new address.

**Stop:** press `Ctrl+C` in the tunnel window (and close the booth window).

| Problem | Fix |
|---|---|
| `cloudflared` is not recognized | Close and reopen Command Prompt after installing, or run it from the folder that holds `cloudflared.exe`. |
| Phone shows "Error 1033" / "can't be reached" | The tunnel was restarted or stopped. Start it again and paste the **new** address into *QR link address*. |
| Phone page opens but the photo doesn't | The booth itself isn't running, or the laptop went to sleep. Keep it awake (Windows: Settings → System → Power → Screen and sleep → Never while plugged in). |
| Booth shows "Upload key required" | Open `http://localhost:8787/#k=your-password` once (step 2.3). |
| The warning under the QR code is still there | The *QR link address* is empty or still `localhost`. Re-do step 4. |

*For a permanent address that works even when your laptop is off, deploy to Cloudflare instead — see [the deployment guide](guides/deploy-and-advanced.md).*

### Where your photos are stored (local use)
When you run the booth on your own computer, **nothing is uploaded to the internet**. Each finished photo is saved here:

> **`app/photobooth-data/`** — a folder inside the `app` folder (for example `C:\Users\you\Desktop\duck_booth\app\photobooth-data`)

- The pictures are inside `app/photobooth-data/v3/r2/photo-booth-photos/blobs/` with long computer-style names, so you can't open them directly.
- **To get normal picture files** open Command Prompt in the `app` folder and run `npm run export-photos`. They are copied to **`app/photos-export/<date>/photo-<time>-<id>.jpg`**, ready to open, print or back up.
- **To delete:** `npm run delete-photos -- --expired` (only photos past their time limit) or `npm run delete-photos -- --all --yes` (everything — export first!).
- Photos are removed automatically after **7 days** (change `PHOTO_TTL_DAYS` in `app/wrangler.jsonc`).
- Both folders are excluded from Git, so they are never uploaded to GitHub. Back them up yourself if you want to keep them, and delete them after your event.
- Stickers you add in the app and your settings live in the browser's own storage on that computer, not in these folders.
- A guest's phone saves its own copy when they download. The booth never keeps phone numbers.

More detail, plus a privacy checklist for events: [the privacy guide](legal/privacy.md).

### Send to phone (WhatsApp)
On the result screen, **Send to phone** opens a number pad. The guest types their mobile number (default country code **SG +65**; change it in settings, or type the full number starting with `+`), then taps **Open WhatsApp**.

- The booth opens a WhatsApp chat to that number with a ready-made message containing the photo link. **WhatsApp Web or WhatsApp Desktop must be signed in on the booth laptop**, and someone must press **Send** in WhatsApp. Nothing is sent automatically.
- The guest's phone must be able to open the link, so set up the QR address first (same Wi-Fi, quick tunnel or online deployment, above). A warning shows if the link would only work on the laptop.
- **Privacy:** the number is used only to build the WhatsApp link in the browser. It is not sent to the booth's server, not saved, and is cleared as soon as the dialog closes (the confirmation shows only the last 4 digits).
- Turn it off in **settings → General → Show send-to-phone button**.
- *Automatic SMS* would need a paid SMS service and a deployed server; it is not included.

### Privacy, safety and performance
- **Privacy notice for guests:** the **Privacy** link (bottom-left) shows an English / 中文 notice. Put your contact in **settings → General → Privacy contact**. Guests can delete their own photo from the download page. See [PRIVACY.md](legal/privacy.md).
- **Safety measures** (upload key, rate limit, strict content policy, expiry, nothing sent to third parties): [the security notes](legal/security.md).
- **Light on your computer:** the live camera view is drawn by the browser's graphics hardware instead of JavaScript, and the camera is switched off while guests edit. In our tests the live screen's main-thread load dropped from about **21% to 0.1%** of one core (measured with a test camera in headless Chrome, so real numbers differ). Only **green-screen mode** still needs per-pixel work (about 21% in the same test); everything else, including every filter, is handled by the graphics hardware.

---

## Make it yours

Everything for adding or removing **backgrounds, stickers, filter pictures, the logo and the event name** is in one easy guide:

### 👉 [Customize guide](guides/customize.md)

Using a real camera such as a Nikon (setup, what guests experience, photo quality): [Nikon / real camera guide](guides/camera-nikon.md).

More advanced options (putting it online with Cloudflare, security key for uploads, the settings reference) are in the [deployment & advanced guide](guides/deploy-and-advanced.md).

---

## Operator settings (the gear button)

The settings are grouped into collapsible sections (General · Photo modes · Camera · Backgrounds & frame · Stickers · QR code & upload). Type in the **search box** at the top to find a setting in English or Chinese (try "camera", "upload", "字体"), press **Esc** to clear it, and use **Expand all / Collapse all**. The sections you leave open are remembered. Press **/** inside the settings to jump to the search box.

Countdown timer (none / 3 s / 5 s) · QR wait time (3 minutes / no limit) · text size 1×–3× · send-to-phone on/off and default country code · single / strip mode and how many shots · strip layout · camera choice and framing · QR link address · optional stickers · manage stickers · print button on/off · settings button on/off.
Operators can also open settings by holding the invisible top-right corner for 1.5 seconds, or adding `?admin=1` to the address.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `start-tunnel.bat` says Node.js is not installed | Install the LTS version from <https://nodejs.org>, then double-click `start-tunnel.bat` again. |
| The camera stays black / "permission denied" | Click the camera icon in Chrome's address bar → Allow. Close other apps using the camera (Zoom, Teams). On Windows: Settings → Privacy → Camera → allow desktop apps. |
| Picture zooms or follows you | Turn off **Automatic framing** in Windows (Settings → Bluetooth & devices → Cameras → your camera). |
| "Port 8787 is already in use" | Close the other black window that's still running the booth, then start again. |
| First photo is slow to cut out | The first cut-out loads ~36 MB of AI files; later ones are fast. |
| QR code "refused to connect" on the phone | Same Wi-Fi: see *Phones can't scan localhost* above. Different Wi-Fi or mobile data: see *free quick tunnel* above. |
| Changed a file in `app/public/backgrounds` or `app/public/stickers` but nothing happened | Stop and restart the booth (close the black window and start again), then refresh the page. |

---

## License and credit

Copyright (c) 2026 **unidotcon1**. Released under the **[MIT License](legal/LICENSE)**: anyone may use, copy, change and share this
code, including for their own events, **as long as they keep the copyright notice and the licence text** (that is the credit).
A friendly credit such as *"Photo Booth by unidotcon1 — https://github.com/unidotcon1/duck_booth"* is appreciated.

- Open-source parts and AI models used (all permissive licences): [the third-party notices](legal/third-party-notices.md) and the [`legal/licenses/`](legal/licenses) folder.
- **The church logo, stickers, cursors and background pictures are *not* covered by the MIT licence** — see the table in the third-party notices and make sure you may use them.

*Cut-outs run in the browser using open-source models (MODNet, MediaPipe); photos never leave your computer unless you deploy it online.*
