# photo booth — how to run and view it

## A. On your laptop (fastest, no Cloudflare account needed)
Requirements: Node 18+ and a webcam. The browser allows the camera on `http://localhost` (no HTTPS needed).

```bash
git clone https://github.com/unidotcon1/duck_booth.git
cd duck_booth
git checkout claude/vibrant-archimedes-gjxulv
npm install
# optional: echo 'KIOSK_TOKEN=dev' > .dev.vars   # only if you want to test with the upload key ON
npx wrangler dev                          # starts on http://localhost:8787
```

Open **http://localhost:8787** in Chrome. (If you turned the key ON, open `http://localhost:8787/#k=dev` instead; the `#k=dev` part stores the key once, then disappears from the URL.)
Allow the camera when asked. Uploaded photos go to a *local simulated* R2 bucket (in `.wrangler/`), so the QR link only works on your own machine/network.

- Operator settings: add `?admin=1` to the URL for a gear button, or press **Shift+S**.
- Take a photo: click the button or press **Space**.
- To test from your phone on the same Wi-Fi, run `npx wrangler dev --ip 0.0.0.0` and open `http://<laptop-ip>:8787`. Phone browsers block the camera on plain HTTP, but you can still open the download link from the QR.

## B. Deploy to Cloudflare (real public link)
Requires a free Cloudflare account with R2 enabled (R2 needs a payment method on file, free tier is generous).

```bash
npx wrangler login
npx wrangler r2 bucket create photo-booth-photos
npx wrangler r2 bucket lifecycle add photo-booth-photos expire-photos --prefix photos/ --expire-days 31
npx wrangler secret put KIOSK_TOKEN       # paste a long random string
npx wrangler deploy
```

Wrangler prints your URL, like `https://photo-booth.<your-subdomain>.workers.dev`.
On the kiosk laptop open `https://photo-booth.<your-subdomain>.workers.dev/#k=<your KIOSK_TOKEN>` once. Guests' phones then open the QR link on the same domain.

## C. Using the Nikon
Install Nikon Webcam Utility (or an NDI/HDMI-capture virtual webcam), connect the camera, then in the operator drawer choose **Production** mode and pick the Nikon from the Camera list. Use a green backdrop with even lighting for clean keying.

## D. The upload key — switch it ON or OFF (only you can, from the server)
The key is **optional**. The switch is server-side, so nobody can change it from the browser:

| State | How | Effect |
|-------|-----|--------|
| **ON** | Deployed: `npx wrangler secret put KIOSK_TOKEN` · Local: put `KIOSK_TOKEN=dev` in `.dev.vars` | Uploads need the key; the kiosk asks once (or open `/#k=<key>`). |
| **OFF** | Deployed: `npx wrangler secret delete KIOSK_TOKEN` · Local: delete the line / file `.dev.vars` | The kiosk never asks for a key. |

The app asks the server (`GET /api/config`) whether a key is required, so no change in the browser is needed. Restart `wrangler dev` after editing `.dev.vars`.

**Warning:** with the key OFF on a public deployment, anyone who knows the URL can upload to your R2 bucket (the 5 MB cap, file-type checks and per-IP rate limit still apply). Prefer ON for real events, or put the site behind Cloudflare Access.
