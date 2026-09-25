// Kleiner Vorschau-Server ohne Abhängigkeiten:  node tools/serve.mjs [Port] [--open]   →  http://localhost:4173
// Er liefert die Website aus und setzt dieselben Sicherheits-Header wie in der Datei _headers (Block „/*“) – so fallen
// Verstöße gegen die Content-Security-Policy schon in der Vorschau auf (Konsole des Browsers).
// Mit --open öffnet sich zusätzlich der Standardbrowser (Doppelklick auf Vorschau-starten.cmd unter Windows bzw. Vorschau-starten.command auf dem Mac).
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 4173);
const openBrowser = args.includes("--open");

function open(url) {
  const [command, ...rest] =
    process.platform === "win32" ? ["cmd", "/c", "start", "", url] : process.platform === "darwin" ? ["open", url] : ["xdg-open", url];
  spawn(command, rest, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

/** Liest den Block „/*“ aus _headers (ohne HSTS, das über http wirkungslos ist). */
function securityHeaders() {
  const file = path.join(root, "_headers");
  if (!fs.existsSync(file)) return {};
  const headers = {};
  let inBlock = false;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\S/.test(line) && !line.startsWith("#")) inBlock = line.trim() === "/*";
    else if (inBlock && /^\s+[\w-]+:/.test(line)) {
      const [name, ...rest] = line.trim().split(":");
      if (name.toLowerCase() !== "strict-transport-security") headers[name] = rest.join(":").trim();
    }
  }
  return headers;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  let file = path.join(root, pathname);
  let status = 200;

  const inside = file.startsWith(root + path.sep) || file === root;
  if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, "404.html");
    status = 404;
  }

  response.writeHead(status, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    ...securityHeaders(),
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(file).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} ist schon belegt – läuft die Vorschau bereits? Dann einfach http://localhost:${port} öffnen.`);
    console.error(`Oder einen anderen Port wählen:  node tools/serve.mjs ${port + 1}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://localhost:${port}`;
  console.log(`VereinsFlow-Website: ${url}   (Beenden mit Strg+C)`);
  if (openBrowser) open(url);
});
