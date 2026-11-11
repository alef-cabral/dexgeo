# DexGEO — versão Netlify

Diagnóstico editorial de conteúdo orientado a GEO, com nota explicável de 0 a 100.
O PDF é lido e analisado no próprio navegador de quem usa (o arquivo não é enviado).
Para o **painel de uso**, o app registra nome, área e o resultado de cada análise via
Netlify Functions + Netlify Blobs (sem banco de dados externo).

## Estrutura

```
public/                 ← pasta publicada no Netlify
  index.html            Interface (identificação, upload, resultados, exportação)
  styles.css            Visual (Montserrat, azul em gradiente)
  app.js                Lógica da interface
  worker.js             Executa leitura do PDF + análise fora da thread da tela
  analyzer.js           Port fiel do analyzer.py (mesmas regras, pesos e arredondamentos)
  suggestions.js        Sugestões do pop-up "Ver sugestão do que fazer" (passos, H1/H2/H3, modelos)
  pdftext.js            Extração de texto idêntica ao PyMuPDF get_text("text", sort=True)
  vendor/mupdf-1.28.1/  MuPDF em WebAssembly (mesmo motor do PyMuPDF)
  assets/logo.png       Logotipo (exibido sobre placa azul-marinho para contraste)
  licencas.html         Licenças e código-fonte
  report.js             Relatório HTML (usado no app e no painel)
  tracking.js           Registro de uso (acesso, análise, download)
  painel-ppojsrd8gvv7q7/ Painel administrativo (endereço não divulgado)
netlify/functions/      registro.mjs (POST /api/registro) e painel.mjs (API do painel)
netlify/lib/store.mjs   Acesso ao Netlify Blobs (store por contexto de deploy)
scripts/dev-server.mjs  Simulador local do Netlify (npm run dev)
netlify.toml            Configuração do Netlify (pasta publicada, functions, cabeçalhos)
python_original/        Versão Python original (referência; não é publicada)
tests/                  Teste de paridade Python × JavaScript
```

## Publicar no Netlify via GitHub

1. **Crie o repositório**: em github.com → *New repository* → nome `dexgeo` → *Create repository*.
2. **Envie os arquivos**: na página do repositório, *uploading an existing file* → arraste
   **todo o conteúdo** desta pasta (inclusive `netlify.toml` e a pasta `public`) → *Commit changes*.
3. **Conecte ao Netlify**: em app.netlify.com → *Add new project* → *Import an existing project*
   → *GitHub* → autorize → escolha `dexgeo`.
4. **Confirme as configurações** (já vêm do `netlify.toml`): *Publish directory* = `public`.
   Não é preciso alterar nada. Clique em *Deploy*.
5. Em ~1 minuto o site fica em `https://<nome>.netlify.app`. Para trocar o nome:
   *Project configuration → Change project name*.

A cada novo commit no GitHub, o Netlify publica a atualização automaticamente.

> Publique **pelo GitHub**: o Netlify Drop (arrastar a pasta) não publica as Functions,
> então o painel de uso não funcionaria.

## Painel de uso (administração)

- Endereço: `https://<seu-site>.netlify.app/painel-ppojsrd8gvv7q7/`
- Não aparece em nenhum link do app e está marcado como `noindex` (não vai para buscadores).
- Mostra: acessos, análises, pessoas, áreas, nota média, downloads; atividade por dia,
  áreas que mais usam, marcas mais exploradas, horário de uso, distribuição das notas;
  tabela de pessoas e de análises com download do **relatório HTML** e do JSON; exportação CSV.
- Filtros: período (7/30/90 dias, tudo ou datas), área, pessoa e nome do arquivo.

### Segurança do painel
Não há login (como solicitado). A proteção é:
1. o endereço secreto da página;
2. uma chave exigida pela API do painel (cabeçalho `x-dexgeo-admin`).

**Recomendado após publicar:** em Netlify → *Project configuration → Environment variables*,
crie `DEXGEO_ADMIN_KEY` com um valor só seu e faça um novo deploy. No primeiro acesso ao
painel, ele pedirá a nova chave (fica salva naquele navegador).

Para trocar o endereço do painel, renomeie a pasta `public/painel-ppojsrd8gvv7q7/` e ajuste
o caminho correspondente em `netlify.toml`.

### Dados e LGPD
São registrados: nome, área, data/hora, tipo de dispositivo, nome do arquivo, título do
documento, nota, critérios e menções de marca. O conteúdo do PDF não é registrado.
A tela inicial informa isso ao usuário. No painel é possível excluir análises.

## Logotipo
O logotipo está em `public/assets/logo.png`. Para trocar, substitua o arquivo (mesmo nome) e publique
de novo. A cor da placa atrás dele é a variável `--navy` em `public/styles.css`.

## Testar no computador antes de publicar
```bash
npm install
npm run dev
# app:    http://localhost:8888
# painel: http://localhost:8888/painel-ppojsrd8gvv7q7/
```
(Abrir o `index.html` com duplo clique não funciona: o navegador bloqueia módulos e WebAssembly em `file://`.)

## Equivalência com a versão Python
`analyzer.js` e `pdftext.js` reproduzem o `analyzer.py` e o `page.get_text("text", sort=True)`
do PyMuPDF 1.28 (versão instalada pelo `requirements.txt` original). Para verificar:

```bash
pip install "pymupdf==1.28.2"
npm test -- caminho/para/pasta-com-pdfs   # compara texto extraído e resultado completo
```

## Licenças
O leitor de PDF (MuPDF) é licenciado sob AGPL-3.0 — a mesma licença do PyMuPDF usado na
versão Python. Em um site público, o código-fonte deve ficar acessível: o código da
aplicação já é servido sem minificação e a página `licencas.html` aponta para as fontes.
Se o repositório no GitHub for público, preencha `REPO_URL` em `public/licencas.html`.
