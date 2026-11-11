# Customize your Photo Booth

How to add (and remove) **backgrounds, stickers, filter pictures, the logo and the event name**.

> You only ever add files to folders inside the project's `app/public/` folder. After adding or deleting files in a folder, **restart the booth** (close the black window, start it again) and refresh the page. The stickers' in-app manager (below) needs no restart.

---

## 1. Backgrounds

Backgrounds are the pictures guests can put behind themselves on the review screen.

**Add:** copy image files into **`app/public/backgrounds/`**.
**Remove:** delete the file from that folder.

| Requirement | |
|---|---|
| File types | `.jpg` `.jpeg` `.png` `.webp` |
| Best size | **1920 × 1080** (16:9 landscape), JPEG |
| File size | 1–2 MB each is ideal (over 3 MB works but loads slower; over 25 MB is skipped) |
| Name | The file name becomes the label: `beach-party.jpg` → "Beach Party". Use letters, numbers, `-` or `_`. |
| Order | Alphabetical. Start names with `01-`, `02-`, … to control the order. |

**Optional extras** (create these small text files inside `app/public/backgrounds/`):

- **Names in English and Chinese** — `names.json`:
  ```json
  { "beach-party.jpg": { "en": "Beach Party", "zh": "海滩派对" } }
  ```
- **Hide the built-in gradients** and show only your pictures — `config.json`:
  ```json
  { "includeBuiltins": false }
  ```

---

## 2. Stickers

Stickers are the pictures guests drag onto their photo on the review screen.

### The easy way: the sticker manager (no files, no restart)
1. Open **settings** (gear button, top right) → scroll to **Manage stickers**.
2. Click **Add stickers** (or drag image files into the box). They appear straight away under the **Mine** tab and are remembered on this computer.
3. To **remove** a sticker you added: click its **trash** icon → **Yes**.
4. To **hide** any sticker (including the built-in ones) without deleting it: click its **eye** icon. **Show all** brings everything back.

| Requirement for the manager | |
|---|---|
| File types | **PNG or WebP with a transparent background** (best), SVG, or JPEG (a JPEG has a solid background, so it shows as a rectangle) |
| Size | Up to **3 MB** per file; big pictures are shrunk to 1024 px automatically |
| Shape | Roughly square, about **512 × 512 px**, with some empty margin |
| Count | Up to **60** added stickers |
| Where they're kept | In this browser on this computer. Use the same browser and the same address (`http://localhost:8787`) each time. Clearing the browser's site data deletes them. |

### The file way (to ship stickers with the project, or move to another computer)
Copy files into **`app/public/stickers/`**:

- Files directly in `app/public/stickers/` appear in the **Mine** tab.
- A **sub-folder** becomes its own tab. `app/public/stickers/christmas/tree.png` → tab "Christmas". Give it a Chinese label in `app/public/stickers/names.json`: `{ "christmas/": { "en": "Christmas", "zh": "圣诞" } }`.
- To **delete** a sticker permanently: delete its file. (The built-in set is in `app/public/stickers/builtin/` — you can delete files from there too.)
- **Hide all built-ins:** create `app/public/stickers/config.json` containing `{ "includeBuiltins": false }`.
- **Optional (switch-on) stickers:** files in `app/public/stickers/optional/` are hidden until you tick them in **settings → Optional stickers** (e.g. Tung Tung Sahur).

Same picture requirements as above (transparent PNG/WebP/SVG, about 512 px, under 2 MB is best).

---

## 3. Filter pictures (the little previews on the right)

The filter buttons show a built-in sample picture with each filter applied. To use your own preview picture for a filter:

1. Save a picture into **`app/public/filters/`** — a square **240 × 240 px or larger** `.jpg`, `.png` or `.webp`, and **only images you have the right to use**.
2. List it in `app/public/filters/overrides.json`, using the filter's id on the left:
   ```json
   { "sepia": "sepia.jpg", "noir": "noir.png" }
   ```
   Filter ids: `none`, `bw`, `sepia`, `vivid`, `warm`, `cool`, `fade`, `dream`, `noir`, `beauty` (see `app/public/filters/README.txt` for the exact list).

Your picture is shown as it is (no filter is applied on top).

---

## 4. Logo

| Where it shows | File to replace | Notes |
|---|---|---|
| Photo-strip footer (small mark under the photos) | `app/public/logo-crest.png` | The symbol only, transparent PNG, about 100 × 100 px or larger. (The camera screen no longer shows a logo.) |
| Result screen (big plate above the slot) | `app/public/logo.png` | Symbol + name, transparent PNG, about **1000 px wide** or more for a sharp print |

Keep the same file names. Higher-resolution files look sharper.

---

## 5. Event name, date and frame colour (photo strip)

- On the review screen of a **photo strip** you can pick the **frame colour**, and turn on **Add date** / **Add time**.
- The event text under the strip comes from **settings → Event frame**.

---

## 6. Quick checks if something doesn't show up

- Did you **restart** the booth after adding files to `backgrounds`, `stickers` or `filters`?
- Is the file type one of the supported ones (no `.heic`, `.gif`, `.bmp`)?
- Is the file under the size limits above?
- Open the booth's page, press `F12` → **Console** for any red error lines, and tell whoever maintains it.
