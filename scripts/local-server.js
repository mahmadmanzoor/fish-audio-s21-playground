import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import tts from "../api/tts.js";
import voices from "../api/voices.js";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = join(fileURLToPath(new URL("../", import.meta.url)), "public");
const FILES = new Map([
  ["/", "index.html"],
  ["/lab", "lab.html"],
  ["/lab/", "lab.html"],
  ["/guide", "guide.html"],
  ["/guide/", "guide.html"],
  ["/about", "about.html"],
  ["/about/", "about.html"],
  ["/use-cases", "use-cases.html"],
  ["/use-cases/", "use-cases.html"],
  ["/styles.css", "styles.css"],
  ["/site.js", "site.js"],
  ["/app.js", "app.js"],
]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

async function serveFile(request, response) {
  const filename = FILES.get(new URL(request.url, "http://localhost").pathname);
  if (!filename) return false;
  const body = await readFile(join(PUBLIC, filename));
  response.writeHead(200, {
    "Content-Type": TYPES[extname(filename)],
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
  return true;
}

async function runFunction(handler, request, response) {
  const url = `http://${request.headers.host || "127.0.0.1"}${request.url}`;
  const webRequest = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : Readable.toWeb(request),
    duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
  });
  const result = await handler.fetch(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  if (result.body) Readable.fromWeb(result.body).pipe(response);
  else response.end();
}

export function createApp() {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/api/voices") return runFunction(voices, request, response);
      if (pathname === "/api/tts") return runFunction(tts, request, response);
      if (request.method === "GET" && (await serveFile(request, response))) return;
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Not found." }));
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Local server error." }));
      } else {
        response.destroy();
      }
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, "127.0.0.1", () => {
    console.log(`Signal Tank: http://127.0.0.1:${PORT}`);
  });
}
