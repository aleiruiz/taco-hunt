import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const appRoot = dirname(fileURLToPath(import.meta.url));
const binary = resolve(appRoot, "node_modules/.bin", process.platform === "win32" ? "expo.CMD" : "expo");
const result = spawnSync(binary, ["start", ...process.argv.slice(2)], {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
