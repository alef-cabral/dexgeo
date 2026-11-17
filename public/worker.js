/* DexGEO — worker.js
   Executa a leitura do PDF (MuPDF/WebAssembly) e a análise fora da thread da
   interface, reproduzindo o fluxo do antigo server.py (POST /api/analyze). */
import { analyze, documentContext, pyStrip, pyLen } from "./analyzer.js";
import { extractPdfText, PdfError } from "./pdftext.js";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_PAGES = 50;
const MIN_CHARS = 100;

let mupdfPromise = null;
const loadMupdf = () => (mupdfPromise ??= import("./vendor/mupdf-1.28.1/mupdf.js"));

// Página web: o texto já vem extraído pela função /api/extrair-url
function analyzePage({ id, url, titulo, text, links_externos, brands, user_name, user_area }) {
  try {
    if (pyLen(pyStrip(text || "")) < MIN_CHARS) {
      throw new PdfError("Não foi possível extrair texto suficiente desta página. Ela pode exigir login ou carregar o conteúdo apenas via JavaScript.");
    }
    const brandList = String(brands || "").split("\n").filter((b) => pyStrip(b));
    const res = analyze(text, { topic: "", brands: brandList.length ? brandList : null, filename: url, page_count: null, extra_urls: links_externos || [] });
    res.fonte = "url";
    res.url = url;
    res.titulo_pagina = titulo || "";
    res.usuario = { nome: pyStrip(user_name || ""), area: pyStrip(user_area || "") };
    self.postMessage({ id, ok: true, result: res, context: documentContext(text) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof PdfError ? err.message : `Não foi possível analisar a página: ${err?.message || err}` });
  }
}

self.onmessage = async (ev) => {
  const { id, type } = ev.data || {};
  try {
    if (type === "warmup") { await loadMupdf(); self.postMessage({ id, ok: true }); return; }
    if (type === "analyze-text") { analyzePage(ev.data); return; }
    const { name, buffer, topic, brands, user_name, user_area } = ev.data;
    if (!String(name || "").toLowerCase().endsWith(".pdf")) throw new PdfError("Envie um arquivo no formato PDF.");
    if (buffer.byteLength > MAX_BYTES) throw new PdfError("O limite é de 20 MB por arquivo.");
    let mupdf;
    try { mupdf = await loadMupdf(); }
    catch { throw new Error("LOAD_FAILED"); }
    const { text, pages } = extractPdfText(mupdf, buffer, { maxPages: MAX_PAGES });
    if (pyLen(pyStrip(text)) < MIN_CHARS) {
      throw new PdfError("Não foi encontrado texto selecionável suficiente. Este PDF pode ser digitalizado; use OCR antes da análise.");
    }
    const brandList = String(brands || "").split("\n").filter((b) => pyStrip(b));
    const res = analyze(text, { topic, brands: brandList.length ? brandList : null, filename: name, page_count: pages });
    res.fonte = "pdf";
    res.usuario = { nome: pyStrip(user_name || ""), area: pyStrip(user_area || "") };
    self.postMessage({ id, ok: true, result: res, context: documentContext(text) });
  } catch (err) {
    const msg = err?.message === "LOAD_FAILED"
      ? "Não foi possível carregar o leitor de PDF. Verifique sua conexão e recarregue a página."
      : err instanceof PdfError ? err.message : `Não foi possível ler esse PDF: ${err?.message || err}`;
    self.postMessage({ id, ok: false, error: msg });
  }
};
