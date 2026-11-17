/* =========================================================================
   DexGEO — pdftext.js
   Extração de texto de PDF no navegador com o MuPDF (WebAssembly), o mesmo
   motor usado pelo PyMuPDF. Reproduz exatamente:
     page.get_text("text", sort=True)   (PyMuPDF 1.28)
   ou seja: TextPage com flags TEXTFLAGS_TEXT → extractWORDS → sort_words →
   get_sorted_text. Assim o texto entregue ao analyzer é o mesmo do servidor.
   ========================================================================= */

import { pyRound } from "./analyzer.js";

// pymupdf.TEXTFLAGS_TEXT = PRESERVE_LIGATURES | PRESERVE_WHITESPACE | MEDIABOX_CLIP | USE_CID_FOR_UNKNOWN_UNICODE
const STEXT_OPTIONS = "preserve-ligatures,preserve-whitespace,clip,use-cid-for-unknown-unicode";
const FLT_EPSILON = 1.1920928955078125e-7;
const f32 = Math.fround;
const TOLERANCE = 3;

// ---------- retângulos (semântica fz_rect / pymupdf.Rect) ----------
const EMPTY = () => ({ x0: 2147483520, y0: 2147483520, x1: -2147483648, y1: -2147483648 });
const isEmpty = (r) => r.x0 >= r.x1 || r.y0 >= r.y1;   // fz_is_empty_rect / Rect.is_empty
const isValid = (r) => r.x0 <= r.x1 && r.y0 <= r.y1;    // fz_is_valid_rect
const fzUnion = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
function unionRect(a, b) { // fz_union_rect: ignora apenas retângulos inválidos (largura zero conta)
  if (!isValid(b)) return a;
  if (!isValid(a)) return b;
  return fzUnion(a, b);
}
function includeRect(a, b) { // pymupdf.Rect.include_rect
  if (isEmpty(b)) return a;
  if (isEmpty(a)) return b;
  return fzUnion(a, b);
}
const rectFromQuad = (q) => ({ // fz_rect_from_quad; quad = [ulx,uly,urx,ury,llx,lly,lrx,lry]
  x0: Math.min(q[0], q[2], q[4], q[6]), y0: Math.min(q[1], q[3], q[5], q[7]),
  x1: Math.max(q[0], q[2], q[4], q[6]), y1: Math.max(q[1], q[3], q[5], q[7]),
});
const width = (r) => Math.max(0, r.x1 - r.x0);
const height = (r) => Math.max(0, r.y1 - r.y0);
const pyLen = (s) => { let n = 0; for (const _ of s) n++; return n; };
const repeatNl = (n) => (n > 0 ? "\n".repeat(n) : "");

// ---------- JM_char_quad (correção de ascendente/descendente) ----------
function transformQuad(q, m) { // fz_transform_point em float32, operação por operação
  const out = new Array(8);
  for (let i = 0; i < 8; i += 2) {
    const x = q[i], y = q[i + 1];
    out[i] = f32(f32(f32(x * m[0]) + f32(y * m[2])) + m[4]);
    out[i + 1] = f32(f32(f32(x * m[1]) + f32(y * m[3])) + m[5]);
  }
  return out;
}
/** Recupera o valor float32 da métrica da fonte (unidades/EM) a partir do quad. */
function snapMetric(v) {
  for (const upm of [1000, 2048, 1024, 4096, 256, 512, 2000, 2400, 1200]) {
    const k = Math.round(v * upm);
    if (Math.abs(k / upm - v) < 5e-6) return f32(k / upm);
  }
  return f32(v);
}
function charQuad(line, ch) {
  if (line.wmode) return ch.quad;
  const [ox, oy] = ch.origin;
  const size = ch.size;
  const [c, s] = line.dir;
  // O MuPDF monta o quad com o ascendente/descendente da fonte; recuperamos esses
  // valores do próprio quad (a API JS não os expõe diretamente).
  const local = transformQuad(transformQuad(ch.quad, [1, 0, 0, 1, -ox, -oy]), [c, -s, s, c, 0, 0]);
  const top = Math.min(local[1], local[3]), bottom = Math.max(local[5], local[7]);
  let asc = size ? snapMetric(-top / size) : f32(0.8);
  let dsc = size ? snapMetric(-bottom / size) : f32(-0.2);
  let asc_dsc = f32(f32(asc - dsc) + FLT_EPSILON);
  if (asc_dsc >= 1) return ch.quad; // "no problem"

  if (asc < 1e-3) { dsc = f32(-0.1); asc = f32(0.9); asc_dsc = f32(1.0); }
  if (asc_dsc < 1) { dsc = f32(dsc / asc_dsc); asc = f32(asc / asc_dsc); }
  asc_dsc = f32(asc - dsc);
  asc = f32(f32(asc * size) / asc_dsc);
  dsc = f32(f32(dsc * size) / asc_dsc);

  const trm1 = [c, -s, s, c, 0, 0], trm2 = [c, s, -s, c, 0, 0];
  if (c === -1) { trm1[3] = 1; trm2[3] = 1; }
  let q = transformQuad(ch.quad, [1, 0, 0, 1, -ox, -oy]);
  q = transformQuad(q, trm1);
  if (c === 1 && q[1] > 0) { q[1] = asc; q[3] = asc; q[5] = dsc; q[7] = dsc; }
  else { q[1] = -asc; q[3] = -asc; q[5] = -dsc; q[7] = -dsc; }
  if (q[4] < 0) { q[4] = 0; q[0] = 0; }
  const cwidth = f32(q[6] - q[4]);
  if (cwidth < FLT_EPSILON && ch.font) {
    try {
      const glyph = ch.font.encodeCharacter(ch.c);
      if (glyph) {
        const fwidth = ch.font.advanceGlyph(glyph, line.wmode);
        q[6] = f32(q[4] + f32(fwidth * size));
        q[2] = q[6];
      }
    } catch { /* fonte sem a função: mantém largura */ }
  }
  q = transformQuad(q, trm2);
  return transformQuad(q, [1, 0, 0, 1, ox, oy]);
}
function charBBox(line, ch) {
  const r = rectFromQuad(charQuad(line, ch));
  if (!line.wmode) return r;
  if (r.y1 < r.y0 + ch.size) r.y0 = r.y1 - ch.size;
  return r;
}
const rectsOverlap = (a, b) => !(a.x0 >= b.x1 || a.y0 >= b.y1 || a.x1 <= b.x0 || a.y1 <= b.y0);
const isDelimiter = (c) => c <= 32 || c === 160 || (c >= 0x202a && c <= 0x202e);
const isRtl = (c) => !(c < 0x590 || c > 0x900);

// ---------- extractWORDS ----------
function extractWords(stext, tpRect) {
  const out = [];
  let line = null;
  let buff = "", wbbox = EMPTY(), lastRtl = 0;
  const flush = () => { out.push({ r: wbbox, t: buff }); wbbox = EMPTY(); };
  stext.walk({
    beginTextBlock() { wbbox = EMPTY(); },
    beginLine(bbox, wmode, dir) { line = { wmode, dir }; buff = ""; lastRtl = 0; },
    onChar(chStr, origin, font, size, quad) {
      const c = chStr.codePointAt(0);
      const ch = { c, origin, font, size, quad };
      const cbbox = charBBox(line, ch);
      if (!rectsOverlap(tpRect, cbbox)) return;
      if (buff.length === 0 && c === 0x200d) return;
      const delim = isDelimiter(c);
      const rtl = isRtl(c) ? 1 : 0;
      if (delim || rtl !== lastRtl) {
        if (buff.length === 0 && delim) return;
        if (!isEmpty(wbbox)) flush();
        buff = "";
        if (delim) return;
      }
      buff += c >= 0xd800 && c <= 0xdfff ? "\ufffd" : String.fromCodePoint(c);
      lastRtl = rtl;
      wbbox = unionRect(wbbox, cbbox);
    },
    endLine() {
      if (buff.length && !isEmpty(wbbox)) flush();
      buff = "";
    },
  });
  return out;
}

// ---------- sort_words (get_text_words com sort=True) ----------
function sortWords(words) {
  const ws = words.map((w, i) => ({ ...w, i }));
  ws.sort((a, b) => (a.r.y1 - b.r.y1) || (a.r.x0 - b.r.x0) || (a.i - b.i));
  ws.forEach((w, k) => { w.i = k; }); // desempate = ordem de inserção (sort estável do Python)
  const result = [];
  let line = [ws[0]];
  let lrect = ws[0].r;
  const flushLine = () => { line.sort((a, b) => (a.r.x0 - b.r.x0) || (a.i - b.i)); result.push(...line); };
  for (const w of ws.slice(1)) {
    if (Math.abs(w.r.y0 - lrect.y0) <= TOLERANCE || Math.abs(w.r.y1 - lrect.y1) <= TOLERANCE) {
      line.push(w); lrect = includeRect(lrect, w.r);
    } else {
      flushLine(); line = [w]; lrect = w.r;
    }
  }
  flushLine();
  return result.map((w, i) => ({ r: w.r, t: w.t, i }));
}

// ---------- get_sorted_text ----------
function lineText(clip, line) {
  line.sort((a, b) => (a.r.x0 - b.r.x0) || (a.i - b.i));
  let ltext = "";
  let x1 = clip.x0;
  for (const { r, t } of line) {
    const dist = Math.max(
      pyRound(((r.x0 - x1) / width(r)) * pyLen(t)),
      x1 === clip.x0 || r.x0 <= x1 ? 0 : 1,
    );
    ltext += " ".repeat(Math.max(0, dist)) + t;
    x1 = r.x1;
  }
  return ltext;
}
function sortedText(words) {
  if (!words.length) return "";
  words = sortWords(words);
  let totalbox = EMPTY();
  for (const w of words) totalbox = includeRect(totalbox, w.r);
  const lines = [];
  let line = [words[0]];
  let lrect = words[0].r;
  for (const w of words.slice(1)) {
    if (Math.abs(lrect.y0 - w.r.y0) <= TOLERANCE || Math.abs(lrect.y1 - w.r.y1) <= TOLERANCE) {
      line.push(w); lrect = includeRect(lrect, w.r);
    } else {
      lines.push({ r: lrect, t: lineText(totalbox, line), i: lines.length });
      line = [w]; lrect = w.r;
    }
  }
  lines.push({ r: lrect, t: lineText(totalbox, line), i: lines.length });
  lines.sort((a, b) => (a.r.y1 - b.r.y1) || (a.i - b.i));
  let text = lines[0].t;
  let y1 = lines[0].r.y1;
  for (const l of lines.slice(1)) {
    const distance = Math.min(pyRound((l.r.y0 - y1) / height(l.r)), 5);
    text += repeatNl(distance + 1) + l.t;
    y1 = l.r.y1;
  }
  return text;
}

// ---------- API pública ----------
export class PdfError extends Error {}

/**
 * Lê o PDF e devolve { text, pages } exatamente como o server.py fazia.
 * @param {object} mupdf  módulo mupdf.js já carregado
 * @param {ArrayBuffer|Uint8Array} data
 * @param {{maxPages?: number}} opts
 */
export function extractPdfText(mupdf, data, { maxPages = 50 } = {}) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(data instanceof Uint8Array ? data : new Uint8Array(data), "application/pdf");
  } catch (exc) {
    throw new PdfError(`Não foi possível ler esse PDF: ${exc?.message || exc}`);
  }
  try {
    if (doc.needsPassword()) throw new PdfError("Não foi possível ler esse PDF: o documento está protegido por senha.");
    const pages = doc.countPages();
    if (pages > maxPages) throw new PdfError(`Envie um documento com até ${maxPages} páginas.`);
    const chunks = [];
    for (let i = 0; i < pages; i++) chunks.push(pageText(doc, i));
    return { text: chunks.join("\n\n"), pages };
  } catch (exc) {
    if (exc instanceof PdfError) throw exc;
    throw new PdfError(`Não foi possível ler esse PDF: ${exc?.message || exc}`);
  } finally {
    try { doc.destroy?.(); } catch { /* ignore */ }
  }
}

function pageText(doc, index) {
  let page = doc.loadPage(index);
  // PyMuPDF extrai o texto com a rotação da página zerada temporariamente.
  try {
    const obj = page.getObject?.();
    if (obj) {
      const rot = obj.getInheritable("Rotate");
      const val = rot && !rot.isNull() ? rot.asNumber() : 0;
      if (((val % 360) + 360) % 360 !== 0) {
        obj.put("Rotate", 0);
        page = doc.loadPage(index);
      }
    }
  } catch { /* não-PDF ou sem rotação */ }
  const tpRect = page.getBounds();
  const stext = page.toStructuredText(STEXT_OPTIONS);
  const r = { x0: tpRect[0], y0: tpRect[1], x1: tpRect[2], y1: tpRect[3] };
  const words = extractWords(stext, r);
  try { stext.destroy?.(); page.destroy?.(); } catch { /* ignore */ }
  return sortedText(words);
}

// Uso interno (testes de paridade)
export const _internal = { extractWords, sortWords, sortedText, STEXT_OPTIONS };
