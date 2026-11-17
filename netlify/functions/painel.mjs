// API do painel administrativo (endereço e chave não aparecem no aplicativo público).
//   GET    /api/painel-rketn5webz8g/eventos              → lista de eventos (resumos)
//   GET    /api/painel-rketn5webz8g/relatorio?id=<id>     → resultado completo (para gerar o HTML)
//   DELETE /api/painel-rketn5webz8g/evento?id=<id>        → remove um evento
// Requer o cabeçalho  x-dexgeo-admin: <chave>.
// A chave pode ser trocada pela variável de ambiente DEXGEO_ADMIN_KEY no Netlify.
import { usageStore, json } from "../lib/store.mjs";

const DEFAULT_KEY = "pa64i8750aluuxy3l5penhjrhaardvg1v1dbqquw";
const BASE = "/api/painel-rketn5webz8g";

function authorized(req) {
  const expected = process.env.DEXGEO_ADMIN_KEY || DEFAULT_KEY;
  const got = req.headers.get("x-dexgeo-admin") || "";
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export default async (req, context) => {
  if (!authorized(req)) return json({ erro: "Não autorizado" }, 401);
  const url = new URL(req.url);
  const route = url.pathname.slice(BASE.length).replace(/\/+$/, "");
  const store = usageStore(context);

  if (req.method === "GET" && route === "/eventos") {
    const { blobs } = await store.list({ prefix: "s/" });
    const eventos = (await mapLimit(blobs, 25, (b) => store.get(b.key, { type: "json" }))).filter(Boolean);
    eventos.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return json({ eventos, total: eventos.length, gerado_em: new Date().toISOString() });
  }

  const id = (url.searchParams.get("id") || "").replace(/[^0-9a-z-]/gi, "");
  if (!id) return json({ erro: "id obrigatório" }, 400);

  if (req.method === "GET" && route === "/relatorio") {
    const data = await store.get(`r/${id}`, { type: "json" });
    return data ? json(data) : json({ erro: "Relatório não encontrado" }, 404);
  }

  if (req.method === "DELETE" && route === "/evento") {
    await store.delete(`s/${id}`);
    await store.delete(`r/${id}`);
    return json({ ok: true });
  }

  return json({ erro: "Rota não encontrada" }, 404);
};

export const config = { path: ["/api/painel-rketn5webz8g/eventos", "/api/painel-rketn5webz8g/relatorio", "/api/painel-rketn5webz8g/evento"] };
