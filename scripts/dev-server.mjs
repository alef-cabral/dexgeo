// Servidor local que simula o Netlify: arquivos de public/, Functions e Netlify Blobs.
// Uso: npm run dev  →  http://localhost:8888
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8888);
const BLOBS_PORT = PORT + 1;

const blobsDir = path.join(ROOT, ".netlify", "blobs-local");
await mkdir(blobsDir, { recursive: true });
const blobs = new BlobsServer({ directory: blobsDir, port: BLOBS_PORT, token: "local-token" });
await blobs.start();
const edge = `http://localhost:${BLOBS_PORT}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: "local-site", token: "local-token", edgeURL: edge, uncachedEdgeURL: edge })).toString("base64");

const fnModules = {
  registro: await import(path.join(ROOT, "netlify/functions/registro.mjs")),
  painel: await import(path.join(ROOT, "netlify/functions/painel.mjs")),
};
const routes = [];
for (const mod of Object.values(fnModules)) for (const p of [].concat(mod.config.path)) routes.push([p, mod.default]);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fn = routes.find(([p]) => p === url.pathname);
  if (fn) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const resp = await fn[1](request, { deploy: { context: "production" } });
    res.writeHead(resp.status, Object.fromEntries(resp.headers));
    res.end(Buffer.from(await resp.arrayBuffer()));
    return;
  }
  let file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404, { "content-type": "text/plain" }).end("Não encontrado"); }
}).listen(PORT, () => console.log(`DexGEO local em http://localhost:${PORT}  (painel: /painel-ppojsrd8gvv7q7/)`));
