// Compara Python (PyMuPDF + analyzer.py) x JS (MuPDF WASM + pdftext.js + analyzer.js)
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as mupdf from "../public/vendor/mupdf-1.28.1/mupdf.js";
import { extractPdfText } from "../public/pdftext.js";
import { analyze } from "../public/analyzer.js";

const PY = process.env.PYTHON || "python3";
const dir = process.argv[2];
const cases = process.env.QUICK ? [["porcelanato", ""]] : [["", ""], ["porcelanato", ""], ["Qual porcelanato usar em área externa?", "Deca|Portinari|Inmetro"]];
let ok = 0, fail = 0;
for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".pdf")).sort()) {
  const file = path.join(dir, f);
  for (const [topic, brands] of cases) {
    const ref = JSON.parse(execFileSync(PY, ["-W", "ignore", "tests/ref.py", file, topic, brands], { encoding: "utf8", maxBuffer: 1 << 28 }));
    let js = {};
    try {
      const { text, pages } = extractPdfText(mupdf, readFileSync(file));
      js.text = text;
      if (text.trim().length < 100) js.error = "Não foi encontrado texto selecionável suficiente. Este PDF pode ser digitalizado; use OCR antes da análise.";
      else js.res = analyze(text, { topic, brands: brands ? brands.split("|") : null, filename: f, page_count: pages });
    } catch (e) { js.error = String(e.message); }
    const strip = (r) => (r ? JSON.stringify({ ...r, data_utc: 0 }) : "");
    if (ref.error && js.error && !ref.text) { ok++; console.log(`• ${f}: erro nos dois — py: ${ref.error.slice(0, 70)} | js: ${js.error.slice(0, 70)}`); continue; }
    const sameText = (ref.text ?? "") === (js.text ?? "");
    const sameRes = strip(ref.res) === strip(js.res) && (ref.error || "") === (js.error || "");
    if (sameText && sameRes) ok++; else {
      fail++;
      console.log(`✗ ${f} [${topic}] text=${sameText} res=${sameRes} score py=${ref.res?.score} js=${js.res?.score}`);
      if (!sameText && ref.text && js.text) {
        let i = 0; while (i < ref.text.length && ref.text[i] === js.text[i]) i++;
        console.log("   py:", JSON.stringify(ref.text.slice(Math.max(0, i - 60), i + 60)));
        console.log("   js:", JSON.stringify(js.text.slice(Math.max(0, i - 60), i + 60)));
      }
      if (sameText && !sameRes) {
        const a = JSON.parse(strip(ref.res)), b = JSON.parse(strip(js.res));
        for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log("   campo", k, JSON.stringify(a[k]).slice(0, 300), "\n   js   ", JSON.stringify(b[k]).slice(0, 300));
        if (ref.error !== js.error) console.log("   erro py/js:", ref.error, "|", js.error);
      }
    }
  }
}
console.log(`\nIguais: ${ok}  Diferentes: ${fail}`);
process.exit(fail ? 1 : 0);
