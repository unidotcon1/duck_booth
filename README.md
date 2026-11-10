# duck_booth

## Operator access

The kiosk shows only the camera, background strip and shutter to guests. Operator settings
(mode, camera, custom background, green-screen tuning, event frame, mirror, kiosk key) live in a drawer:

- Hold the invisible top-right corner (64px) for 1.5 seconds, or tap it 5 times quickly.
- Press `Shift+S` on a keyboard.
- Open the page with `?admin=1` to show a visible gear button in the top-right corner.

Press Esc or the close button to leave the drawer. "Peek" hides the drawer so the live preview is visible while tuning.
The first-run kiosk key can be provisioned with `https://host/#k=<token>`.
