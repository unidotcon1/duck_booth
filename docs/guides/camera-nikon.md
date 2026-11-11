# Using a real camera (Nikon DSLR / mirrorless) with the booth

> **Honest note:** this guide was written without a Nikon connected. The numbers marked *measured* come from tests with a
> 1920 × 1080 test video; everything about Nikon behaviour is general knowledge about how these cameras and the free
> *Nikon Webcam Utility* usually work. Camera models differ — **test your own camera at least a day before the event**
> and follow Nikon's manual where it disagrees with this page.

---

## 1. The short version

- The booth treats a Nikon exactly like a webcam: the camera shows up as a **video camera** in the browser, and the booth
  takes a frame from that video. It does **not** download the camera's full-size still photos.
- So you get a **much better picture than a laptop webcam** (bigger sensor, real lens, blurry background, better light handling),
  but the file is a **1080p video frame**, not a 20-megapixel still.
- **Single photos are saved at up to 1920 × 1080** (a 16:9 picture, about 2 megapixels).
- **Photo strips are smaller on purpose** (see the table below).

---

## 2. Will the photos look "1920 × 1080"?

**Yes for single photos, if the camera really delivers 1080p.** What the booth does with the picture (*measured*):

| What | Size | Notes |
|---|---|---|
| Camera stream the booth asks for | **1920 × 1080** (Production mode) | Laptop webcams are asked for 1280 × 720 (Testing mode) |
| Single photo saved | **1920 × 1080**, JPEG quality 90 % | Difference from the original video frame: 42 dB (invisible; above ~40 dB you cannot see a difference). File size about 0.3–1.5 MB depending on detail |
| Photo-strip shots | captured at up to **1280 px wide** | |
| Finished vertical strip | **1200 px wide** (about 3470 px tall for 4 shots) | Each photo inside the strip is roughly 1100 px wide; fine for a 2 × 6 inch print at 300 dpi (600 × 1800 px) |
| Finished 2 × 2 grid | **1200 px wide** | Each of the four photos is only about 550 px wide: good on a phone, soft if printed large |
| If the camera gives 4K | scaled down to 1920 wide | The booth caps single photos at 1920 px |
| Maximum upload | 5 MB | Bigger files are shrunk automatically |

**What limits the quality (in order of importance):**
1. **The camera feed.** *Nikon Webcam Utility* usually outputs up to 1080p video, compressed, 8-bit colour, 30 frames per second.
   Some camera models offer less (720p). Video frames are softer and more compressed than stills.
2. **The lens, light and focus.** These matter more than the pixel count. A 35–50 mm lens at f/2.8–f/5.6 in good light looks far
   better than a laptop webcam at 4K.
3. **Background removal.** The AI cut-out works at a lower internal resolution and is then refined against the full-size photo.
   Hair strands and fine edges are a little soft, and glasses or busy backgrounds can be imperfect. A plain, evenly lit,
   non-black background (or a green screen with *Cut-out method → Green screen*) gives the cleanest edges.
4. **Filters and stickers** are drawn at the final size and do not reduce quality.

**What you cannot get:** the camera's full-resolution stills (RAW or 20 MP JPEG) or 4K. If you need those, take photos with
the camera itself; the booth is a 1080p video booth.

---

## 3. Three ways to connect the camera

| Way | What you need | Good | Watch out for |
|---|---|---|---|
| **A. Nikon Webcam Utility** (free) | Nikon's *Webcam Utility* software on the booth computer + a USB cable | Simplest: one cable, no extra hardware | Only works with the cameras Nikon lists as supported; usually 1080p max; the camera may switch off live view after a while; the software must be running before you open the booth |
| **B. HDMI capture card** | A "clean HDMI out" setting on the camera, a mini/micro-HDMI cable, a USB HDMI capture device | Usually the most stable and the cleanest 1080p picture; works with cameras the Webcam Utility doesn't support | Turn off the camera's on-screen overlays (focus boxes, icons) in its HDMI/display settings so they don't appear in photos |
| **C. Virtual camera via another program** (OBS, NDI tools…) | Extra software | Lets you add a crop, colour correction or a second source | More things that can go wrong on the day |

For a church or school event where it must "just work", **B** (or **A** for a supported body) with the camera on a tripod and
AC power is a sound choice.

---

## 4. Setting it up

1. Mount the camera on a **tripod** at about face height, lens centred on where guests will stand.
2. Power it from the mains (an AC adapter / "dummy battery" for your model) and in the camera menu **turn off the auto power-off /
   standby timer** so it doesn't switch off in the middle of the event. Check whether your model limits live view or movie mode
   time (some do, or they overheat in warm rooms) and do a **30-minute test**.
3. Connect it (way A, B or C above). Unplug the laptop's webcam from the picture: you will *choose* the Nikon in step 5.
4. Start the booth (`start-tunnel.bat`), open **Settings (gear) → Camera**.
5. **Camera**: pick the Nikon / "Nikon Webcam" / capture-card entry from the list. (It may show up as *Nikon Webcam Utility*,
   *USB Video*, *Cam Link*, or similar. If it is missing: close the booth page, start the camera software, reload the page.)
6. **Camera mode → Production (Nikon DSLR / virtual webcam)**. This asks for 1920 × 1080 and turns **Mirror image** off
   (a photo of a person should not be mirrored for the final picture; the laptop "Testing" mode mirrors like a selfie).
   Check that the line **Camera:** shows **1920×1080 · 16:9**. If it shows 1280×720, the camera or software is limiting it.
7. **Camera framing**: *Widest (full camera image)* is right for almost every setup; use *16:9 crop* if the camera outputs 4:3.
8. Take a few test photos with a real person, with and without a background, and look at them full screen.

> Windows "Automatic framing" and similar *Studio Effects* belong to the laptop's built-in camera, not the Nikon, but turn them off
> if your laptop camera is still the one selected.

---

## 5. What guests will experience

| Moment | What happens | Typical feel |
|---|---|---|
| Walking up | Live picture appears on the screen | A very small delay between moving and seeing it (a fraction of a second; a capture card is usually quicker than software). If it feels laggy, ask guests to watch the lens, not the screen |
| Pressing **Take a picture** | 3-, 5- or no-second countdown (**Settings → Photo modes → Countdown timer**), then a flash | Autofocus keeps working during the countdown; the photo is a frame, so there is no shutter-click sound unless you add one |
| Right after | "Processing…", then the review screen | About **one second** for the AI cut-out on a normal laptop (*measured* ≈ 0.8 s in a test; a slow laptop takes longer). A photo strip cuts out each photo in turn |
| Choosing a background / stickers | Instant preview | Smooth |
| **Looks good — get QR** | Upload to the booth, QR code appears | A second or two; the phone downloads the full-size picture |
| Retake | Camera restarts | About a second (the booth switches the camera off while guests edit, which also saves power) |

Things you will notice with a real camera that you don't with a webcam:
- **Autofocus can hunt** when someone steps in front of the lens. Use a continuous / face-detection AF mode, or set manual focus on a
  mark on the floor and ask guests to stand on it.
- **Exposure can pump** (the picture gets brighter/darker) when someone in a white shirt enters. Use **manual exposure** and fixed white
  balance so every guest looks the same.
- **The picture is wide (16:9).** Guests need to stand a little back to fit in; mark a spot.
- A DSLR/mirrorless picture has a **shallower depth of field** (blurry background) which looks great but means you must focus on the
  eyes.

---

## 6. Camera settings that give the best result

(Menu names differ by model — these are the ideas.)
- **Mode:** manual (M) or aperture priority with a locked ISO; in movie/live-view mode the shutter speed should be about **1/50–1/60 s**
  for 25–30 fps video.
- **Aperture:** f/2.8–f/5.6 for one person; f/5.6–f/8 for groups so everyone is sharp.
- **ISO:** as low as the light allows; if the picture is grainy, add light rather than raising ISO.
- **White balance:** set it manually (Kelvin) or use a grey card once; avoid Auto in mixed light.
- **Lens:** about 35–50 mm (full-frame equivalent) at 1.5–2.5 m gives natural portraits; wider for groups.
- **Picture control / profile:** *Neutral* or *Standard*; avoid heavy in-camera effects (the booth has its own filters).
- **Focus:** continuous AF with face/eye detection, or manual focus on a fixed spot.
- **Stabilisation (VR):** off when on a tripod.
- **Power:** mains adapter, auto power-off **off**.
- **Flicker:** if you see bands in the picture, set the camera's anti-flicker (50 Hz in Singapore) or use a constant LED light.

## 7. Light and background (this decides cut-out quality)

- Light the **guest's face** from the front/side with a soft light (a large LED panel with a diffuser) — brighter than the background.
- Don't stand guests in front of a window or bright lamp.
- Use a **plain backdrop** a metre or more behind them, in a colour that differs from their clothes and hair. Black and very dark
  backdrops make dark hair hard to cut out.
- With a **green screen**: evenly lit, no wrinkles, 1.5 m or more behind the guest; set *Settings → Backgrounds & frame → Cut-out
  method → Green screen* and tune with the sliders. (Green-screen mode uses more computer power than the AI mode.)

## 8. Troubleshooting

| Problem | Try |
|---|---|
| The Nikon isn't in the **Camera** list | Close the booth tab → start the camera software / plug in the capture card → reload the page (`F5`). Check no other program (Zoom, Teams, OBS, the Nikon software preview) is using the camera. |
| Black picture | Another program has the camera; or the camera is asleep (wake it, check live view / HDMI output is on). |
| Picture is only 1280 × 720 | Choose **Production** mode; try a different USB port (USB 3); check the software's resolution setting; some camera models only offer 720p over USB. |
| Picture is mirrored (text is backwards) | Settings → Camera → untick **Mirror image**. |
| Photo has focus boxes or icons on it | Capture-card setup: switch off the camera's HDMI information display / enable "clean" output. |
| Live view stops after a while | The camera shut live view off (timer, heat or battery). Mains power, auto-power-off off, shade the body, and check Nikon's live-view time limit for your model. |
| Picture looks soft | Focus on the eyes; use a faster shutter (1/60+), more light, a lower ISO, and clean the lens. |
| The cut-out cuts off a shoulder or hair | More light on the subject, plain backdrop, stand a bit further from the background. See *Light and background*. |
| Laggy preview | Use a capture card or a shorter/better USB cable; close other programs; unplug other USB-heavy devices from the same port. |

## 9. Checklist before the event
- [ ] Camera on tripod, mains power, auto power-off off, memory card not needed (booth doesn't use it)
- [ ] Booth set to **Production** mode; the Camera line shows **1920×1080 · 16:9**; Mirror off
- [ ] Manual exposure and white balance set; focus marked on the floor
- [ ] 30-minute run with no live-view cut-off or overheating
- [ ] Test photos checked full screen; one strip test; QR scanned by a phone (see the README for the QR address setup)
- [ ] Spare USB / HDMI cable and a charged laptop

*See also: [Customize guide](customize.md) · [Deploy & advanced](deploy-and-advanced.md) · [Privacy guide](../legal/privacy.md)*
