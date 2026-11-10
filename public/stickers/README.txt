STICKER IMAGES
==============
Drop your own sticker files into this folder (or into a sub-folder to make a category) (.png .webp .svg .jpg .jpeg).
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
- CATEGORY TABS: the tray shows tabs "All" + one per category (hidden when there is only one).
    * Built-in stickers are grouped as Fun / Faith / Party / Shapes / Text.
    * A sub-folder becomes a category named after the folder:
        stickers/christmas/tree.png  -> tab "Christmas"
      Give it a translated label in names.json with a trailing slash:
        { "christmas/": { "en": "Christmas", "zh": "圣诞" } }
      (files inside a folder are keyed with the folder: "christmas/tree.png")
    * Files directly in this folder go to the "Mine" / "我的" tab.
- Order = built-ins first, then your folders (alphabetical), then "Mine"; inside a
  category files sort alphabetically (numbers sort naturally: 01-..., 02-..., 10-...).
  Prefix file names to control order.
- Stickers are placed, moved, resized and rotated by the guest; JPEG files have no
  transparency, so prefer PNG/WebP/SVG.
