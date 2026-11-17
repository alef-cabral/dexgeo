// Converte o HTML de uma página publicada em texto estruturado para o analisador do DexGEO.
// 1) Isola o conteúdo principal com o Mozilla Readability (mesmo motor do "Modo leitura" do Firefox),
//    descartando menu, cabeçalho, rodapé, barra lateral, banners e botões de compartilhamento.
// 2) Gera texto no mesmo formato que o leitor de PDF entrega ao analisador:
//    títulos e parágrafos em blocos separados por linha em branco, itens de lista um por linha.
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "PRE", "BLOCKQUOTE",
  "DIV", "SECTION", "ARTICLE", "MAIN", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "HEADER", "FOOTER", "ASIDE", "NAV", "FORM", "HR", "DETAILS", "SUMMARY"]);
const DROP = "script,style,noscript,template,svg,canvas,iframe,object,embed,button,input,select,textarea,video,audio";
const BOILERPLATE = "nav,header,footer,aside,form,[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[aria-hidden=true]," +
  "[class*=cookie],[id*=cookie],[class*=share],[class*=social],[class*=newsletter],[class*=breadcrumb],[class*=related],[class*=comment],[class*=sidebar]";
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|twitter\.com|x\.com|t\.co|linkedin\.com|whatsapp\.com|wa\.me|pinterest\.[a-z.]+|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|t\.me|telegram\.me|reddit\.com)$/i;

const ws = (s) => String(s || "").replace(/[\s ]+/g, " ").trim();
const host = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/** Texto "inline" de um elemento: preserva <br> como quebra de linha e ignora listas/tabelas aninhadas. */
function inlineText(el, skipNested = false) {
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.nodeType === 1) {
      if (n.tagName === "BR") out += "\n";
      else if (skipNested && (n.tagName === "UL" || n.tagName === "OL" || n.tagName === "TABLE")) continue;
      else out += inlineText(n, skipNested);
    }
  }
  return out;
}
const cleanInline = (s) => s.split("\n").map(ws).filter(Boolean).join("\n");

function collectBlocks(root) {
  const blocks = [];
  const pushPara = (t) => { t = cleanInline(t); if (t) blocks.push(t); };
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (ws(n.textContent)) pushPara(n.textContent); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (/^H[1-6]$/.test(tag) || tag === "P" || tag === "FIGCAPTION" || tag === "DT" || tag === "DD" || tag === "SUMMARY") {
        pushPara(inlineText(n));
      } else if (tag === "UL" || tag === "OL") {
        const items = [];
        let i = 0;
        for (const li of n.children) {
          if (li.tagName !== "LI") continue;
          i++;
          const t = ws(inlineText(li, true));
          if (t) items.push(`${tag === "OL" ? `${i}.` : "•"} ${t}`);
          for (const sub of li.children) if (sub.tagName === "UL" || sub.tagName === "OL") {
            for (const sli of sub.children) { const st = ws(inlineText(sli, true)); if (st) items.push(`• ${st}`); }
          }
        }
        if (items.length) blocks.push(items.join("\n"));
      } else if (tag === "TABLE") {
        const rows = [];
        for (const tr of n.querySelectorAll("tr")) {
          const cells = [...tr.children].filter((c) => c.tagName === "TD" || c.tagName === "TH").map((c) => ws(c.textContent)).filter(Boolean);
          if (cells.length) rows.push(cells.join(" | "));
        }
        if (rows.length) blocks.push(rows.join("\n"));
      } else if (tag === "PRE") {
        const t = n.textContent.trim(); if (t) blocks.push(t);
      } else if (tag === "HR") {
        continue;
      } else if (BLOCK.has(tag) || [...n.children].some((c) => BLOCK.has(c.tagName))) {
        // contêiner: se tiver só conteúdo inline, vira parágrafo; senão, desce
        if (![...n.children].some((c) => BLOCK.has(c.tagName))) pushPara(inlineText(n));
        else walk(n);
      } else {
        pushPara(inlineText(n)); // elemento inline solto (span, a, strong...)
      }
    }
  };
  walk(root);
  // junta textos inline soltos consecutivos que foram quebrados em pedaços
  return blocks;
}

function externalLinks(root, baseUrl) {
  const base = new URL(baseUrl);
  const seen = new Set();
  const out = [];
  for (const a of root.querySelectorAll("a[href]")) {
    let u;
    try { u = new URL(a.getAttribute("href"), base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const h = host(u.hostname);
    if (!h || h === host(base.hostname) || SOCIAL.test(h)) continue;
    u.hash = "";
    const k = u.href;
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

/**
 * @param {string} html
 * @param {string} url  endereço final da página (após redirecionamentos)
 * @returns {{titulo: string, texto: string, links_externos: string[], metodo: string, idioma: string}}
 */
export function htmlToText(html, url) {
  const { document } = parseHTML(html);
  document.querySelectorAll(DROP).forEach((e) => e.remove());
  const idioma = document.documentElement?.getAttribute("lang") || "";
  const metaTitle = ws(document.querySelector('meta[property="og:title"]')?.getAttribute("content") || document.querySelector("title")?.textContent || "");
  const h1 = ws(document.querySelector("h1")?.textContent || "");

  // Plano A: Readability (conteúdo principal, sem menus e laterais)
  let readRoot = null;
  try {
    const clone = parseHTML(document.toString()).document;
    const art = new Readability(clone, { charThreshold: 300, keepClasses: false }).parse();
    if (art?.content && ws(art.textContent).length >= 200) readRoot = parseHTML(`<html><body>${art.content}</body></html>`).document.body;
  } catch { /* segue para o plano B */ }

  // Plano B: contêiner semântico da página (<main>, <article>...) sem blocos repetitivos
  const semDoc = parseHTML(document.toString()).document;
  const articles = [...semDoc.querySelectorAll("article")].sort((x, y) => ws(y.textContent).length - ws(x.textContent).length);
  const semRoot = articles[0] || semDoc.querySelector("main, [role=main], #content, .content, .post, .entry-content") || semDoc.body;
  semRoot.querySelectorAll(BOILERPLATE).forEach((e) => e.remove());

  // Usa o Readability, exceto quando ele descarta parte relevante do conteúdo (ex.: tabelas e FAQ de produto)
  const lenRead = readRoot ? ws(readRoot.textContent).length : 0;
  const lenSem = ws(semRoot?.textContent || "").length;
  const semIsSpecific = semRoot && semRoot !== semDoc.body;
  let root, metodo;
  if (readRoot && !(semIsSpecific && lenSem > lenRead * 1.25)) { root = readRoot; metodo = "readability"; }
  else { root = semRoot; metodo = semIsSpecific ? "conteudo-principal" : "pagina-inteira"; }

  const blocks = collectBlocks(root);
  const titulo = h1 || metaTitle;
  // o Readability pode remover/rebaixar o H1: garante o título como primeiro bloco
  if (titulo && ws(blocks[0] || "").toLowerCase() !== titulo.toLowerCase()) {
    const idx = blocks.findIndex((b) => ws(b).toLowerCase() === titulo.toLowerCase());
    if (idx > 0 && idx < 3) blocks.splice(idx, 1);
    blocks.unshift(titulo);
  }
  const texto = blocks.join("\n\n").slice(0, 400_000);
  return { titulo, texto, links_externos: externalLinks(root, url).slice(0, 200), metodo, idioma };
}
