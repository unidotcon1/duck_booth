# photo buth — how to run and view it

## A. On your laptop (fastest, no Cloudflare account needed)
Requirements: Node 18+ and a webcam. The browser allows the camera on `http://localhost` (no HTTPS needed).

```bash
git clone https://github.com/unidotcon1/duck_booth.git
cd duck_booth
git checkout claude/vibrant-archimedes-gjxulv
npm install
echo 'KIOSK_TOKEN=dev' > .dev.vars      # local-only kiosk key (git-ignored)
npx wrangler dev                          # starts on http://localhost:8787
```

Open **http://localhost:8787/#k=dev** in Chrome (the `#k=dev` part stores the kiosk key once, then disappears from the URL).
Allow the camera when asked. Uploaded photos go to a *local simulated* R2 bucket (in `.wrangler/`), so the QR link only works on your own machine/network.

- Operator settings: add `?admin=1` to the URL for a gear button, or press **Shift+S**.
- Take a photo: click the button or press **Space**.
- To test from your phone on the same Wi-Fi, run `npx wrangler dev --ip 0.0.0.0` and open `http://<laptop-ip>:8787`. Phone browsers block the camera on plain HTTP, but you can still open the download link from the QR.

## B. Deploy to Cloudflare (real public link)
Requires a free Cloudflare account with R2 enabled (R2 needs a payment method on file, free tier is generous).

```bash
npx wrangler login
npx wrangler r2 bucket create photo-buth-photos
npx wrangler r2 bucket lifecycle add photo-buth-photos expire-photos --prefix photos/ --expire-days 31
npx wrangler secret put KIOSK_TOKEN       # paste a long random string
npx wrangler deploy
```

Wrangler prints your URL, like `https://photo-buth.<your-subdomain>.workers.dev`.
On the kiosk laptop open `https://photo-buth.<your-subdomain>.workers.dev/#k=<your KIOSK_TOKEN>` once. Guests' phones then open the QR link on the same domain.

## C. Using the Nikon
Install Nikon Webcam Utility (or an NDI/HDMI-capture virtual webcam), connect the camera, then in the operator drawer choose **Production** mode and pick the Nikon from the Camera list. Use a green backdrop with even lighting for clean keying.
