/* =========================================================
   DexGEO Web — lógica do front-end
   ========================================================= */
import { buildSuggestion, suggestionToText } from "./suggestions.js";
import { buildHtmlReport } from "./report.js";
import { track } from "./tracking.js";

(() => {
  "use strict";

  // ---------- Configuração ----------
  const CONFIG = {
    // Logotipo (PNG ou SVG com fundo transparente) em public/assets/
    LOGO_URL: "assets/logo.png",
    MAX_MB: 20,
    STORAGE_USER: "dexgeo.user",
  };

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtInt = (n) => Number(n || 0).toLocaleString("pt-BR");
  const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
  const icon = (id, cls = "icon") => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
    },
  };

  let toastTimer;
  function toast(msg, type = "") {
    const el = $("#toast");
    // com o pop-up aberto, o aviso precisa ficar dentro dele (camada superior)
    const host = document.querySelector("dialog[open]") || document.body;
    if (el.parentElement !== host) host.appendChild(el);
    el.textContent = msg;
    el.className = `toast is-on ${type ? "toast--" + type : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 4200);
  }

  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Logotipo ----------
  function setupLogo() {
    const slots = $$("[data-logo-slot]");
    const placeholder = `<span>${icon("image")}Seu logotipo aqui<small>public/assets/logo.png</small></span>`;
    const img = new Image();
    img.onload = () => slots.forEach((s) => {
      s.classList.remove("is-empty");
      s.innerHTML = `<img src="${CONFIG.LOGO_URL}" alt="DexGEO" />`;
    });
    img.onerror = () => slots.forEach((s) => { s.classList.add("is-empty"); s.innerHTML = placeholder; });
    img.src = CONFIG.LOGO_URL;
  }

  // ---------- Identificação (sem login) ----------
  let user = store.get(CONFIG.STORAGE_USER, null);

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  }

  function renderUser() {
    $("#user-name").textContent = user.name;
    $("#user-area").textContent = user.area;
    $("#user-initials").textContent = initials(user.name);
  }

  function showIdentify() {
    $("#app").hidden = true;
    $("#identify").hidden = false;
    $("#id-name").value = user?.name || "";
    $("#id-area").value = user?.area || "";
    setTimeout(() => $("#id-name").focus(), 50);
  }

  function showApp() {
    renderUser();
    $("#identify").hidden = true;
    $("#app").hidden = false;
    warmup();
    track("acesso", user, {}, { oncePerSession: true });
  }

  $("#identify-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#id-name").value.trim();
    const area = $("#id-area").value.trim();
    const err = $("#identify-error");
    if (name.length < 2) { err.textContent = "Informe seu nome."; $("#id-name").focus(); return; }
    if (area.length < 2) { err.textContent = "Informe sua área."; $("#id-area").focus(); return; }
    err.textContent = "";
    user = { name, area };
    store.set(CONFIG.STORAGE_USER, user);
    showApp();
  });
  $("#user-chip").addEventListener("click", showIdentify);

  // ---------- Upload ----------
  let file = null;
  const dz = $("#dropzone");
  const fileInput = $("#file-input");
  const analyzeBtn = $("#analyze-btn");

  function setFile(f) {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { toast("Envie um arquivo PDF.", "error"); return; }
    if (f.size > CONFIG.MAX_MB * 1024 * 1024) { toast(`O limite é de ${CONFIG.MAX_MB} MB por arquivo.`, "error"); return; }
    file = f;
    $("#file-name").textContent = f.name;
    $("#file-size").textContent = fmtSize(f.size);
    $("#file-pill").hidden = false;
    dz.hidden = true;
    analyzeBtn.disabled = false;
  }
  function clearFile() {
    file = null; fileInput.value = "";
    $("#file-pill").hidden = true; dz.hidden = false;
    analyzeBtn.disabled = true;
  }
  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
  $("#file-clear").addEventListener("click", clearFile);
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

  // ---------- Motor de análise (Web Worker: leitor de PDF + regras) ----------
  let worker = null;
  let seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (ev) => {
      const { id, ok, result, error } = ev.data || {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      ok ? p.resolve({ result, context: ev.data.context }) : p.reject(new Error(error));
    };
    worker.onerror = () => {
      pending.forEach((p) => p.reject(new Error("Não foi possível carregar o leitor de PDF. Verifique sua conexão e recarregue a página.")));
      pending.clear();
      worker = null;
    };
    return worker;
  }
  function callWorker(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, ...msg }, transfer);
    });
  }
  // Pré-carrega o leitor de PDF (~10 MB, fica em cache) enquanto a pessoa preenche os campos.
  let warmed = false;
  function warmup() {
    if (warmed) return;
    warmed = true;
    const go = () => callWorker({ type: "warmup" }).catch(() => { warmed = false; });
    "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 800);
  }

  // ---------- Análise ----------
  let lastResult = null;
  let lastContext = {};

  analyzeBtn.addEventListener("click", async () => {
    if (!file) return;

    analyzeBtn.classList.add("is-loading");
    analyzeBtn.disabled = true;
    $(".btn__label", analyzeBtn).textContent = "Analisando";
    try {
      const buffer = await file.arrayBuffer();
      const { result, context } = await callWorker({
        type: "analyze",
        name: file.name,
        buffer,
        topic: "",
        brands: "",            // marcas padrão do analyzer
        user_name: user?.name || "",
        user_area: user?.area || "",
      }, [buffer]);
      lastResult = result;
      lastContext = context || {};
      renderResults(result);
      track("analise", user, { resultado: result, contexto: { titulo: lastContext.titulo, termo: lastContext.termo } });
    } catch (err) {
      toast(err.message || "Não foi possível analisar o documento.", "error");
    } finally {
      analyzeBtn.classList.remove("is-loading");
      analyzeBtn.disabled = !file;
      $(".btn__label", analyzeBtn).textContent = "Analisar documento";
    }
  });

  // ---------- Renderização dos resultados ----------
  function bandClass(score) {
    if (score < 40) return "badge--bad";
    if (score < 60) return "badge--warn";
    if (score < 80) return "";
    return "badge--ok";
  }

  function renderResults(r) {
    const m = r.metricas;
    $("#results").hidden = false;

    $("#res-file").textContent = r.arquivo;
    const when = new Date(r.data_utc).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const who = r.usuario?.nome ? ` · ${r.usuario.nome} (${r.usuario.area})` : "";
    $("#res-meta").textContent = `${when}${r.tema_alvo ? " · Tema: " + r.tema_alvo : ""}${who}`;

    // Score
    $("#res-score").textContent = r.score;
    const circ = 2 * Math.PI * 50;
    const gv = $("#gauge-value");
    gv.style.strokeDashoffset = circ;
    requestAnimationFrame(() => requestAnimationFrame(() => { gv.style.strokeDashoffset = circ * (1 - r.score / 100); }));
    const band = $("#res-band");
    band.textContent = r.faixa;
    band.className = `badge ${bandClass(r.score)}`;
    $("#res-brand").textContent = `Perfil de marca: ${r.intencao_de_marca}`;

    // Métricas
    const tiles = [
      ["Palavras", fmtInt(m.palavras), true],
      ["Perguntas", m.perguntas],
      ["Páginas", m.paginas ?? "—"],
      ["Frases", fmtInt(m.frases)],
      ["Palavras / frase", String(m.media_palavras_por_frase).replace(".", ",")],
      ["Possíveis subtítulos", m.possiveis_subtitulos],
      ["Parágrafos", fmtInt(m.paragrafos)],
      ["Sinais de evidência", m.sinais_de_evidencia],
      ["URLs de referência", m.urls_de_referencia],
    ];
    $("#metrics").innerHTML = tiles.map(([l, v, accent]) =>
      `<div class="metric ${accent ? "metric--accent" : ""}"><p class="metric__label">${esc(l)}</p><p class="metric__value">${esc(v)}</p></div>`).join("");

    // Aviso de extensão
    const ln = $("#length-note");
    if (m.palavras < 500) {
      ln.className = "alert alert--warn";
      ln.innerHTML = `${icon("alert")}<span>Texto abaixo de 500 palavras. Avalie se o tamanho é suficiente para a intenção; o patamar não é requisito oficial de GEO.</span>`;
    } else {
      ln.className = "alert alert--ok";
      ln.innerHTML = `${icon("check")}<span>O texto tem pelo menos 500 palavras; extensão, por si só, não garante profundidade.</span>`;
    }

    // Dimensões
    $("#dims").innerHTML = Object.entries(r.pontuacoes).map(([k, v]) => {
      const max = r.pesos[k];
      const pct = Math.round((v / max) * 100);
      const cls = pct < 40 ? "bar--low" : pct < 70 ? "bar--mid" : "";
      return `<div class="dim">
        <span class="dim__name">${esc(k)}</span>
        <span class="dim__pts">${String(v).replace(".", ",")} <small>/ ${max}</small></span>
        <div class="bar ${cls}"><span data-w="${pct}"></span></div>
        <span class="dim__pct">${pct}% de aproveitamento</span>
      </div>`;
    }).join("");
    requestAnimationFrame(() => requestAnimationFrame(() => $$("#dims .bar > span").forEach((s) => (s.style.width = s.dataset.w + "%"))));

    // Acertos / melhorias
    $("#strengths").innerHTML = r.acertos.length
      ? r.acertos.map((x) => `<li><span class="dot dot--ok">${icon("check")}</span><span>${esc(x)}</span></li>`).join("")
      : `<p class="empty">Nenhum sinal positivo detectado pelas regras automáticas.</p>`;
    $("#improvements").innerHTML = r.melhorias.length
      ? r.melhorias.map((x, i) => `<li class="imp"><span class="dot dot--warn">${icon("alert")}</span><span class="imp__body">
          <strong><span class="prio prio--${esc(x.impacto)}">${esc(x.impacto)}</span>${esc(x.criterio)}</strong>
          <p class="imp__obs"><b>Observação:</b> ${esc(x.evidencia)}</p>
          <p>${esc(x.acao)}</p>
          <button type="button" class="link-btn imp__link" data-sg="${i}">${icon("bulb")}Ver sugestão do que fazer</button></span></li>`).join("")
      : `<p class="empty">Nenhuma pendência heurística identificada.</p>`;

    // Auditoria
    $("#audit").innerHTML = r.criterios.map((c) => {
      const ok = c.status === "Atendido";
      return `<details class="acc">
        <summary>
          <span class="dot ${ok ? "dot--ok" : "dot--warn"}">${icon(ok ? "check" : "alert")}</span>
          <span class="grow">${esc(c.criterio)}<small>${esc(c.evidencia)}</small></span>
          ${icon("chevron", "icon chev")}
        </summary>
        <div class="acc__body">
          <p><b>Status:</b> ${esc(c.status)}</p>
          <p><b>Evidência observada:</b> ${esc(c.evidencia)}</p>
          <p><b>Ação recomendada:</b> ${esc(c.acao)}</p>
          <p><b>Prioridade:</b> <span class="prio prio--${esc(c.impacto)}">${esc(c.impacto)}</span></p>
        </div>
      </details>`;
    }).join("");

    // Marcas
    const entries = Object.entries(m.marcas_detectadas || {});
    const maxHits = Math.max(1, ...entries.map(([, v]) => v));
    $("#brand-dist").innerHTML = entries.length
      ? entries.map(([b, v]) => `<div class="brand-row"><span>${esc(b)}</span><div class="bar"><span style="width:${(v / maxHits) * 100}%"></span></div><span class="count">${v}</span></div>`).join("") +
        `<p class="brand-foot">Densidade de menções de marca: <b>${String(m.densidade_mencoes_marca_pct).replace(".", ",")}%</b> das palavras.</p>`
      : `<p class="empty">Nenhuma marca configurada.</p>`;
    $("#terms").innerHTML = (m.termos_frequentes || []).map(([t, n]) => `<span class="term">${esc(t)}<b>${n}</b></span>`).join("") || `<p class="empty">Sem termos frequentes.</p>`;

    selectTab("dims");
    setTimeout(() => $("#results").scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  // ---------- Abas ----------
  function selectTab(name) {
    $$(".tab").forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === `panel-${name}`));
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));

  // ---------- Pop-up de sugestões ----------
  const modal = $("#suggest-modal");
  let currentSuggestion = null;
  function openSuggestion(i) {
    const f = lastResult?.melhorias?.[i];
    if (!f) return;
    const s = buildSuggestion(f, lastResult, lastContext);
    currentSuggestion = s;
    $("#sg-title").innerHTML = `<span class="prio prio--${esc(f.impacto)}">${esc(f.impacto)}</span>${esc(s.titulo)}`;
    const sec = (title, html) => `<section class="sg-sec"><h4>${title}</h4>${html}</section>`;
    let html = `<p class="sg-action">${esc(f.acao)}</p>`;
    if (s.porque) html += sec("Por que importa", `<p>${esc(s.porque)}</p>`);
    if (s.observado.length) html += sec("O que observamos no documento", `<ul class="sg-obs">${s.observado.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`);
    if (s.passos.length) html += sec("O que fazer", `<ol class="sg-steps">${s.passos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`);
    if (s.estrutura.length) html += sec("Sugestão de estrutura (H1/H2/H3)", `<div class="outline">${s.estrutura.map((h) => `<div class="outline__row outline__row--${h.nivel}"><span class="htag htag--${h.nivel}">${h.nivel}</span><span>${esc(h.texto)}</span></div>`).join("")}</div>`);
    if (s.modelo) html += sec(esc(s.modeloTitulo), `<pre class="sg-model">${esc(s.modelo)}</pre>`);
    html += `<p class="sg-note">Os trechos entre [colchetes] devem ser preenchidos com informações reais do produto ou tema.</p>`;
    $("#sg-body").innerHTML = html;
    $("#sg-body").scrollTop = 0;
    if (typeof modal.showModal === "function") modal.showModal(); else modal.setAttribute("open", "");
  }
  function closeModal() { if (modal.open) modal.close?.() ?? modal.removeAttribute("open"); }
  $("#improvements").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sg]");
    if (b) openSuggestion(Number(b.dataset.sg));
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  });
  $("#sg-copy").addEventListener("click", async () => {
    if (!currentSuggestion) return;
    const text = suggestionToText(currentSuggestion);
    try { await navigator.clipboard.writeText(text); toast("Sugestão copiada."); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      modal.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Sugestão copiada."); } catch { toast("Não foi possível copiar.", "error"); }
      ta.remove();
    }
  });

  // ---------- Exportação ----------
  $("#dl-json").addEventListener("click", () => {
    if (!lastResult) return;
    download("dexgeo_diagnostico.json", JSON.stringify(lastResult, null, 2), "application/json");
    track("download", user, { formato: "json", arquivo: lastResult.arquivo });
  });

  $("#dl-html").addEventListener("click", () => {
    if (!lastResult) return;
    download("dexgeo_relatorio.html", buildHtmlReport(lastResult, lastContext), "text/html");
    track("download", user, { formato: "html", arquivo: lastResult.arquivo });
  });

  // ---------- Início ----------
  setupLogo();
  if (user?.name && user?.area) showApp(); else showIdentify();
})();
