# Backlog

## Phone / narrow-screen UI (parked — laptop is the focus)
The phone layout works but is not polished. Known items:
- Preview is cropped to portrait on phones, but the saved photo is the full widescreen frame (guests see a narrower view than they get). Decide: crop capture to portrait on narrow screens, or letterbox the preview.
- Background labels are truncated on the narrowest screens ("See-thro…") and in landscape phone.
- Result screen: polaroid and QR stacking needs a pass at 390px and landscape.
- Operator drawer: long-press (1.5 s) path untested on a real touch device; 5-tap works.
- Retest iOS Safari: video must stay in the DOM, canvas memory cap, wake lock support.
- QR points to `/p/<id>?download` (Files on iOS). Consider pointing at the landing page `/p/<id>` so people can "Add to Photos".

## Other
- Upload queue in IndexedDB + Background Sync for flaky venue Wi-Fi.
- WebGL chroma key shader / MediaPipe segmentation fallback for no-green-screen setups.
- Cloudflare Access in front of the kiosk instead of a shared kiosk token.
