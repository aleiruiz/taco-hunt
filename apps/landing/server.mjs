import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { extname, resolve, sep } from "node:path";
const root = resolve(".");
const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml" };
createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const file = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file)
    .on("error", () => res.writeHead(404).end("No encontrado"))
    .pipe(res);
}).listen(4173, "0.0.0.0", () => console.log("Landing lista en http://localhost:4173"));
