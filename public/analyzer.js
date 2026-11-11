/* =========================================================================
   DexGEO — analyzer.js
   Port fiel de analyzer.py para JavaScript.
   Mesmas regras, pesos, textos e arredondamentos do Python, para que a nota
   calculada no navegador seja idêntica à da versão em Python.
   Auditoria heurística transparente — NÃO é preditor de ranqueamento em IA.
   ========================================================================= */

// ------------------------------------------------------------------------
// Compatibilidade Python → JavaScript
// ------------------------------------------------------------------------

// Caracteres considerados espaço por str.isspace()/\s do Python
const PY_WS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_WS_RE_TRIM = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "gu");
// \w do Python (Unicode): letras, números e "_"
const W_CLASS = "\\p{L}\\p{N}_";
const W = `[${W_CLASS}]`;
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;

/** Converte um padrão de regex do Python (módulo re, str) para JS com a mesma semântica Unicode. */
function pyPattern(src) {
  let out = "";
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      i++;
      if (n === "w") out += inClass ? W_CLASS : W;
      else if (n === "b") out += B; // \b não aparece dentro de classes nos padrões usados
      else if (n === "d") out += "\\p{Nd}";
      else if (n === "s") out += inClass ? PY_WS : `[${PY_WS}]`;
      else out += "\\" + n;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      out += c;
      continue;
    }
    if (c === "[") { inClass = true; out += c; continue; }
    if (c === ".") { out += "[^\\n]"; continue; } // "." do Python não casa apenas \n
    out += c;
  }
  return out;
}
const cache = new Map();
function rx(pattern, flags = "") {
  const key = pattern + "\u0000" + flags;
  if (!cache.has(key)) cache.set(key, new RegExp(pyPattern(pattern), flags + "u"));
  return cache.get(key);
}
const reSearch = (p, s, f = "") => rx(p, f).test(s);
const reFindall = (p, s, f = "") => [...s.matchAll(rx(p, f + "g"))].map((m) => m[0]);
const reSplit = (p, s, f = "") => s.split(rx(p, f));

const pyStrip = (s) => String(s).replace(PY_WS_RE_TRIM, "");
const pyLen = (s) => { let n = 0; for (const _ of s) n++; return n; };
const pySplitlines = (s) => {
  const parts = s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/u);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
};
const reEscape = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

/** round() do Python: arredondamento "half-even" sobre o valor binário exato. */
export function pyRound(x, nd = 0) {
  if (!Number.isFinite(x) || x === 0) return x;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const neg = hi >>> 31 === 1;
  const exp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (exp === 0) e = -1074; else { mant |= 1n << 52n; e = exp - 1075; }
  let num = mant * 10n ** BigInt(nd);
  let den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den;
  const r2 = 2n * (num % den);
  if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  let s = q.toString();
  let res;
  if (nd === 0) res = Number(s);
  else { s = s.padStart(nd + 1, "0"); res = Number(s.slice(0, -nd) + "." + s.slice(-nd)); }
  return neg ? -res : res;
}
/** str(float) do Python (ex.: 19.0 em vez de 19). */
const pyFloatStr = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/** Formato "{x:.0%}" do Python. */
const pyPct0 = (x) => `${pyRound(x * 100, 0)}%`;

// ------------------------------------------------------------------------
// Constantes (idênticas ao analyzer.py)
// ------------------------------------------------------------------------
export const WEIGHTS = {
  "Clareza e resposta objetiva": 20,
  "Cobertura e profundidade": 20,
  "Estrutura e escaneabilidade": 15,
  "Perguntas e intenção de busca": 15,
  "Confiabilidade e evidências": 15,
  "Linguagem e naturalidade": 10,
  "Marca e identificação": 5,
};
const WEIGHT_KEYS = Object.keys(WEIGHTS);
const QUESTION_WORDS = String.raw`(?:como|qual|quais|quando|onde|por\s+que|quanto|quantos|o\s+que|é\s+possível|vale\s+a\s+pena|pode|deve)`;
const COMP = String.raw`\b(comparad[oa]s?|diferenças?|versus|\bvs\.?\b|melhor|pior|vantagens?|desvantagens?|comparação|critérios?)\b`;
const EVIDENCE = String.raw`\b(segundo|conforme|fonte|referênci[ao]s?|estudo|pesquisa|norma(?:s)?|abnt|inmetro|ensaio|teste|laborat[oó]rio|metodologia|dados|relat[oó]rio|certificad[oa]|documentação|ficha técnica)\b`;
const SIGNALS = {
  numeric: String.raw`\b\d+(?:[,.]\d+)?\s*(?:%|mm|cm|m²|m2|kg|anos?|meses?|dias?|r\$|reais|n|mpa)\b`,
  examples: String.raw`\b(por exemplo|exemplos?|na prática|cenário|situação|caso de uso|aplicação|ambiente)\b`,
  limitations: String.raw`\b(depende|atenção|limitaç(?:ão|ões)|evite|não recomendado|restriç(?:ão|ões)|cuidado|exceto|porém|entretanto)\b`,
  action: String.raw`\b(para escolher|recomendamos|passo a passo|primeiro|em seguida|verifique|considere|avalie|confira|escolha|identifique|compare)\b`,
};
const STOPWORDS = new Set("a o as os e de do da dos das em no na nos nas um uma uns umas para por com que se ao aos à às é são ser foi mais menos como qual quais quando onde sobre até já muito também entre seu sua seus suas ele ela isso este esta esse essa pode podem".split(" "));
export const DEFAULT_BRANDS = ["Dexco", "Deca", "Portinari", "Ceusa", "Durafloor", "Duratex"];

// ------------------------------------------------------------------------
// Funções auxiliares (mesmos nomes do Python)
// ------------------------------------------------------------------------
const norm = (text) => String(text).toLowerCase().normalize("NFKD").replace(/\p{Mn}/gu, "");
const match = (pattern, text) => reSearch(pattern, text, "im");
const words = (text) => reFindall(String.raw`[\wÀ-ÿ]+(?:[-'][\wÀ-ÿ]+)*`, text);
const sentences = (text) => reSplit(String.raw`(?<=[.!?])\s+|\n{2,}`, text).map(pyStrip).filter((x) => pyLen(x) > 8);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const roundScore = (raw, weight) => pyRound(clamp(raw) * weight, 1);
const int = (b) => (b ? 1 : 0);
function finding(criteria, passed, reason, action, impact = "Média") {
  return { criterio: criteria, status: passed ? "Atendido" : "Melhorar", evidencia: reason, acao: action, impacto: impact };
}
function pyIsoNowUtc() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  const ms = d.getUTCMilliseconds();
  return `${base}${ms ? "." + p(ms * 1000, 6) : ""}+00:00`;
}

// ------------------------------------------------------------------------
// analyze() — espelho de analyzer.analyze
// ------------------------------------------------------------------------
export function analyze(text, { topic = "", brands = null, filename = "documento.pdf", page_count = null } = {}) {
  brands = (brands && brands.length ? brands : DEFAULT_BRANDS).map(pyStrip).filter(Boolean);
  text = pyStrip((text || "").replace(rx("[ \\t]+", "g"), " "));
  const paras = reSplit(String.raw`\n\s*\n`, text).map(pyStrip).filter((p) => pyLen(p) > 25);
  const lines = pySplitlines(text).map(pyStrip).filter(Boolean);
  const ws = words(text); const wc = ws.length; const ss = sentences(text); const sc = ss.length;
  const avg_sentence = pyRound(ss.reduce((acc, s) => acc + words(s).length, 0) / Math.max(sc, 1), 1);
  const question_count = reFindall(String.raw`\?`, text).length;
  let headings = lines.filter((l) => pyLen(l) < 110 && (
    reSearch(String.raw`^(?:#{1,5}\s+|\d+(?:\.\d+)*[.)]?\s+|(?:pergunta|resposta|introdução|conclusão|benefícios|vantagens|desvantagens|aplicações|características|como escolher|qual|quando|onde|porque|por que)\b)`, l, "i") ||
    (words(l).length <= 11 && !reSearch("[.!?;]$", l) && pyLen(l) > 8)));
  headings = headings.slice(0, 100);
  const first_para = paras.length ? paras[0] : [...text].slice(0, 600).join("");
  const has_topic = Boolean(pyStrip(topic)) && norm(text).includes(norm(topic));
  const answer_direct = reSearch(String.raw`\b(é|são|significa|consiste|serve|indicado|recomendado|utilizado|depende|permite|possui|apresenta)\b`, first_para, "i");
  const question_intent = Boolean(question_count || reSearch(QUESTION_WORDS + ".{5,90}", text, "i"));
  const evidence_hits = reFindall(EVIDENCE, text, "i").length;
  const urls = reFindall(String.raw`https?://[^\s)>]+|\bwww\.[\w.-]+`, text, "i");
  const figures = reFindall(SIGNALS.numeric, text, "i").length;
  const examples = match(SIGNALS.examples, text);
  const limitations = match(SIGNALS.limitations, text);
  const actions = match(SIGNALS.action, text);
  const comparison = match(COMP, text);
  const bullets = lines.filter((l) => reSearch(String.raw`^(?:[-•*]|\d+[.)])\s+`, l)).length;
  const brands_hits = {};
  for (const brand of brands) brands_hits[brand] = reFindall(String.raw`(?<!\w)` + reEscape(brand) + String.raw`(?!\w)`, text, "i").length;
  const brand_total = Object.values(brands_hits).reduce((a, b) => a + b, 0);
  const brand_density = (100 * brand_total) / Math.max(wc, 1);
  let branded_label = brand_total >= 3 && brand_density >= 0.65 ? "Branded" : brand_total >= 1 ? "Misto" : "Non-branded (sem marcas configuradas detectadas)";
  if (!brands.length) branded_label = "Indeterminado (configure marcas)";
  const top_tokens = ws.filter((w) => pyLen(w) >= 4 && !STOPWORDS.has(norm(w))).map(norm);
  const freq = new Map();
  for (const t of top_tokens) freq.set(t, (freq.get(t) || 0) + 1);
  let repeatSum = 0; for (const c of freq.values()) if (c >= 8) repeatSum += c;
  const repeat_ratio = repeatSum / Math.max(top_tokens.length, 1);
  const findings = [];
  // 1 clarity
  const c1 = 0.42 * int(answer_direct) + 0.25 * int(has_topic || !pyStrip(topic)) + 0.18 * int(paras.length > 0 && words(first_para).length <= 155) + 0.15 * int(headings.length > 0);
  findings.push(finding("Clareza e resposta objetiva", answer_direct, answer_direct ? "Abertura com resposta identificável" : "Não foi identificada resposta direta na abertura", "Abra com 1–3 frases que respondam à pergunta principal.", "Alta"));
  if (pyStrip(topic)) findings.push(finding("Clareza e resposta objetiva", has_topic, has_topic ? "Tema-alvo encontrado no texto" : `O tema-alvo “${topic}” não aparece literalmente no documento`, "Introduza o tema principal naturalmente no título e no contexto inicial.", "Alta"));
  // 2 coverage (500 heuristic but no hard requirement)
  const volume = clamp(wc / 600);
  const c2 = 0.40 * volume + 0.15 * int(examples) + 0.15 * int(comparison) + 0.15 * int(limitations) + 0.15 * int(actions);
  findings.push(finding("Cobertura e profundidade", wc >= 500, `${wc} palavras extraídas; 500 é apenas uma referência operacional`, "Se necessário, desenvolva critérios, exemplos e limitações relevantes; não aumente texto artificialmente.", "Média"));
  findings.push(finding("Cobertura e profundidade", examples, examples ? "Exemplos/aplicações encontrados" : "Sem exemplo prático identificado", "Inclua ao menos um exemplo concreto de aplicação.", "Média"));
  findings.push(finding("Cobertura e profundidade", comparison || limitations, comparison || limitations ? "Comparações ou ressalvas detectadas" : "Faltam comparações e ressalvas identificáveis", "Explique quando cada alternativa é adequada, incluindo exceções e cuidados.", "Alta"));
  // 3 structure
  const c3 = 0.35 * int(headings.length >= 2) + 0.20 * int(paras.length >= 3) + 0.20 * int(bullets >= 2) + 0.25 * int(headings.length >= 4);
  findings.push(finding("Estrutura e escaneabilidade", headings.length >= 2, `${headings.length} possíveis títulos/subtítulos detectados`, "Organize a pauta em H2/H3 claros (confirmar hierarquia no CMS).", "Alta"));
  findings.push(finding("Estrutura e escaneabilidade", bullets >= 2, `${bullets} linhas de lista detectadas`, "Use listas para critérios e passos quando facilitarem a leitura.", "Média"));
  // 4 intent
  const c4 = 0.45 * int(question_intent) + 0.30 * int(question_count >= 2) + 0.25 * int(actions || comparison);
  findings.push(finding("Perguntas e intenção de busca", question_count >= 2, `${question_count} perguntas explícitas detectadas`, "Inclua dúvidas reais do usuário e respostas úteis, sem FAQ artificial.", "Alta"));
  findings.push(finding("Perguntas e intenção de busca", actions || comparison, actions || comparison ? "Orientação de decisão encontrada" : "Orientação de decisão pouco explícita", "Acrescente critérios de escolha ou um passo a passo quando pertinente.", "Alta"));
  // 5 evidence
  const c5 = 0.45 * int(evidence_hits >= 1) + 0.20 * int(evidence_hits >= 3) + 0.15 * int(figures >= 1) + 0.20 * int(urls.length > 0);
  findings.push(finding("Confiabilidade e evidências", evidence_hits >= 1, `${evidence_hits} expressões relacionadas a fontes/evidências`, "Cite fontes, documentos técnicos ou testes verificáveis, quando aplicável.", "Alta"));
  findings.push(finding("Confiabilidade e evidências", urls.length > 0, `${urls.length} URLs explícitas encontradas`, "Inclua referências conferíveis para afirmações técnicas; URLs não substituem verificação.", "Alta"));
  // 6 language
  const c6 = 0.50 * clamp(1 - Math.abs(avg_sentence - 19) / 27) + 0.25 * int(repeat_ratio < 0.24) + 0.25 * int(sc >= 4);
  findings.push(finding("Linguagem e naturalidade", avg_sentence <= 28, `Média estimada de ${pyFloatStr(avg_sentence)} palavras por frase`, "Simplifique frases extensas e evite linguagem excessivamente promocional.", "Média"));
  findings.push(finding("Linguagem e naturalidade", repeat_ratio < 0.24, `Índice heurístico de repetição: ${pyPct0(repeat_ratio)}`, "Evite repetição artificial de palavras-chave e slogans.", "Média"));
  // 7 brand (brand saturation not automatically rewarded)
  const c7 = 0.50 * int(Boolean(pyStrip(topic)) || headings.length >= 1) + 0.50 * int(brand_total > 0 || (brands.length > 0 && wc > 250));
  findings.push(finding("Marca e identificação", Boolean(pyStrip(topic)) || headings.length >= 1, "Contexto/tópico identificável", "Deixe o tema principal explícito em um título (H1/H2) logo no início do texto.", "Baixa"));
  const raw = [c1, c2, c3, c4, c5, c6, c7];
  const scores = {};
  WEIGHT_KEYS.forEach((k, i) => { scores[k] = roundScore(raw[i], WEIGHTS[k]); });
  const score = pyRound(Object.values(scores).reduce((a, b) => a + b, 0));
  let verdict;
  if (score < 40) verdict = "Baixa adequação editorial";
  else if (score < 60) verdict = "Precisa de melhorias importantes";
  else if (score < 80) verdict = "Boa base, com oportunidades";
  else verdict = "Alta aderência aos critérios";
  const strengths = findings.filter((f) => f.status === "Atendido").map((f) => f.evidencia).slice(0, 6);
  const improvement = findings.filter((f) => f.status === "Melhorar");
  const impact_priority = { Alta: 0, "Média": 1, Baixa: 2 };
  improvement.sort((a, b) => (impact_priority[a.impacto] - impact_priority[b.impacto]) || (WEIGHT_KEYS.indexOf(a.criterio) - WEIGHT_KEYS.indexOf(b.criterio)));
  if (wc < 100) {
    verdict = "Texto insuficiente para avaliação editorial confiável";
    improvement.unshift(finding("Cobertura e profundidade", false, `Somente ${wc} palavras extraídas`, "Verifique se o PDF contém texto selecionável e se o arquivo está completo.", "Alta"));
  }
  const termos = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    produto: "DexGEO", versao: "1.0", arquivo: filename, data_utc: pyIsoNowUtc(),
    tema_alvo: topic, score, faixa: verdict, pontuacoes: scores, pesos: { ...WEIGHTS },
    metricas: {
      palavras: wc, paginas: page_count, frases: sc, media_palavras_por_frase: avg_sentence, paragrafos: paras.length,
      possiveis_subtitulos: headings.length, perguntas: question_count, listas: bullets, urls_de_referencia: urls.length,
      sinais_de_evidencia: evidence_hits, dados_numericos: figures, marcas_detectadas: brands_hits,
      densidade_mencoes_marca_pct: pyRound(brand_density, 2), termos_frequentes: termos,
    },
    intencao_de_marca: branded_label, acertos: strengths, melhorias: improvement, criterios: findings,
    ressalvas: [
      "A nota mede aderência editorial aos critérios do DexGEO, não a chance real de citação ou posicionamento.",
      "O PDF isolado não permite verificar indexação, links internos, schema, autoridade do domínio ou concorrentes.",
      "Os sinais são heurísticos e precisam de validação humana, especialmente para conteúdos técnicos.",
      "500 palavras é uma referência operacional, não um fator oficial de GEO.",
      "A análise não inclui OCR: PDFs digitalizados precisam de texto selecionável.",
    ],
  };
}

// Utilidades exportadas para o leitor de PDF (mesma semântica do Python)
export { pyStrip, pyLen };

// ------------------------------------------------------------------------
// Contexto do documento para as sugestões (não altera a nota nem o JSON)
// ------------------------------------------------------------------------
export function documentContext(text) {
  text = pyStrip((text || "").replace(rx("[ \\t]+", "g"), " "));
  const paras = reSplit(String.raw`\n\s*\n`, text).map(pyStrip).filter((p) => pyLen(p) > 25);
  const lines = pySplitlines(text).map(pyStrip).filter(Boolean);
  const isHeading = (l) => pyLen(l) < 110 && (
    reSearch(String.raw`^(?:#{1,5}\s+|\d+(?:\.\d+)*[.)]?\s+|(?:pergunta|resposta|introdução|conclusão|benefícios|vantagens|desvantagens|aplicações|características|como escolher|qual|quando|onde|porque|por que)\b)`, l, "i") ||
    (words(l).length <= 11 && !reSearch("[.!?;]$", l) && pyLen(l) > 8));
  const oneLine = (x) => pyStrip(x.replace(/\s+/gu, " "));
  const seen = new Set();
  const subtitulos = lines.filter(isHeading).map(oneLine)
    .filter((l) => /^[\p{Lu}\p{N}#]/u.test(l) && pyLen(l) <= 70 && !l.includes("?"))
    .filter((l) => { const k = norm(l); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 10);
  // título: primeiro bloco curto (pode ocupar várias linhas)
  const blocks = reSplit(String.raw`\n\s*\n`, text).map(oneLine).filter(Boolean);
  const titulo = blocks.find((bk) => words(bk).length >= 2 && words(bk).length <= 16)
    || lines.map(oneLine).find((l) => words(l).length >= 2 && words(l).length <= 16) || "";
  const firstPara = paras.map(oneLine).find((p) => words(p).length > 16) || oneLine([...text].slice(0, 600).join(""));
  const abertura = pyLen(firstPara) > 320 ? [...firstPara].slice(0, 320).join("") + "…" : firstPara;
  const qSeen = new Set();
  const perguntas = (text.match(/[\p{Lu}][^.!?\n]{8,140}\?/gu) || [])
    .map(oneLine).filter((q) => words(q).length <= 18).filter((q) => { const k = norm(q); if (qSeen.has(k)) return false; qSeen.add(k); return true; })
    .slice(0, 6);
  // termo principal: palavra mais frequente (mantém acentos), ignorando stopwords, números e marcas
  const brandSet = new Set(DEFAULT_BRANDS.map((b) => norm(b)));
  const freq = new Map();
  for (const w of words(text)) {
    const lw = w.toLowerCase();
    if (pyLen(lw) < 4 || STOPWORDS.has(norm(lw)) || brandSet.has(norm(lw)) || /^\p{N}/u.test(lw)) continue;
    freq.set(lw, (freq.get(lw) || 0) + 1);
  }
  const termos = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);
  return { titulo, subtitulos, abertura, perguntas, termo: termos[0] || "", termos };
}
