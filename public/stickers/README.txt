STICKER IMAGES
==============
Drop your own sticker files straight into this folder (.png .webp .svg .jpg .jpeg).
Best: transparent PNG or WebP, about 512x512 px, under 2 MB each. (Files over 25 MB are skipped.)
They appear in the sticker tray on the review screen after the built-in set.

How the list is built
- scripts/build-stickers.mjs scans this folder (and builtin/) and writes manifest.json.
  It runs automatically on `npx wrangler dev` and `npx wrangler deploy`
  (or run it by hand:  npm run stickers).
- Display name = file name ("pink-bow.png" -> "Pink Bow").
  To set names in both languages, create names.json here:
    { "pink-bow.png": { "en": "Pink Bow", "zh": "粉色蝴蝶结" } }
- To hide the built-in stickers and show only yours, create config.json here:
    { "includeBuiltins": false }
- Order = built-ins first, then your files alphabetically (numbers sort naturally:
  01-..., 02-..., 10-...). Prefix file names to control order.
- Stickers are placed, moved, resized and rotated by the guest; JPEG files have no
  transparency, so prefer PNG/WebP/SVG.
