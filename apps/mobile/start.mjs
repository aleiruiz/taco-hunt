import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const appRoot = dirname(fileURLToPath(import.meta.url));
const expoCli = resolve(appRoot, "node_modules/expo/bin/cli");
const args = process.argv.slice(2);
const portFlagIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
const portEqualsArg = args.find((arg) => arg.startsWith("--port="));
const hasPort = portFlagIndex >= 0 || Boolean(portEqualsArg);
let port =
  portFlagIndex >= 0
    ? Number(args[portFlagIndex + 1])
    : portEqualsArg
      ? Number(portEqualsArg.slice("--port=".length))
      : 0;
if (hasPort && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error("The supplied Metro port must be an integer from 1 to 65535");
}
if (!port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not select a Metro port");
  port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  args.push("--port", String(port));
}
console.log(`Taco Hunt Metro port: ${port}`);
const result = spawnSync(process.execPath, [expoCli, "start", ...args], {
  cwd: appRoot,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
