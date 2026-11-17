// POST /api/extrair-url  { url }  →  { url, titulo, texto, links_externos, metodo }
// Busca uma página publicada e devolve o texto do conteúdo principal para o analisador.
// Proteções: apenas http/https nas portas padrão, bloqueio de endereços internos/privados
// (inclusive após redirecionamentos), tempo máximo e tamanho máximo de resposta.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { htmlToText } from "../lib/html-text.mjs";
import { json } from "../lib/store.mjs";

const TIMEOUT_MS = 9000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 DexGEO/1.0";

class UserError extends Error { constructor(msg, status = 422) { super(msg); this.status = status; } }

function isPrivateIp(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new UserError("Use um link que comece com http:// ou https://.", 400);
  if (u.username || u.password) throw new UserError("Links com usuário e senha não são aceitos.", 400);
  if (process.env.DEXGEO_ALLOW_PRIVATE === "1") return; // apenas para testes locais (npm run dev)
  if (u.port && !["80", "443"].includes(u.port)) throw new UserError("Use um link na porta padrão (sem :porta no endereço).", 400);
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(h)) throw new UserError("Esse endereço não é público.", 400);
  let addrs;
  try { addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true }); }
  catch { throw new UserError("Não encontramos esse endereço. Confira se o link está correto.", 400); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new UserError("Esse endereço não é público.", 400);
}

async function readLimited(resp) {
  const reader = resp.body.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { reader.cancel(); throw new UserError("A página é grande demais para análise (limite de 5 MB de HTML)."); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return buf;
}

function decode(buf, contentType) {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try { return new TextDecoder((charset || "utf-8").toLowerCase()).decode(buf); }
  catch { return new TextDecoder("utf-8").decode(buf); }
}

async function fetchPage(rawUrl) {
  let u;
  try { u = new URL(rawUrl.trim()); } catch { throw new UserError("Link inválido. Cole o endereço completo, começando com https://.", 400); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await assertPublic(u);
      let resp;
      try {
        resp = await fetch(u, {
          redirect: "manual", signal: ctrl.signal,
          headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "pt-BR,pt;q=0.9,en;q=0.6" },
        });
      } catch (e) {
        if (e.name === "AbortError") throw new UserError("A página demorou demais para responder. Tente novamente.", 504);
        throw new UserError("Não foi possível acessar a página. Confira se o link está correto e é público.", 502);
      }
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const loc = resp.headers.get("location");
        if (!loc) throw new UserError("A página redirecionou para um endereço inválido.", 502);
        u = new URL(loc, u);
        continue;
      }
      if (resp.status === 401 || resp.status === 403) throw new UserError("A página bloqueou o acesso (pode exigir login ou bloquear leitura automática).", 422);
      if (resp.status === 404) throw new UserError("Página não encontrada (erro 404). Confira o link.", 422);
      if (!resp.ok) throw new UserError(`A página respondeu com erro ${resp.status}.`, 502);
      const ct = resp.headers.get("content-type") || "";
      if (/application\/pdf/i.test(ct)) throw new UserError("Esse link é de um arquivo PDF. Baixe o arquivo e envie pela opção PDF.", 422);
      if (ct && !/text\/html|application\/xhtml/i.test(ct)) throw new UserError("O link não aponta para uma página web (HTML).", 422);
      const html = decode(await readLimited(resp), ct);
      return { html, finalUrl: u.href };
    }
    throw new UserError("A página fez redirecionamentos demais.", 502);
  } finally { clearTimeout(timer); }
}

export default async (req) => {
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  try {
    const { html, finalUrl } = await fetchPage(String(body?.url || "").slice(0, 2048));
    const out = htmlToText(html, finalUrl);
    return json({ url: finalUrl, ...out });
  } catch (e) {
    if (e instanceof UserError) return json({ erro: e.message }, e.status);
    return json({ erro: "Não foi possível ler essa página." }, 500);
  }
};

export const config = { path: "/api/extrair-url" };
