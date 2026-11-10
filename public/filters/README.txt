FILTER CHIP IMAGES
==================
Each filter chip on the live screen shows one sample picture with that filter applied
(sample.svg, drawn once at load; the chips never use the camera).

To use your own picture for a chip, save an image in this folder and list it in overrides.json:

  { "sepia": "sepia.jpg", "bw": "bw.webp" }

Filter ids (use these as the keys): none, bw, sepia, vivid, warm, cool, fade, dream, noir, beauty
- Recommended size: 240x240 or larger, square-ish. Formats: jpg, png, webp.
- An override image is shown exactly as-is (it should already show the look); no filter is applied on top.
- Missing or broken files silently fall back to the built-in sample.
- Only use pictures you have the right to use (your own photos, licensed or free-to-use images).
