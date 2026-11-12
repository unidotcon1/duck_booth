# Privacy and data protection guide (for whoever runs the booth)

> This is a practical guide, **not legal advice**. Laws differ by country and by event. If you run the booth for a
> church, school or company, check with the person responsible for data protection (in Singapore: your PDPA
> Data Protection Officer — see <https://www.pdpc.gov.sg>).

## What data the booth handles

| Data | Where it goes | How long |
|---|---|---|
| Live camera picture | Shown on screen only. Never saved. The camera is **released** (switched off) as soon as the guest reaches the review screen. | Seconds |
| The finished photo / strip | Stored on the booth computer in `app/photobooth-data/` (see below). | **7 days** by default, then deleted automatically; you can delete everything after the event |
| Photo link / QR code | Contains a random 122-bit ID. Anyone who has the link can open the photo; nobody can guess it. | Until the photo is deleted |
| Guest's phone number (Send to phone) | Used only inside the browser to open a WhatsApp message. **Not sent to the booth's server, not saved**, cleared when the dialog closes. | Seconds |
| Operator settings (language, filter, QR address, contact text…) | Browser storage on the booth computer. | Until you clear the browser data |
| Stickers you add in the app | Browser storage (IndexedDB) on the booth computer. | Until you delete them |
| Analytics / cookies / ads / third-party scripts | **None.** The app loads nothing from other websites. | — |

The AI background removal runs **inside the browser on the booth computer**. Photos are not sent to any AI company.

## Where the photo files are stored (local use)

* Folder: **`app/photobooth-data/`** inside the project folder (for example `C:\Users\you\Desktop\duck_booth\app\photobooth-data`).
  Inside, `v3/r2/photo-booth-photos/blobs/` holds the pictures. The files have long hashed names and no `.jpg`, so you
  cannot open them directly — use the export script.
* To get normal picture files: run **`npm run export-photos`**. They are copied to **`app/photos-export/<date>/photo-<time>-<id>.jpg`**.
* To delete: **`npm run delete-photos -- --expired`** (only old photos) or **`npm run delete-photos -- --all --yes`**
  (everything — export first if you want to keep any).
* The folders `app/photobooth-data/` and `app/photos-export/` are excluded from Git, so they are never uploaded to GitHub.
  Treat them like any folder of personal photos: keep the laptop locked, and delete or move the photos after the event.
* Photos made with earlier versions may be in `.wrangler/state/` — you can delete that folder.

## Retention
* Each photo gets an expiry time (default **7 days**, set `PHOTO_TTL_DAYS` in `app/wrangler.jsonc`). Expired photos stop opening
  at once and are deleted for good the next time any photo is uploaded (and by `npm run delete-photos -- --expired`).
* A guest (or anyone with the link) can delete the photo themselves: open the link → **Privacy → Delete this photo**.

## Checklist for running an event (Singapore PDPA-style principles)
1. **Tell people.** Put a small sign at the booth: *"Photos are taken for this event. They are stored on this computer
   for 7 days and shared only through the QR code. Ask a helper if you want yours deleted."* The booth also has a
   **Privacy** link (bottom-left) with the same information in English and 中文. Fill in **settings → General →
   Privacy contact** so people know whom to ask.
2. **Consent and children.** Taking a photo by pressing the button is the guest's own action. Children under 13 should
   be accompanied by a parent or guardian who agrees. Don't use the booth for sensitive settings.
3. **Purpose.** Use the photos only to give them to the guests. Don't publish them or use them for marketing without
   asking.
4. **Protect.** Don't leave the booth computer unattended and unlocked. Keep the upload password on when using a tunnel.
   Keep the project and Windows updated.
5. **Delete.** After the event, export what the organiser is allowed to keep, then run `npm run delete-photos -- --all --yes`.
6. **Requests.** If someone asks for their photo to be removed, find it by the QR link or by time in `app/photos-export`, or
   just delete everything from that period.

## If you put the booth online (Cloudflare Worker + R2)
Photos are then stored in your Cloudflare R2 bucket (in the region Cloudflare chooses) and the same expiry applies. Add
a lifecycle rule as described in the deployment guide (`docs/guides/deploy-and-advanced.md`), and mention Cloudflare in your privacy notice.

## If you use the free quick tunnel
While the tunnel runs, guests' phones download their photo **through Cloudflare's network** (the photo is not stored at
Cloudflare, but it passes through). The booth switches the upload password on automatically while the tunnel is open.
