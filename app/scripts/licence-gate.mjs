// Shared by `npm start` and `npm run tunnel`: refuse to start when the evaluation has ended; otherwise tell wrangler the end date.
import { checkLicence, fmt, TRIAL_DAYS } from "./licence-lib.mjs";
export const licenceVars = (s) => ["--var", `LICENSE_EXPIRES:${new Date(s.expires).toISOString()}`, "--var", `LICENSE_KIND:${s.status}`];
export function gate() {
  const s = checkLicence();
  if (s.status === "expired") {
    console.error("\n  ==========================================================\n   Seesaw: the " + TRIAL_DAYS + "-day evaluation ended on " + fmt(s.expires) + ".\n   To keep using Seesaw you need a licence from the copyright holder\n   (see docs/legal/LICENSE). Put the licence file in app/licence/ and start again.\n  ==========================================================\n");
    process.exit(2);
  }
  console.log("\n  Seesaw " + (s.status === "licensed" ? "licensed to " + (s.licensee || "-") + " until " + fmt(s.expires) : "evaluation: " + s.daysLeft + " days left (until " + fmt(s.expires) + ")") + (s.clockWoundBack ? "  [your computer clock looks wrong]" : "") + "\n");
  return s;
}
