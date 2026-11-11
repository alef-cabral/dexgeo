// POST /api/registro — recebe eventos de uso do aplicativo (acesso, análise, download).
// O PDF nunca é enviado: apenas identificação (nome/área) e o resultado da análise.
import { usageStore, json, clip } from "../lib/store.mjs";

const TIPOS = new Set(["acesso", "analise", "download"]);
const MAX_BYTES = 400 * 1024;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function sanitizeMarcas(m) {
  const out = {};
  if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m).slice(0, 30)) {
      const n = num(v);
      if (n !== null) out[clip(k, 40)] = Math.max(0, Math.round(n));
    }
  }
  return out;
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ erro: "Registro muito grande" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ erro: "JSON inválido" }, 400); }

  const tipo = clip(body.tipo, 20);
  const nome = clip(body.nome, 80);
  const area = clip(body.area, 80);
  if (!TIPOS.has(tipo) || nome.length < 2 || area.length < 2) return json({ erro: "Dados incompletos" }, 400);

  const ts = new Date().toISOString();
  const id = `${ts.replace(/[-:.TZ]/g, "")}-${Math.random().toString(36).slice(2, 10)}`;
  const resumo = {
    id, tipo, ts, nome, area,
    sessao: clip(body.sessao, 40),
    dispositivo: clip(body.dispositivo, 20),
  };

  const store = usageStore(context);

  if (tipo === "analise") {
    const r = body.resultado;
    if (!r || typeof r !== "object" || !r.metricas || !r.pontuacoes) return json({ erro: "Resultado ausente" }, 400);
    Object.assign(resumo, {
      arquivo: clip(r.arquivo, 160),
      score: num(r.score),
      faixa: clip(r.faixa, 80),
      perfil: clip(r.intencao_de_marca, 80),
      palavras: num(r.metricas.palavras),
      paginas: num(r.metricas.paginas),
      marcas: sanitizeMarcas(r.metricas.marcas_detectadas),
      melhorias: Array.isArray(r.melhorias) ? r.melhorias.length : null,
    });
    const contexto = body.contexto && typeof body.contexto === "object"
      ? { titulo: clip(body.contexto.titulo, 200), termo: clip(body.contexto.termo, 60) }
      : {};
    await store.setJSON(`r/${id}`, { resultado: r, contexto });
  } else if (tipo === "download") {
    Object.assign(resumo, { formato: clip(body.formato, 10), arquivo: clip(body.arquivo, 160) });
  }

  await store.setJSON(`s/${id}`, resumo);
  return json({ ok: true, id }, 201);
};

export const config = { path: "/api/registro" };
