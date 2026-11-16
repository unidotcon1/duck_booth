// `npm start`: checks the Seesaw licence, then starts the booth.
import { spawn } from "node:child_process";
import { root } from "./licence-lib.mjs";
import { gate, licenceVars } from "./licence-gate.mjs";
const s = gate(), win = process.platform === "win32";
const p = spawn(win ? "npx.cmd" : "npx", ["wrangler", "dev", "--ip", "0.0.0.0", "--persist-to", "photobooth-data", ...licenceVars(s)], { cwd: root, shell: win, stdio: "inherit" });
p.on("exit", (c) => process.exit(c || 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => p.kill(sig));
