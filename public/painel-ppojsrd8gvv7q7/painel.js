/* DexGEO — Painel de uso */
import { buildHtmlReport } from "../report.js";

// Chave de acesso à API do painel (igual a DEXGEO_ADMIN_KEY no Netlify, ou ao padrão da função).
const ADMIN_KEY_DEFAULT = "pa64i8750aluuxy3l5penhjrhaardvg1v1dbqquw";
const API = "/api/painel-rketn5webz8g";
const PAGE = 25;

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmt1 = (n) => (n == null || Number.isNaN(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const personKey = (e) => `${e.nome}\u0001${e.area}`;
const icon = (id) => `<svg class="icon"><use href="#i-${id}"/></svg>`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

let toastTimer;
function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast is-on ${type ? "toast--" + type : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 3800);
}
function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const adminKey = () => store.get("dexgeo.adminKey") || ADMIN_KEY_DEFAULT;
async function api(path, opts = {}) {
  const resp = await fetch(API + path, { ...opts, headers: { "x-dexgeo-admin": adminKey(), ...(opts.headers || {}) }, cache: "no-store" });
  if (resp.status === 401) throw Object.assign(new Error("unauthorized"), { code: 401 });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) throw Object.assign(new Error(data?.erro || `Erro ${resp.status}`), { code: resp.status });
  return data;
}

// ---------- estado ----------
let all = [];
const st = { from: null, to: null, area: "", person: "", q: "", page: 0 };

function setPeriod(days) {
  $$("#period button").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.days) === days));
  const today = new Date();
  if (days === 0) {
    const first = all.length ? new Date(all[all.length - 1].ts) : today;
    st.from = dayKey(first);
  } else {
    const d = new Date(today); d.setDate(d.getDate() - (days - 1)); st.from = dayKey(d);
  }
  st.to = dayKey(today);
  $("#f-from").value = st.from; $("#f-to").value = st.to;
}

function filtered() {
  const from = st.from ? fromKey(st.from).getTime() : -Infinity;
  const to = st.to ? fromKey(st.to).getTime() + 86400000 : Infinity;
  return all.filter((e) => {
    const t = new Date(e.ts).getTime();
    if (t < from || t >= to) return false;
    if (st.area && e.area !== st.area) return false;
    if (st.person && personKey(e) !== st.person) return false;
    return true;
  });
}

// ---------- carregamento ----------
async function load() {
  const btn = $("#btn-refresh");
  btn.disabled = true;
  showState("Carregando dados…");
  try {
    const data = await api("/eventos");
    all = data.eventos || [];
    $("#updated-at").textContent = `Atualizado às ${new Date(data.gerado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    hideState();
    fillSelects();
    if (!st.from) setPeriod(30);
    render();
  } catch (err) {
    if (err.code === 401) showKeyForm();
    else if (err.code === 404) showState("A API do painel não respondeu. Ela só funciona no site publicado pelo Netlify (com as Functions ativas).", true);
    else showState(`Não foi possível carregar os dados: ${esc(err.message)}`, true);
  } finally { btn.disabled = false; }
}
function showState(html, isErr = false) { const el = $("#state"); el.hidden = false; el.className = `adm-state ${isErr ? "adm-state--err" : ""}`; el.innerHTML = html; }
function hideState() { $("#state").hidden = true; }
function showKeyForm() {
  showState(`${icon("lock")} <b>Chave de acesso inválida.</b> Informe a chave configurada em DEXGEO_ADMIN_KEY no Netlify.
    <form id="key-form"><input type="password" id="key-in" placeholder="Chave do painel" autocomplete="off" /><button class="btn btn--primary" type="submit">Entrar</button></form>`, true);
  $("#key-form").addEventListener("submit", (e) => { e.preventDefault(); store.set("dexgeo.adminKey", $("#key-in").value.trim()); load(); });
}

function fillSelects() {
  const areas = [...new Set(all.map((e) => e.area))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const people = [...new Map(all.map((e) => [personKey(e), e])).values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  $("#f-area").innerHTML = `<option value="">Todas</option>` + areas.map((a) => `<option ${a === st.area ? "selected" : ""}>${esc(a)}</option>`).join("");
  $("#f-person").innerHTML = `<option value="">Todas</option>` + people.map((p) => `<option value="${esc(personKey(p))}" ${personKey(p) === st.person ? "selected" : ""}>${esc(p.nome)} · ${esc(p.area)}</option>`).join("");
}

// ---------- renderização ----------
function render() {
  const ev = filtered();
  const acessos = ev.filter((e) => e.tipo === "acesso");
  const analyses = ev.filter((e) => e.tipo === "analise" && (!st.q || (e.arquivo || "").toLowerCase().includes(st.q.toLowerCase())));
  const downloads = ev.filter((e) => e.tipo === "download");
  const people = new Set(ev.map(personKey));
  const areas = new Set(ev.map((e) => e.area));
  const scores = analyses.map((e) => e.score).filter((s) => typeof s === "number");
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const dlHtml = downloads.filter((d) => d.formato === "html").length;

  $("#kpis").innerHTML = [
    ["Acessos", fmtInt(acessos.length), "sessões iniciadas"],
    ["Análises", fmtInt(analyses.length), "documentos analisados"],
    ["Pessoas", fmtInt(people.size), "usuários únicos"],
    ["Áreas", fmtInt(areas.size), "áreas ativas"],
    ["Nota média", fmt1(avg), "DexGEO Score"],
    ["Downloads", fmtInt(downloads.length), `${fmtInt(dlHtml)} HTML · ${fmtInt(downloads.length - dlHtml)} JSON`],
  ].map(([l, v, s]) => `<div class="kpi"><p>${l}</p><strong>${v}</strong><small>${s}</small></div>`).join("");

  renderDays(analyses, acessos);
  renderAreas(analyses, ev);
  renderBrands(analyses);
  renderHours(ev.filter((e) => e.tipo !== "download"));
  renderBands(analyses);
  renderPeople(ev);
  renderAnalyses(analyses);
}

const empty = (msg = "Sem dados no período selecionado.") => `<p class="empty">${msg}</p>`;

function niceMax(v) {
  if (v <= 4) return Math.max(1, v);
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Barras verticais em SVG, ancoradas na base, com dica ao passar o mouse. */
function vbars(el, items, { height = 200, labelEvery = 1 } = {}) {
  if (!items.length || items.every((i) => !i.value)) { el.innerHTML = empty(); return; }
  const W = Math.max(280, el.clientWidth || 600);
  const padL = 30, padB = 22, padT = 8, H = height;
  const plotW = W - padL, plotH = H - padB - padT;
  const max = niceMax(Math.max(...items.map((i) => i.value)));
  const ticks = max <= 4 ? max : 4;
  const slot = plotW / items.length;
  const bw = Math.max(2, Math.min(28, slot - 2));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(el.dataset.label || "gráfico")}">`;
  for (let t = 0; t <= ticks; t++) {
    const v = (max / ticks) * t, y = padT + plotH - (v / max) * plotH;
    svg += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text class="ax" x="${padL - 6}" y="${y + 3.5}" text-anchor="end">${fmtInt(v)}</text>`;
  }
  items.forEach((it, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const h = (it.value / max) * plotH, y = padT + plotH - h, r = Math.min(4, bw / 2, h);
    const base = padT + plotH;
    if (h > 0) svg += `<path class="mark" d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z"/>`;
    svg += `<rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" data-tip="${esc(it.tip)}"/>`;
    if (i % labelEvery === 0) svg += `<text class="ax" x="${padL + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  el.innerHTML = svg + "</svg>";
}

/** Barras horizontais em HTML (rótulos legíveis em qualquer largura). */
function hbars(el, items, { cls = "" } = {}) {
  if (!items.length) { el.innerHTML = empty(); return; }
  const max = Math.max(...items.map((i) => i.value), 1);
  el.innerHTML = `<div class="hbars ${cls}">` + items.map((i) =>
    `<div class="hbar" data-tip="${esc(i.tip)}"><span class="hbar__label" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="hbar__track"><span class="hbar__fill ${i.fill || ""}" style="width:${(i.value / max) * 100}%"></span></span>
      <span class="hbar__val">${fmtInt(i.value)}${i.sub ? ` <small>${esc(i.sub)}</small>` : ""}</span></div>`).join("") + "</div>";
}

function renderDays(analyses, acessos) {
  const el = $("#ch-days");
  const start = fromKey(st.from || dayKey(new Date())), end = fromKey(st.to || dayKey(new Date()));
  const nDays = Math.round((end - start) / 86400000) + 1;
  const weekly = nDays > 92;
  const bucket = (d) => {
    if (!weekly) return dayKey(d);
    const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return dayKey(s);
  };
  const A = new Map(), C = new Map();
  analyses.forEach((e) => { const k = bucket(new Date(e.ts)); A.set(k, (A.get(k) || 0) + 1); });
  acessos.forEach((e) => { const k = bucket(new Date(e.ts)); C.set(k, (C.get(k) || 0) + 1); });
  const items = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + (weekly ? 7 : 1))) {
    const k = bucket(d);
    if (items.length && items[items.length - 1].k === k) continue;
    const label = fmtDate(fromKey(k));
    items.push({ k, label, value: A.get(k) || 0, tip: `<b>${weekly ? "Semana de " : ""}${label}</b>${fmtInt(A.get(k) || 0)} análises · ${fmtInt(C.get(k) || 0)} acessos` });
  }
  el.dataset.label = "Análises por dia";
  $("#ch-days").closest(".adm-card").querySelector("header p").textContent = weekly ? "Análises realizadas por semana no período" : "Análises realizadas por dia no período";
  vbars(el, items, { height: 220, labelEvery: Math.max(1, Math.ceil(items.length / Math.max(4, Math.floor((el.clientWidth || 600) / 56)))) });
}

function renderAreas(analyses, ev) {
  const m = new Map();
  analyses.forEach((e) => m.set(e.area, (m.get(e.area) || 0) + 1));
  const ppl = new Map();
  ev.forEach((e) => { if (!ppl.has(e.area)) ppl.set(e.area, new Set()); ppl.get(e.area).add(e.nome); });
  const items = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([a, v]) => ({ label: a, value: v, sub: `${ppl.get(a)?.size || 0} pess.`, tip: `<b>${esc(a)}</b>${fmtInt(v)} análises · ${ppl.get(a)?.size || 0} pessoas` }));
  hbars($("#ch-areas"), items);
}

function renderBrands(analyses) {
  const tot = new Map(), docs = new Map();
  analyses.forEach((e) => Object.entries(e.marcas || {}).forEach(([b, n]) => {
    tot.set(b, (tot.get(b) || 0) + n);
    if (n > 0) docs.set(b, (docs.get(b) || 0) + 1);
  }));
  const items = [...tot.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([b, v]) => ({ label: b, value: v, sub: `${docs.get(b) || 0} doc.`, tip: `<b>${esc(b)}</b>${fmtInt(v)} menções em ${docs.get(b) || 0} documentos` }));
  hbars($("#ch-brands"), items);
  if (!items.length && analyses.length) $("#ch-brands").innerHTML = empty("Nenhuma marca mencionada nos documentos do período.");
}

function renderHours(ev) {
  const h = new Array(24).fill(0);
  ev.forEach((e) => { h[new Date(e.ts).getHours()]++; });
  vbars($("#ch-hours"), h.map((v, i) => ({ label: `${i}h`, value: v, tip: `<b>${pad(i)}h–${pad(i)}h59</b>${fmtInt(v)} acessos e análises` })), { height: 180, labelEvery: 3 });
}

function renderBands(analyses) {
  const bands = [
    ["Alta (80–100)", (s) => s >= 80, "hbar__fill--ok"],
    ["Boa base (60–79)", (s) => s >= 60 && s < 80, "hbar__fill--mid"],
    ["Atenção (40–59)", (s) => s >= 40 && s < 60, "hbar__fill--warn"],
    ["Baixa (0–39)", (s) => s < 40, "hbar__fill--bad"],
  ];
  if (!analyses.length) { $("#ch-bands").innerHTML = empty(); return; }
  hbars($("#ch-bands"), bands.map(([l, f, c]) => {
    const v = analyses.filter((e) => typeof e.score === "number" && f(e.score)).length;
    return { label: l, value: v, fill: c, sub: `${Math.round((v / analyses.length) * 100)}%`, tip: `<b>${l}</b>${fmtInt(v)} análises` };
  }), { cls: "bands" });
}

function renderPeople(ev) {
  const m = new Map();
  ev.forEach((e) => {
    const k = personKey(e);
    if (!m.has(k)) m.set(k, { nome: e.nome, area: e.area, acessos: 0, analises: 0, downloads: 0, scores: [], ultimo: e.ts, primeiro: e.ts });
    const p = m.get(k);
    if (e.tipo === "acesso") p.acessos++;
    if (e.tipo === "analise") { p.analises++; if (typeof e.score === "number") p.scores.push(e.score); }
    if (e.tipo === "download") p.downloads++;
    if (e.ts > p.ultimo) p.ultimo = e.ts;
    if (e.ts < p.primeiro) p.primeiro = e.ts;
  });
  const rows = [...m.values()].sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1));
  peopleRows = rows;
  $("#tbl-people").innerHTML = rows.length ? `<thead><tr><th>Pessoa</th><th>Área</th><th class="num">Acessos</th><th class="num">Análises</th><th class="num">Nota média</th><th class="num">Downloads</th><th>Primeiro uso</th><th>Último uso</th></tr></thead><tbody>` +
    rows.map((p) => `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.area)}</td><td class="num">${fmtInt(p.acessos)}</td><td class="num">${fmtInt(p.analises)}</td>
      <td class="num">${p.scores.length ? fmt1(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : "—"}</td><td class="num">${fmtInt(p.downloads)}</td>
      <td class="muted">${fmtDateTime(p.primeiro)}</td><td class="muted">${fmtDateTime(p.ultimo)}</td></tr>`).join("") + "</tbody>"
    : `<tbody><tr><td>${empty()}</td></tr></tbody>`;
}
let peopleRows = [];
let analysisRows = [];

function pillCls(s) { return s < 40 ? "score-pill--bad" : s < 60 ? "score-pill--warn" : s < 80 ? "" : "score-pill--ok"; }

function renderAnalyses(analyses) {
  analysisRows = analyses;
  const pages = Math.max(1, Math.ceil(analyses.length / PAGE));
  st.page = Math.min(st.page, pages - 1);
  const slice = analyses.slice(st.page * PAGE, st.page * PAGE + PAGE);
  $("#tbl-analyses").innerHTML = slice.length ? `<thead><tr><th>Data</th><th>Pessoa</th><th>Arquivo</th><th class="num">Nota</th><th>Marcas citadas</th><th class="num">Relatório</th></tr></thead><tbody>` +
    slice.map((e) => {
      const marcas = Object.entries(e.marcas || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, n]) => `${esc(b)} (${n})`).join(", ") || "—";
      const perfil = (e.perfil || "").replace(" (sem marcas configuradas detectadas)", "");
      return `<tr><td class="muted nowrap">${fmtDateTime(e.ts).replace(", ", "<br>")}</td>
        <td class="who"><b>${esc(e.nome)}</b><small>${esc(e.area)}</small></td>
        <td class="file" title="${esc(e.arquivo)}">${esc(e.arquivo)}<small>${esc(perfil)}</small></td>
        <td class="num"><span class="score-pill ${pillCls(e.score)}">${e.score ?? "—"}</span></td>
        <td class="muted brands">${marcas}</td>
        <td><div class="acts">
          <button class="act" data-html="${esc(e.id)}" type="button">${icon("download")}HTML</button>
          <button class="act" data-json="${esc(e.id)}" type="button" title="Baixar JSON">${icon("file")}JSON</button>
          <button class="act act--del" data-del="${esc(e.id)}" type="button" aria-label="Excluir análise">${icon("trash")}</button>
        </div></td></tr>`;
    }).join("") + "</tbody>"
    : `<tbody><tr><td>${empty("Nenhuma análise no período selecionado.")}</td></tr></tbody>`;
  $("#pager").innerHTML = pages > 1
    ? `<button class="act" data-page="-1" ${st.page === 0 ? "disabled" : ""} type="button">Anterior</button><span>Página ${st.page + 1} de ${pages}</span><button class="act" data-page="1" ${st.page >= pages - 1 ? "disabled" : ""} type="button">Próxima</button>`
    : "";
}

// ---------- ações ----------
async function fetchReport(id) {
  const data = await api(`/relatorio?id=${encodeURIComponent(id)}`);
  const r = data.resultado;
  const ev = all.find((e) => e.id === id);
  if (ev && !r.usuario) r.usuario = { nome: ev.nome, area: ev.area };
  return { r, ctx: data.contexto || {} };
}
const safeName = (s) => String(s || "documento").replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.html) {
      b.disabled = true;
      const { r, ctx } = await fetchReport(b.dataset.html);
      download(`dexgeo_relatorio_${safeName(r.arquivo)}.html`, buildHtmlReport(r, ctx), "text/html");
    } else if (b.dataset.json) {
      b.disabled = true;
      const { r } = await fetchReport(b.dataset.json);
      download(`dexgeo_diagnostico_${safeName(r.arquivo)}.json`, JSON.stringify(r, null, 2), "application/json");
    } else if (b.dataset.del) {
      const ev = all.find((x) => x.id === b.dataset.del);
      if (!confirm(`Excluir a análise de “${ev?.arquivo || ""}” feita por ${ev?.nome || ""}? Esta ação não pode ser desfeita.`)) return;
      b.disabled = true;
      await api(`/evento?id=${encodeURIComponent(b.dataset.del)}`, { method: "DELETE" });
      all = all.filter((x) => x.id !== b.dataset.del);
      render(); toast("Análise excluída.");
    } else if (b.dataset.page) {
      st.page += Number(b.dataset.page); renderAnalyses(analysisRows);
    }
  } catch (err) {
    toast(err.code === 404 ? "Relatório não encontrado." : `Não foi possível concluir: ${err.message}`, "error");
  } finally { if (b.isConnected) b.disabled = false; }
});

// CSV (separador ";" e BOM para abrir corretamente no Excel em português)
function csv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
}
$("#csv-people").addEventListener("click", () => {
  download("dexgeo_pessoas.csv", csv([["Pessoa", "Área", "Acessos", "Análises", "Nota média", "Downloads", "Primeiro uso", "Último uso"],
    ...peopleRows.map((p) => [p.nome, p.area, p.acessos, p.analises, p.scores.length ? fmt1(p.scores.reduce((a, b) => a + b, 0) / p.scores.length) : "", p.downloads, fmtDateTime(p.primeiro), fmtDateTime(p.ultimo)])]), "text/csv");
});
$("#csv-analyses").addEventListener("click", () => {
  download("dexgeo_analises.csv", csv([["Data", "Pessoa", "Área", "Arquivo", "Nota", "Faixa", "Perfil de marca", "Palavras", "Páginas", "Marcas (menções)"],
    ...analysisRows.map((e) => [fmtDateTime(e.ts), e.nome, e.area, e.arquivo, e.score, e.faixa, e.perfil, e.palavras, e.paginas,
      Object.entries(e.marcas || {}).filter(([, n]) => n > 0).map(([b, n]) => `${b}: ${n}`).join(", ")])]), "text/csv");
});

// filtros
$$("#period button").forEach((b) => b.addEventListener("click", () => { setPeriod(Number(b.dataset.days)); st.page = 0; render(); }));
const onDate = () => { st.from = $("#f-from").value || null; st.to = $("#f-to").value || null; $$("#period button").forEach((x) => x.classList.remove("is-on")); st.page = 0; render(); };
$("#f-from").addEventListener("change", onDate);
$("#f-to").addEventListener("change", onDate);
$("#f-area").addEventListener("change", (e) => { st.area = e.target.value; st.page = 0; render(); });
$("#f-person").addEventListener("change", (e) => { st.person = e.target.value; st.page = 0; render(); });
let qTimer;
$("#f-q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.q = e.target.value.trim(); st.page = 0; render(); }, 200); });
$("#btn-refresh").addEventListener("click", load);

// dica (tooltip) para barras
const tip = $("#tip");
function showTip(target, x, y) {
  tip.innerHTML = target.dataset.tip; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 12))}px`;
  tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
}
document.addEventListener("pointermove", (e) => {
  const t = e.target.closest?.("[data-tip]");
  $$(".mark.is-hot").forEach((m) => m.classList.remove("is-hot"));
  if (!t) { tip.hidden = true; return; }
  if (t.classList.contains("hit")) t.previousElementSibling?.classList?.contains("mark") && t.previousElementSibling.classList.add("is-hot");
  showTip(t, e.clientX, e.clientY);
});
document.addEventListener("pointerdown", (e) => { const t = e.target.closest?.("[data-tip]"); if (t) showTip(t, e.clientX, e.clientY); else tip.hidden = true; });

let rT;
addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (all.length) render(); }, 150); });

load();
