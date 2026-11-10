# Photo Booth

A browser photo booth for events. Guests take a single photo or a photo strip, pick a filter before the shot, then **after the shot** remove the background, choose a new one, add stickers, and scan a QR code to download it. English and 中文.

Works on a laptop with a webcam (tested design: Windows laptop, Chrome). No account or payment is needed to run it on your own computer.

---

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
   - **Windows:** double-click **`start.bat`**.
   - **Mac / Linux:** open Terminal in the folder and run `bash start.sh`.
4. The first run installs everything (about a minute) and then your browser opens **<http://localhost:8787>**.
   If it doesn't open by itself, type that address into Chrome.
5. Click **Allow** when the browser asks to use the camera.
6. To stop: close the black window (or press `Ctrl+C` in it).

If Windows asks about the firewall, choose **Allow** for private networks (needed only so phones on the same Wi-Fi can open the download link).

## Option B — Using commands

Needs [Git](https://git-scm.com/downloads) too.

```bash
git clone https://github.com/unidotcon1/duck_booth.git
cd duck_booth
git checkout claude/vibrant-archimedes-gjxulv
npm install
npm start
```

Then open **<http://localhost:8787>** in Chrome and allow the camera.
Next time you only need `cd duck_booth` and `npm start`. To update later: `git pull`.

---

## Using the booth

| Do this | How |
|---|---|
| Take a photo | Press **Take a picture** (or the **Space** bar) |
| Choose a filter | Tap one on the right **before** taking the photo |
| Single photo or strip | Toggle **Single / Photo Strip** on the camera |
| Stop a countdown | Press **Esc** (or the Cancel button) |
| After the photo | Pick a background (the person is cut out automatically), add stickers, then **Looks good — get QR** |
| Save to a phone | Guest scans the QR code → **see "Phones can't scan localhost" below** |
| Open settings | The round **gear** button (top right), or press **Shift+S** |
| Switch language | **EN \| 中文** button (top right) |

### Phones can't scan `localhost` — set the QR link address (important)
On your laptop the booth lives at `localhost`, but to a phone "localhost" means *the phone itself*, so the QR code would fail with "refused to connect".

1. Make sure the phone is on the **same Wi-Fi** as the laptop.
2. Find your laptop's Wi-Fi address: Windows → open **Command Prompt** → type `ipconfig` → look for **IPv4 Address** under *Wi-Fi* (looks like `192.168.1.23`).
3. In the booth, open **settings (gear)** → **QR link address** → type `http://192.168.1.23:8787` (use *your* number).
4. Keep using `http://localhost:8787` on the booth laptop itself (the camera needs that).

A warning appears under the QR code whenever it would only work on the laptop.

---

## Make it yours

Everything for adding or removing **backgrounds, stickers, filter pictures, the logo and the event name** is in one easy guide:

### 👉 [GUIDE-CUSTOMIZE.md](GUIDE-CUSTOMIZE.md)

More advanced options (putting it online with Cloudflare, security key for uploads, the settings reference) are in [SETUP.md](SETUP.md).

---

## Operator settings (the gear button)

QR wait time (3 minutes / no limit) · text size 1×–3× · single / strip mode and how many shots · strip layout · camera choice and framing · QR link address · optional stickers · manage stickers · print button on/off · settings button on/off.
Operators can also open settings by holding the invisible top-right corner for 1.5 seconds, or adding `?admin=1` to the address.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `start.bat` says Node.js is not installed | Install the LTS version from <https://nodejs.org>, then double-click `start.bat` again. |
| The camera stays black / "permission denied" | Click the camera icon in Chrome's address bar → Allow. Close other apps using the camera (Zoom, Teams). On Windows: Settings → Privacy → Camera → allow desktop apps. |
| Picture zooms or follows you | Turn off **Automatic framing** in Windows (Settings → Bluetooth & devices → Cameras → your camera). |
| "Port 8787 is already in use" | Close the other black window that's still running the booth, then start again. |
| First photo is slow to cut out | The first cut-out loads ~36 MB of AI files; later ones are fast. |
| QR code "refused to connect" on the phone | See *Phones can't scan localhost* above. |
| Changed a file in `public/backgrounds` or `public/stickers` but nothing happened | Stop and restart the booth (close the black window and start again), then refresh the page. |

---

*Cut-outs run in the browser using open-source models (MODNet, MediaPipe); photos never leave your computer unless you deploy it online.*
