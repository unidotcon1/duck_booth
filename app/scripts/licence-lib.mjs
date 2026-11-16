// Seesaw evaluation-licence engine. Runs on YOUR computer only: no network, no account, nothing is sent anywhere.
//   * Evaluation: 60 days from the first start (the first-start date is kept in two small local files).
//   * Full licence: a signed file  app/licence/seesaw-licence.json  issued by the copyright holder (Ed25519 signature).
// This is an honest-user control backed by the legal terms in docs/legal/LICENSE. It is NOT copy protection:
// anyone with the source can edit it out, which the licence forbids.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const TRIAL_DAYS = 60;                       // "2 months" = 60 days, so the end date is unambiguous
export const DAY = 86400000;
export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_KEY_FILE = join(root, "licence", "public-key.pem");
export const LICENCE_FILE = join(root, "licence", "seesaw-licence.json");
export const PRIVATE_KEY_FILE = join(root, "archive", "seesaw-private-key.pem");   // archive/ is git-ignored. NEVER share or commit this file.
const trialFiles = [join(root, "photobooth-data", ".seesaw-trial.json"), join(homedir(), ".seesaw", "trial.json")];

const validDate = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const writeJson = (f, o) => { try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o)); return true; } catch { return false; } };

/** First-start date + latest date seen (so winding the clock back does not add days). Earliest first start wins. */
export function trialState(now = Date.now(), { write = true } = {}) {
  const found = trialFiles.map(readJson).filter(Boolean);
  const firsts = found.map((j) => validDate(j.firstRun)).filter((t) => t !== null);
  const lasts = found.map((j) => validDate(j.lastSeen)).filter((t) => t !== null);
  const effNow = Math.max(now, ...lasts);                       // never earlier than the latest date already seen
  const first = firsts.length ? Math.min(...firsts, effNow) : effNow;
  if (write) for (const f of trialFiles) writeJson(f, { firstRun: new Date(first).toISOString(), lastSeen: new Date(effNow).toISOString() });
  return { first, expires: first + TRIAL_DAYS * DAY, now: effNow, clockWoundBack: effNow - now > DAY };
}

/** Reads and verifies the signed licence file. Returns {ok, reason, licensee, expires}. */
export function readLicence() {
  if (!existsSync(LICENCE_FILE)) return { ok: false, reason: "none" };
  if (!existsSync(PUBLIC_KEY_FILE)) return { ok: false, reason: "no-public-key" };
  try {
    const f = readJson(LICENCE_FILE);
    const good = verify(null, Buffer.from(f.payload), createPublicKey(readFileSync(PUBLIC_KEY_FILE)), Buffer.from(f.signature, "base64"));
    if (!good) return { ok: false, reason: "bad-signature" };
    const p = JSON.parse(f.payload), exp = validDate(p.expires);
    if (p.product !== "Seesaw" || exp === null) return { ok: false, reason: "malformed" };
    return { ok: true, licensee: String(p.licensee || ""), expires: exp };
  } catch { return { ok: false, reason: "malformed" }; }
}

/** The one question the launcher asks. status: "licensed" | "trial" | "expired" */
export function checkLicence(now = Date.now(), opts = {}) {
  const t = trialState(now, opts), lic = readLicence();
  if (lic.ok && t.now <= lic.expires) return { status: "licensed", expires: lic.expires, licensee: lic.licensee, daysLeft: Math.ceil((lic.expires - t.now) / DAY), firstRun: t.first };
  const left = Math.ceil((t.expires - t.now) / DAY);
  const extra = { licenceProblem: lic.ok ? "licence-expired" : lic.reason, firstRun: t.first, clockWoundBack: t.clockWoundBack };
  return t.now <= t.expires ? { status: "trial", expires: t.expires, daysLeft: left, ...extra } : { status: "expired", expires: t.expires, daysLeft: 0, ...extra };
}

// ---- owner tools (copyright holder only) ----
export function keygen({ force = false } = {}) {
  if (existsSync(PRIVATE_KEY_FILE) && !force) throw new Error("A private key already exists at " + PRIVATE_KEY_FILE + ". Use --force only if you want to REPLACE it (every licence you issued before will stop working).");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(PRIVATE_KEY_FILE), { recursive: true }); mkdirSync(dirname(PUBLIC_KEY_FILE), { recursive: true });
  writeFileSync(PRIVATE_KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }));
  try { chmodSync(PRIVATE_KEY_FILE, 0o600); } catch { /* Windows */ }
  writeFileSync(PUBLIC_KEY_FILE, publicKey.export({ type: "spki", format: "pem" }));
}
export function issue({ licensee, days, expires, out }) {
  if (!existsSync(PRIVATE_KEY_FILE)) throw new Error("No private key. Run  npm run licence -- keygen  first (on YOUR computer, not the customer's).");
  const exp = expires ? validDate(expires + (expires.length === 10 ? "T23:59:59Z" : "")) : Date.now() + Number(days) * DAY;
  if (exp === null || !Number.isFinite(exp)) throw new Error("Give --days <number> or --expires YYYY-MM-DD.");
  if (!licensee) throw new Error("Give --licensee \"Name of the person or organisation\".");
  const payload = JSON.stringify({ product: "Seesaw", licensee, issued: new Date().toISOString(), expires: new Date(exp).toISOString() });
  const signature = sign(null, Buffer.from(payload), createPrivateKey(readFileSync(PRIVATE_KEY_FILE))).toString("base64");
  const file = out || join(root, "licence", "seesaw-licence.json");
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ payload, signature }, null, 2));
  return { file, expires: exp };
}

export const fmt = (t) => new Date(t).toISOString().slice(0, 10);
