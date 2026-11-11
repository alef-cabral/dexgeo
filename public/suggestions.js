/* =========================================================================
   DexGEO — suggestions.js
   Sugestões práticas para cada item de "O que precisa melhorar".
   Usa o contexto do documento (título, subtítulos, abertura, termo principal)
   para montar estruturas de H2/H3 e modelos de texto prontos para adaptar.
   ========================================================================= */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmtNum = (n) => String(n).replace(".", ",");

/**
 * @param {object} f   item de r.melhorias ({criterio, evidencia, acao, impacto})
 * @param {object} r   resultado completo da análise
 * @param {object} ctx contexto do documento (documentContext)
 * @returns {{titulo, porque, observado: string[], passos: string[], estrutura: {nivel,texto}[], modelo: string, modeloTitulo: string}}
 */
export function buildSuggestion(f, r, ctx = {}) {
  const T = ctx.termo || "o tema";
  const Tc = cap(ctx.termo || "Tema");
  const m = r.metricas || {};
  const alt = "[alternativa]";
  const base = { titulo: f.criterio, porque: "", observado: [f.evidencia], passos: [], estrutura: [], modelo: "", modeloTitulo: "Modelo de texto" };
  const H = (nivel, texto) => ({ nivel, texto });

  const rules = {
    "Abra com 1–3 frases que respondam à pergunta principal."() {
      return {
        porque: "Buscadores e assistentes de IA costumam extrair a resposta dos primeiros parágrafos. Uma abertura direta aumenta a chance de esse trecho ser usado como resposta.",
        observado: [f.evidencia, ctx.abertura ? `Abertura atual: “${ctx.abertura}”` : ""],
        passos: [
          "Responda à pergunta do título já na primeira frase, sem introdução genérica.",
          "Use um verbo de definição ou recomendação: é, são, indicado, recomendado, depende de.",
          "Complete com 1–2 frases de contexto: para quem serve e qual o critério principal.",
          "Deixe os detalhes para as seções seguintes (H2/H3).",
        ],
        estrutura: [H("H1", ctx.titulo || `${Tc}: guia completo`), H("H2", `O que é ${T}?`), H("H2", `Para que serve ${T}`)],
        modeloTitulo: "Modelo de abertura",
        modelo: `${Tc} é [definição objetiva em uma frase]. É indicado para [uso principal] e se destaca por [benefício principal]. A escolha ideal depende de [critério 1] e [critério 2].`,
      };
    },
    "Introduza o tema principal naturalmente no título e no contexto inicial."() {
      return {
        porque: "Quando o tema aparece no título e na abertura, fica claro para o leitor e para a IA qual pergunta o conteúdo responde.",
        passos: ["Inclua o tema no H1.", "Repita o tema de forma natural na primeira frase.", "Use variações do tema nos H2, sem forçar repetição."],
        estrutura: [H("H1", `${Tc}: [o que o leitor vai aprender]`), H("H2", `O que é ${T}?`)],
      };
    },
    "Se necessário, desenvolva critérios, exemplos e limitações relevantes; não aumente texto artificialmente."() {
      return {
        porque: "Conteúdos completos respondem às dúvidas seguintes do leitor e oferecem mais trechos úteis para citação. Volume sem informação nova não ajuda.",
        observado: [`${m.palavras ?? "—"} palavras extraídas do documento.`],
        passos: [
          "Liste as dúvidas que o leitor terá depois de ler a abertura.",
          "Crie uma seção para cada dúvida relevante, com resposta objetiva.",
          "Inclua critérios, exemplos e limitações; evite repetir o mesmo conteúdo com outras palavras.",
        ],
        estrutura: [
          H("H2", `Como escolher ${T}`), H("H3", "[Critério 1]: [por que importa]"), H("H3", "[Critério 2]: [por que importa]"),
          H("H2", `Onde usar ${T}`), H("H2", "Cuidados e limitações"), H("H2", `Perguntas frequentes sobre ${T}`),
        ],
      };
    },
    "Inclua ao menos um exemplo concreto de aplicação."() {
      return {
        porque: "Exemplos mostram o conteúdo aplicado a situações reais e ajudam a IA a associar o texto a perguntas práticas (“serve para…”, “posso usar em…”).",
        passos: ["Escolha a situação de uso mais comum do público.", "Descreva o cenário, a solução e o resultado em 2–3 frases.", "Se possível, inclua um dado concreto (medida, prazo, ambiente)."],
        estrutura: [H("H3", `Exemplo prático: ${T} em [ambiente ou situação]`)],
        modeloTitulo: "Modelo de exemplo",
        modelo: `Por exemplo, em [ambiente ou situação], ${T} [como é usado]. Na prática, isso significa [benefício ou resultado concreto], desde que [condição ou cuidado].`,
      };
    },
    "Explique quando cada alternativa é adequada, incluindo exceções e cuidados."() {
      return {
        porque: "Perguntas comparativas (“qual é melhor…”, “vale a pena…”) são muito comuns em buscas com IA. Comparações honestas, com exceções, transmitem confiança.",
        passos: ["Compare com a alternativa mais buscada pelo público.", "Diga quando cada opção é indicada e quando não é.", "Use uma tabela curta com 3–5 critérios objetivos."],
        estrutura: [
          H("H2", `${Tc}: vantagens e desvantagens`), H("H3", `Quando escolher ${T}`), H("H3", `Quando evitar ${T}`),
          H("H2", `${Tc} ou ${alt}: qual escolher?`),
        ],
        modeloTitulo: "Modelo de comparação",
        modelo: `| Critério | ${Tc} | ${cap(alt)} |\n| --- | --- | --- |\n| [Critério 1] | [...] | [...] |\n| [Critério 2] | [...] | [...] |\n\nAtenção: ${T} não é recomendado para [situação], porque [motivo].`,
      };
    },
    "Organize a pauta em H2/H3 claros (confirmar hierarquia no CMS)."() {
      const det = (ctx.subtitulos || []).slice(0, 6);
      return {
        porque: "Títulos claros dividem o conteúdo em respostas independentes. Isso facilita a leitura e permite que trechos sejam recuperados isoladamente.",
        observado: [f.evidencia, det.length ? `Detectados: ${det.map((s) => `“${s}”`).join(", ")}` : ""],
        passos: [
          "Use um único H1 com o tema principal.",
          "Transforme cada bloco de assunto em um H2 descritivo (evite títulos genéricos como “Introdução”).",
          "Use H3 para detalhar critérios, etapas ou perguntas dentro de cada H2.",
          "Confira no CMS se os títulos estão marcados como H2/H3: texto em negrito não conta como título.",
        ],
        estrutura: [
          H("H1", ctx.titulo || `${Tc}: guia completo`),
          H("H2", `O que é ${T}?`),
          H("H2", `Como escolher ${T}`), H("H3", "[Critério 1]"), H("H3", "[Critério 2]"),
          H("H2", `Onde usar ${T}`),
          H("H2", `Vantagens e desvantagens de ${T}`),
          H("H2", `Perguntas frequentes sobre ${T}`), H("H3", `[Pergunta real do público sobre ${T}]?`),
        ],
      };
    },
    "Use listas para critérios e passos quando facilitarem a leitura."() {
      return {
        porque: "Listas deixam critérios e etapas fáceis de escanear e costumam ser reaproveitadas diretamente em respostas geradas por IA.",
        passos: ["Converta enumerações longas em parágrafo para lista com marcadores.", "Comece cada item com a palavra-chave do critério.", "Use lista numerada quando a ordem importar."],
        modeloTitulo: "Modelo de lista",
        modelo: `Principais critérios para escolher ${T}:\n- [Critério 1]: [explicação curta]\n- [Critério 2]: [explicação curta]\n- [Critério 3]: [explicação curta]`,
      };
    },
    "Inclua dúvidas reais do usuário e respostas úteis, sem FAQ artificial."() {
      const q = ctx.perguntas || [];
      return {
        porque: "Buscas com IA são feitas em forma de pergunta. Responder dúvidas reais, com o texto da pergunta como título, aproxima o conteúdo dessas buscas.",
        observado: [f.evidencia, q.length ? `Perguntas já presentes: ${q.map((x) => `“${x}”`).join(", ")}` : ""],
        passos: [
          "Colete dúvidas reais: “As pessoas também perguntam” do Google, SAC, vendas e busca interna do site.",
          "Use a pergunta exatamente como o público escreve, em um H3.",
          "Responda em 2–4 frases, começando pela resposta direta.",
        ],
        estrutura: [
          H("H2", `Perguntas frequentes sobre ${T}`),
          H("H3", `Qual a diferença entre ${T} e ${alt}?`),
          H("H3", `Onde posso usar ${T}?`),
          H("H3", `Quanto custa ${T}?`),
          H("H3", `Como fazer a manutenção de ${T}?`),
          H("H3", `${Tc} vale a pena?`),
        ],
        modeloTitulo: "Modelo de pergunta e resposta",
        modelo: `${Tc} vale a pena?\nSim, quando [condição principal]. ${Tc} oferece [benefício], mas exige [cuidado]. Para [situação específica], considere ${alt}.`,
      };
    },
    "Acrescente critérios de escolha ou um passo a passo quando pertinente."() {
      return {
        porque: "Conteúdos que orientam a decisão respondem às perguntas “como escolher” e “o que considerar”, muito frequentes em buscas com IA.",
        passos: ["Defina de 3 a 5 critérios objetivos de escolha.", "Organize em ordem de decisão (do mais ao menos importante).", "Explique cada passo em uma ou duas frases."],
        estrutura: [H("H2", `Como escolher ${T}: passo a passo`), H("H3", "1. Defina [necessidade ou ambiente]"), H("H3", "2. Compare [critério técnico]"), H("H3", "3. Verifique [condição ou norma]"), H("H3", "4. Considere [custo e manutenção]")],
        modeloTitulo: "Modelo de passo a passo",
        modelo: `Para escolher ${T}:\n1. Defina [onde será usado e qual a necessidade].\n2. Compare [critério técnico principal].\n3. Verifique [norma, certificação ou especificação].\n4. Considere [custo, instalação e manutenção].`,
      };
    },
    "Cite fontes, documentos técnicos ou testes verificáveis, quando aplicável."() {
      return {
        porque: "Afirmações apoiadas em normas, fichas técnicas e testes aumentam a confiabilidade do conteúdo para leitores e para sistemas de IA.",
        passos: ["Identifique as afirmações técnicas do texto (medidas, desempenho, durabilidade).", "Associe cada uma a uma fonte: norma, ficha técnica, laudo ou estudo.", "Cite a fonte na própria frase, de forma natural."],
        modeloTitulo: "Modelos de citação",
        modelo: `Segundo a norma [ABNT NBR xxxx], ${T} deve [requisito].\nDe acordo com a ficha técnica do produto, [dado técnico].\nEm testes realizados por [laboratório ou instituição], [resultado].`,
      };
    },
    "Inclua referências conferíveis para afirmações técnicas; URLs não substituem verificação.": function () {
      return {
        porque: "Referências que podem ser conferidas permitem que leitores e revisores validem as informações técnicas.",
        passos: ["Inclua o nome do documento, a instituição e o ano.", "Adicione o link para a fonte original quando ela for pública.", "Agrupe as referências ao final em uma seção própria."],
        estrutura: [H("H2", "Referências")],
        modeloTitulo: "Modelo de referência",
        modelo: `- [Nome do documento ou norma] — [instituição], [ano]. Disponível em: https://[endereço]\n- Ficha técnica: [produto] — [marca]. Disponível em: https://[endereço]`,
      };
    },
    "Simplifique frases extensas e evite linguagem excessivamente promocional."() {
      return {
        porque: "Frases curtas e objetivas são mais fáceis de entender e de serem reaproveitadas como resposta. Linguagem promocional reduz a percepção de confiabilidade.",
        observado: [`Média de ${fmtNum(m.media_palavras_por_frase ?? "—")} palavras por frase (referência: 15 a 20).`],
        passos: ["Divida frases com mais de 25 palavras em duas.", "Troque adjetivos vagos (“incrível”, “perfeito”) por dados verificáveis.", "Prefira a ordem direta: sujeito, verbo, complemento."],
        modeloTitulo: "Antes e depois",
        modelo: `Antes: “O produto, desenvolvido com a mais alta tecnologia do mercado para oferecer resultados incríveis, é a escolha perfeita para quem busca qualidade.”\nDepois: “O produto tem [característica verificável]. É indicado para [uso principal].”`,
      };
    },
    "Evite repetição artificial de palavras-chave e slogans."() {
      const top = (m.termos_frequentes || []).slice(0, 5).map(([t, n]) => `${t} (${n}×)`);
      return {
        porque: "Repetição excessiva prejudica a leitura e não aumenta a relevância. Variações naturais do tema ajudam a cobrir mais formas de pergunta.",
        observado: [f.evidencia, top.length ? `Termos mais repetidos: ${top.join(", ")}` : ""],
        passos: ["Mantenha o termo principal no título, na abertura e onde for necessário.", "Nas demais ocorrências, use pronomes, sinônimos ou variações.", "Remova slogans repetidos que não acrescentam informação."],
      };
    },
    "Deixe o tema principal explícito em um título (H1/H2) logo no início do texto."() {
      return {
        porque: "Um título explícito indica a leitores e à IA qual pergunta o conteúdo responde.",
        passos: ["Crie um H1 com o tema principal.", "Se o tema for uma pergunta, use a pergunta como título."],
        estrutura: [H("H1", `${Tc}: [o que o leitor vai aprender]`), H("H2", `O que é ${T}?`)],
      };
    },
    "Verifique se o PDF contém texto selecionável e se o arquivo está completo."() {
      return {
        porque: "A análise lê apenas texto selecionável. PDFs gerados a partir de imagem ou digitalização não têm texto para avaliar.",
        passos: ["Abra o PDF e tente selecionar um trecho: se não for possível, o arquivo é uma imagem.", "Exporte o PDF novamente a partir do Word, Google Docs ou CMS.", "Se só houver a versão digitalizada, aplique OCR antes da análise.", "Confira se todas as páginas foram incluídas."],
      };
    },
  };

  const rule = rules[f.acao];
  const extra = rule ? rule() : { passos: [f.acao] };
  const out = { ...base, ...extra };
  out.observado = (out.observado || []).filter(Boolean);
  if (!out.passos.length) out.passos = [f.acao];
  return out;
}

/** Versão em texto simples (para copiar ou incluir no relatório). */
export function suggestionToText(s) {
  const parts = [s.titulo];
  if (s.passos.length) parts.push("O que fazer:\n" + s.passos.map((p, i) => `${i + 1}. ${p}`).join("\n"));
  if (s.estrutura.length) parts.push("Estrutura sugerida:\n" + s.estrutura.map((h) => `${h.nivel === "H3" ? "   " : ""}${h.nivel}: ${h.texto}`).join("\n"));
  if (s.modelo) parts.push(`${s.modeloTitulo}:\n${s.modelo}`);
  return parts.join("\n\n");
}
