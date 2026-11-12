# How the tunnel works (and what `start-tunnel.bat` does for you)

This page explains, step by step, what happens when you double-click **`start-tunnel.bat`**, who talks to whom, and why you do
**not** have to type anything into *Settings → QR link address* when you use it.

---

## 1. The problem it solves

The booth is a small web server that runs **on your laptop**. Its address, `http://localhost:8787`, means *"this computer"*.

- On the booth laptop `localhost` works.
- On a guest's phone `localhost` means *the phone itself*, so a QR code that says `localhost` opens nothing.
- Even with the laptop's Wi-Fi address (`http://192.168.1.23:8787`) the phone must be on the **same** Wi-Fi, and venue guest networks
  often block devices from talking to each other. Phones on mobile data can never reach it.
- Your home or venue router normally blocks connections coming in from the internet, so the phone cannot simply "call" your laptop.

## 2. The idea in one picture

```
  Guest's phone                  Cloudflare (on the internet)                  Booth laptop
 ┌─────────────┐   1. opens      ┌───────────────────────────┐                ┌──────────────────────────────┐
 │ scans QR    │ ──────────────▶ │ https://random-words      │                │  cloudflared  ──▶  booth     │
 │ (any Wi-Fi  │   https://      │      .trycloudflare.com   │  ◀══════════   │  (tunnel        (localhost   │
 │  or mobile  │ ◀────────────── │                           │  2. the laptop │   program)       :8787)      │
 │  data)      │   4. photo page └───────────────────────────┘  dialled OUT   └──────────────────────────────┘
 └─────────────┘                          3. request travels back down that same connection to the booth
```

1. The phone opens the public address from the QR code.
2. **Before that, the laptop made an outgoing connection to Cloudflare and kept it open.** That connection is "the tunnel".
3. Cloudflare passes the phone's request back down the tunnel to the little program `cloudflared` on the laptop, which hands it to the
   booth at `http://localhost:8787`.
4. The booth answers (the photo page or the picture), and the answer goes back the same way to the phone.

Because the laptop only ever **dials out** (exactly like opening a web page), you need **no router settings, no open ports, no
fixed IP address**, and it works behind firewalls and guest Wi-Fi.

A *quick tunnel* is Cloudflare's free, no-account version:
- Cloudflare invents a **random name** (`something-random.trycloudflare.com`) every time you start it.
- It stops when you close the program; the old name is gone for good.
- It has **no uptime promise** and a limit on how many requests can be in flight at once, so it is meant for tests and small events.

---

## 3. What `start-tunnel.bat` does, in order

| Step | What happens | Why |
|---|---|---|
| 1 | Checks that **Node.js** is installed. | The booth is a Node program. |
| 2 | Checks that **cloudflared** is installed. If not, it offers to start the booth without a tunnel, or shows the install command. | The tunnel program. |
| 3 | Installs the booth's parts the first time (`npm install`). | One-off. |
| 4 | Decides the **upload key**: uses `KIOSK_TOKEN` from `app/.dev.vars` if you made one, otherwise **invents a random one for this run**. | The tunnel makes the booth reachable from the internet, so uploads must be locked. |
| 5 | Starts **`cloudflared tunnel --url http://localhost:8787`** and waits until it prints the new public name, e.g. `https://right-name.trycloudflare.com`. (It ignores cloudflared's error lines that mention `api.trycloudflare.com`, which is not your tunnel.) | Gets the public address. |
| 6 | Starts the **booth** and hands it that address as a setting (`PUBLIC_BASE_URL`) together with the upload key. | The booth now *knows* its public address. |
| 7 | Runs **checks** and prints `[OK]` / `[!!]` lines: the booth answers; the booth really holds the public address; and the public address really reaches the booth (it asks the booth *through the tunnel*). | So you know it works before guests arrive. |
| 8 | Opens `http://localhost:8787/#k=<key>` in your browser. The `#k=` part gives the browser the upload key once, then disappears from the address bar. | So you never type the key. |

When you close the window (or press `Ctrl+C`) the script stops both the booth and the tunnel.

---

## 4. How the QR code gets its address (this is why there is no "step 4")

After a guest confirms a photo:

1. The booth saves the photo and gets a random photo ID, e.g. `3ba59bb0-…`.
2. The booth page builds the QR text: **public address + `/p/` + photo ID + `?download`**
   → `https://right-name.trycloudflare.com/p/3ba59bb0-…?download`
3. A phone scans it, the request goes **phone → Cloudflare → tunnel → laptop → booth**, and the booth returns the download page.

Where does "public address" come from? The booth page asks its server (`/api/config`) and uses the **first** of these that applies:

| Priority | Source | When |
|---|---|---|
| **1** | The address the **tunnel starter** gave the booth | You started with `start-tunnel.bat` / `npm run tunnel` and the booth page is open on `localhost` |
| 2 | The address you **typed** in *Settings → QR link address* | Same-Wi-Fi setups, or any time the tunnel starter is *not* running |
| 3 | The address of the page itself | Fallback (this is `localhost` on the laptop, so a warning is shown under the QR code) |

So with the one-click starter, **nothing needs to be typed**. The settings box is greyed out and shows
*"Automatic: the tunnel starter set https://…"*. Anything you typed earlier (an old tunnel name, your Wi-Fi address) is ignored while
the starter runs, so an old value can't put a dead link in the QR code. Typing an address (the "manual way" in the README) is only for
when you start the tunnel yourself, or use the same Wi-Fi without a tunnel.

---

## 5. Who uses which address

| Who | Address | Goes through the tunnel? |
|---|---|---|
| The booth laptop (camera, screen, uploads) | `http://localhost:8787` | **No.** It talks to the booth directly; it needs `localhost` so the browser allows the camera. |
| A guest's phone (scans the QR) | `https://right-name.trycloudflare.com/…` | **Yes.** |
| The photo files | Stored on the laptop (`app/photobooth-data`) | They only travel through the tunnel when a phone downloads one. |

---

## 6. What the internet can see while the tunnel runs

The tunnel exposes the **whole booth server**, not only the photo pages. Anyone who learns the random address can:

- open the booth page in their own browser (they get their own camera and an empty copy of the settings; they cannot change *your* booth);
- open a photo **only if they have its full link** (random 122-bit ID; nobody can guess one);
- **not upload**: uploads need the upload key, which only your booth browser holds. That's why the starter always switches the key on.

Other protections still apply: photos expire after 7 days (default), the guest can delete their own photo from the download page, uploads are rate-limited and size/type-checked (see [security notes](../legal/security.md)).

**Privacy note:** the connection phone ↔ Cloudflare ↔ laptop is encrypted (HTTPS), but Cloudflare is a third party that carries the traffic, so a photo passes through its network when a guest downloads it. The tunnel does not store photos. Mention this in your privacy notice if relevant ([privacy guide](../legal/privacy.md)).

---

## 7. Reading the `[OK]` / `[!!]` lines

```
[OK] Booth is running:  http://localhost:8787
[OK] QR codes point to:  https://right-name.trycloudflare.com
[OK] Tunnel reachable from the internet: yes (the booth answered through it)
```

| Line | If it says `[!!]` |
|---|---|
| Booth is running | The booth did not start. Read the messages above the box (a port already in use is the usual cause: close the other booth window). |
| QR codes point to | The booth did not receive the address. Close the window and start again. |
| Tunnel reachable | The tunnel was created but did not answer yet. A new quick-tunnel name can take up to ~30 seconds. Try the address in a browser. If it never loads: restart the program, check the internet connection, or a firewall/antivirus blocking `cloudflared`. |

## 8. Important limits
- **The laptop must stay on, awake and online.** If it sleeps, the tunnel drops and every QR code stops working.
- **A new name every start.** QR codes from an earlier run (and the links in WhatsApp messages sent earlier) stop working when you restart the tunnel, even if the photo still exists.
- Photos from the booth stay in `app/photobooth-data` and are deleted after 7 days; guests should download theirs during the event.
- For a permanent address that works when your laptop is off, put the booth online instead: [deployment guide](deploy-and-advanced.md).

## 9. The three ways to make a QR code reachable (summary)

| Way | Works for | You do |
|---|---|---|
| **Tunnel starter** (`start-tunnel.bat`) | Any phone, any network | Nothing: it is automatic |
| **Same Wi-Fi address** | Phones on the booth's Wi-Fi only | Type `http://<laptop-wifi-address>:8787` into *Settings → QR link address* (README: "Phones can't scan localhost") |
| **Deploy online** (Cloudflare) | Any phone, laptop can be off | Follow the deployment guide (payment method needed for photo storage) |
