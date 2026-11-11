BACKGROUND IMAGES
=================
Drop image files here (.jpg .jpeg .png .webp). Best: 1920x1080 (16:9) JPEG, 1-2 MB each.
They appear as choices on the review screen after a photo is taken.

How the list is built
- scripts/build-backgrounds.mjs scans this folder and writes manifest.json.
  It runs automatically on `npx wrangler dev` and `npx wrangler deploy`
  (or run it by hand:  npm run backgrounds).
- Display name = file name ("beach-party.jpg" -> "Beach Party").
  To set names in both languages, create names.json here:
    { "beach-party.jpg": { "en": "Beach Party", "zh": "海滩派对" } }
- To hide the built-in gradients and show only your images, create config.json here:
    { "includeBuiltins": false }
- Order = alphabetical (numbers sort naturally: 01-..., 02-..., 10-...). Prefix files to control order.
