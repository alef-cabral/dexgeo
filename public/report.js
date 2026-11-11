/* DexGEO — report.js
   Gera o relatório HTML de uma análise (usado no aplicativo e no painel administrativo). */
import { buildSuggestion } from "./suggestions.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR");

export function buildHtmlReport(r, ctx = {}) {
  const rows = Object.entries(r.pontuacoes).map(([k, v]) => {
    const pct = Math.round((v / r.pesos[k]) * 100);
    return `<tr><td>${esc(k)}</td><td class="n">${String(v).replace(".", ",")}/${r.pesos[k]}</td><td><div class="b"><i style="width:${pct}%"></i></div></td></tr>`;
  }).join("");
  const issues = r.melhorias.map((x) => {
    const sg = buildSuggestion(x, r, ctx);
    const steps = sg.passos.map((p) => `<li>${esc(p)}</li>`).join("");
    const outline = sg.estrutura.length ? `<div class="sg"><b>Estrutura sugerida</b>${sg.estrutura.map((h) => `<div class="h ${h.nivel}"><em>${h.nivel}</em>${esc(h.texto)}</div>`).join("")}</div>` : "";
    const model = sg.modelo ? `<div class="sg"><b>${esc(sg.modeloTitulo)}</b><pre>${esc(sg.modelo)}</pre></div>` : "";
    return `<li><b>${esc(x.impacto)} · ${esc(x.criterio)}:</b> ${esc(x.acao)}<br><small>Observação: ${esc(x.evidencia)}</small>
      <div class="sg"><b>O que fazer</b><ol>${steps}</ol></div>${outline}${model}</li>`;
  }).join("");
  const good = r.acertos.map((x) => `<li>${esc(x)}</li>`).join("");
  const caveats = r.ressalvas.map((x) => `<li>${esc(x)}</li>`).join("");
  const when = new Date(r.data_utc).toLocaleString("pt-BR");
  const u = r.usuario || {};
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DexGEO - ${esc(r.arquivo)}</title>
<style>
body{font:15px/1.55 Montserrat,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 18px;color:#17264A}
header{background:linear-gradient(120deg,#5AB0F0,#2F7BFF 48%,#0A4BFF);color:#fff;padding:26px 28px;border-radius:22px}
header h1{margin:0;font-size:30px}header p{margin:6px 0 0;opacity:.9}
.who{display:flex;flex-wrap:wrap;gap:8px 24px;margin:18px 0 0;font-size:13px}
.score{font-size:46px;font-weight:800;color:#0A4BFF}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #E1E7F2;padding:10px 8px}td.n{white-space:nowrap;font-weight:700;color:#0A4BFF}
.b{height:8px;background:#EEF4FF;border-radius:9px;min-width:90px}.b i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#5AB0F0,#0A4BFF)}
li{margin:10px 0}small{color:#607183}h2{margin-top:32px}
.sg{margin:10px 0 0;padding:12px 14px;background:#F2F5FB;border-radius:8px;font-size:14px}.sg b{display:block;margin-bottom:4px}.sg ol{margin:0;padding-left:20px}.sg li{margin:4px 0}
.h{padding:2px 0}.h.H3{padding-left:22px}.h em{display:inline-block;min-width:28px;margin-right:8px;font-style:normal;font-weight:700;font-size:11px;color:#0A4BFF}
pre{margin:0;white-space:pre-wrap;font:13px/1.5 Montserrat,Arial,sans-serif}
@media print{body{margin:16mm auto}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header><h1>DexGEO</h1><p>Diagnóstico editorial · ${esc(r.arquivo)}</p>
<div class="who"><span><b>Analisado por:</b> ${esc(u.nome || "—")}</span><span><b>Área:</b> ${esc(u.area || "—")}</span><span><b>Data:</b> ${esc(when)}</span></div></header>
<h2>Resultado: <span class="score">${r.score}/100</span></h2>
<p>${esc(r.faixa)} · ${fmtInt(r.metricas.palavras)} palavras · ${esc(r.intencao_de_marca)}${r.tema_alvo ? " · Tema: " + esc(r.tema_alvo) : ""}</p>
<h2>Pontuação por critério</h2><table>${rows}</table>
<h2>O que está bom</h2><ul>${good || "<li>Nenhum sinal positivo detectado.</li>"}</ul>
<h2>Recomendações priorizadas e sugestões</h2><ol>${issues || "<li>Nenhuma pendência heurística identificada.</li>"}</ol>
<h2>Limitações</h2><ul>${caveats}</ul>
</body></html>`;
}
