// Seesaw licence tool.   npm run licence            -> show status
//   Owner only:  npm run licence -- keygen          (once)      npm run licence -- issue --licensee "Name" --days 365   [--out file]
import { checkLicence, keygen, issue, fmt, TRIAL_DAYS, PUBLIC_KEY_FILE, PRIVATE_KEY_FILE } from "./licence-lib.mjs";
const [cmd = "status", ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : undefined; };
try {
  if (cmd === "keygen") {
    keygen({ force: rest.includes("--force") });
    console.log("Done.\n  Private key (SECRET, stays on your computer, git-ignored): " + PRIVATE_KEY_FILE + "\n  Public key (safe to share and commit):                    " + PUBLIC_KEY_FILE +
      "\n\nBack up the private key somewhere safe (not Git, not email). Commit the public key so every copy of Seesaw can check your licences.");
  } else if (cmd === "issue") {
    const r = issue({ licensee: opt("licensee"), days: opt("days"), expires: opt("expires"), out: opt("out") });
    console.log("Licence written: " + r.file + "\nValid until " + fmt(r.expires) + ". Send that file to the licensee; they put it in app/licence/ and restart Seesaw.");
  } else {
    const s = checkLicence(Date.now(), { write: false });
    console.log(s.status === "licensed" ? "Licensed to " + (s.licensee || "(unnamed)") + " until " + fmt(s.expires) + " (" + s.daysLeft + " days left)."
      : s.status === "trial" ? "Evaluation: " + s.daysLeft + " days left of " + TRIAL_DAYS + " (ends " + fmt(s.expires) + ")."
      : "Evaluation ended on " + fmt(s.expires) + ". A licence is needed to keep using Seesaw (see docs/legal/LICENSE).");
    if (s.licenceProblem && s.licenceProblem !== "none") console.log("Note: licence file not accepted (" + s.licenceProblem + ").");
  }
} catch (e) { console.error("Error: " + e.message); process.exit(1); }
