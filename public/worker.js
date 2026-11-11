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

self.onmessage = async (ev) => {
  const { id, type } = ev.data || {};
  try {
    if (type === "warmup") { await loadMupdf(); self.postMessage({ id, ok: true }); return; }
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
    res.usuario = { nome: pyStrip(user_name || ""), area: pyStrip(user_area || "") };
    self.postMessage({ id, ok: true, result: res, context: documentContext(text) });
  } catch (err) {
    const msg = err?.message === "LOAD_FAILED"
      ? "Não foi possível carregar o leitor de PDF. Verifique sua conexão e recarregue a página."
      : err instanceof PdfError ? err.message : `Não foi possível ler esse PDF: ${err?.message || err}`;
    self.postMessage({ id, ok: false, error: msg });
  }
};
