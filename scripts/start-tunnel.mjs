// One-click "booth + free Cloudflare quick tunnel".
//  1. starts `cloudflared tunnel` and waits for its public https://….trycloudflare.com address
//  2. starts the booth (wrangler dev) with that address as PUBLIC_BASE_URL, so the QR code works from any network
//  3. makes sure uploads are protected (the tunnel exposes the booth to the internet): uses KIOSK_TOKEN from .dev.vars,
//     or generates a random one for this run
//  4. opens the booth in the browser with the key already filled in
// Run it with:  npm run tunnel     (or double-click start-tunnel.bat)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const PORT = 8787;
const log = (...a) => console.log("[tunnel]", ...a);

// --- cloudflared present? ---
const probe = spawnSync("cloudflared", ["--version"], { shell: win, encoding: "utf8" });
if (probe.error || probe.status !== 0) {
  console.error("\n  cloudflared is not installed (or not on PATH).\n");
  console.error(win ? "  Windows: open Command Prompt and run:  winget install Cloudflare.cloudflared\n           then close it, reopen, and run this again."
                    : "  Mac: brew install cloudflared      Linux: see https://github.com/cloudflare/cloudflared/releases\n");
  process.exit(1);
}

// --- upload key ---
let token = "";
const devVars = join(root, ".dev.vars");
if (existsSync(devVars)) {
  const m = readFileSync(devVars, "utf8").match(/^\s*KIOSK_TOKEN\s*=\s*(.+?)\s*$/m);
  if (m) token = m[1].replace(/^["']|["']$/g, "");
}
const generated = !token;
if (generated) token = randomBytes(18).toString("base64url");

const children = [];
function killAll() {
  for (const c of children) {
    try { if (win) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"]); else c.kill("SIGTERM"); } catch { /* already gone */ }
  }
}
process.on("SIGINT", () => { killAll(); process.exit(0); });
process.on("SIGTERM", () => { killAll(); process.exit(0); });
process.on("exit", killAll);

// --- 1. tunnel ---
log("starting the tunnel (takes a few seconds)…");
const tun = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { shell: win, stdio: ["ignore", "pipe", "pipe"] });
children.push(tun);
let booted = false;
const onData = (buf) => {
  const s = String(buf);
  if (booted) return;
  const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (m) { booted = true; startBooth(m[0]); }
};
tun.stdout.on("data", onData); tun.stderr.on("data", onData);
tun.on("exit", (code) => { if (!booted) { console.error("[tunnel] cloudflared stopped before giving an address (exit " + code + "). Check your internet connection."); } killAll(); process.exit(code || 0); });
setTimeout(() => { if (!booted) { console.error("[tunnel] no tunnel address after 40 s. Check your internet connection and try again."); killAll(); process.exit(1); } }, 40000);

// --- 2. booth ---
function startBooth(publicUrl) {
  log("tunnel address:", publicUrl);
  const args = ["wrangler", "dev", "--ip", "0.0.0.0", "--port", String(PORT), "--var", `PUBLIC_BASE_URL:${publicUrl}`];
  if (generated) args.push("--var", `KIOSK_TOKEN:${token}`);
  const booth = spawn(win ? "npx.cmd" : "npx", args, { cwd: root, shell: win, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  children.push(booth);
  booth.on("exit", (code) => { killAll(); process.exit(code || 0); });
  const open = `http://localhost:${PORT}/#k=${encodeURIComponent(token)}`;
  setTimeout(() => {
    console.log("\n  ==========================================================");
    console.log("   Photo Booth is running with a public QR address");
    console.log("   QR codes will point to:  " + publicUrl);
    console.log("   Booth screen (this laptop):  http://localhost:" + PORT);
    console.log(generated ? "   Upload key: generated for this run (the browser gets it automatically)." : "   Upload key: taken from your .dev.vars file.");
    console.log("   Keep this window open. Press Ctrl+C to stop everything.");
    console.log("  ==========================================================\n");
    try {
      if (win) spawn("cmd", ["/c", "start", "", open.replace(/&/g, "^&")], { stdio: "ignore", detached: true }).unref();
      else spawn(process.platform === "darwin" ? "open" : "xdg-open", [open], { stdio: "ignore", detached: true }).unref();
    } catch { /* open the address by hand */ }
  }, 12000);
}
