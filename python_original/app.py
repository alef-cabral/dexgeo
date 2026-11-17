import io, json
from html import escape
import fitz
import pandas as pd
import streamlit as st
from analyzer import analyze, WEIGHTS

st.set_page_config(page_title='DexGEO | Diagnóstico editorial',page_icon='🧭',layout='wide')
st.markdown('''<style>
.block-container{max-width:1200px;padding-top:2rem}.hero{background:linear-gradient(110deg,#081c38,#124b80);border-radius:18px;padding:25px 30px;color:white;margin-bottom:22px}.hero h1{color:white;margin:0}.hero p{color:#d4e6f5;margin:8px 0 0}.stMetric{border:1px solid #e2e8f0;border-radius:12px;padding:16px}.hint{color:#67768c;font-size:13px}
</style>''',unsafe_allow_html=True)
st.markdown('<div class="hero"><h1>DexGEO</h1><p>Diagnóstico editorial de conteúdo para resultados de inteligência artificial </p></div>',unsafe_allow_html=True)
st.info('O score mede aderência a critérios editoriais. Não é uma previsão de posicionamento nem substitui auditoria de SEO da URL publicada.')
with st.sidebar:
 st.header('Configuração da análise')
 topic=st.text_input('Tema ou pergunta principal',placeholder='Ex.: Qual porcelanato usar em área externa?')
 brand_text=st.text_area('Marcas monitoradas (uma por linha)',value='Dexco\nDeca\nPortinari\nCeusa\nDurafloor\nDuratex',height=155)
 st.caption('A classificação branded/non-branded depende das marcas configuradas e é uma aproximação do texto, não da intenção da consulta.')
 st.divider()
 st.markdown('**Limites**')
 st.caption('PDF textual, até 20 MB, até 50 páginas. Sem envio a APIs externas, sem OCR e sem avaliação semântica por LLM.')
 st.markdown('[Diretrizes oficiais Google](https://developers.google.com/search/docs/appearance/ai-features?hl=pt-br)')
file=st.file_uploader('Envie um PDF com o texto que deseja analisar',type=['pdf'])
if not file:
 st.markdown('### O relatório incluirá')
 st.markdown('**Nota 0–100** · **7 dimensões** · **Contagem de palavras** · **Branded/non-branded** · **Acertos** · **Problemas** · **Melhorias priorizadas** · **Exportação em JSON e HTML**')
 st.stop()
if file.size>20*1024*1024:
 st.error('O limite é de 20 MB por arquivo.');st.stop()
try:
 pdf=fitz.open(stream=file.getvalue(),filetype='pdf')
 if pdf.page_count>50:st.error('Envie um documento com até 50 páginas.');st.stop()
 chunks=[page.get_text('text',sort=True) for page in pdf]
 text='\n\n'.join(chunks)
 pages=pdf.page_count
except Exception as exc:
 st.error(f'Não foi possível ler esse PDF: {exc}');st.stop()
if len(text.strip())<100:
 st.error('Não foi encontrado texto selecionável suficiente. Este PDF pode ser digitalizado; use OCR antes da análise.');st.stop()
res=analyze(text,topic=topic,brands=brand_text.splitlines(),filename=file.name,page_count=pages)
st.subheader('Visão geral')
a,b,c,d=st.columns(4)
a.metric('DexGEO Score',f"{res['score']}/100")
b.metric('Palavras',f"{res['metricas']['palavras']:,}".replace(',','.'))
c.metric('Perguntas',res['metricas']['perguntas'])
d.metric('Páginas',pages)
st.progress(res['score']/100)
st.write('**Diagnóstico:**',res['faixa'])
st.write('**Perfil de marca:**',res['intencao_de_marca'])
if res['metricas']['palavras']<500:st.warning('Texto abaixo de 500 palavras. Avalie se o tamanho é suficiente para a intenção; o patamar não é requisito oficial de GEO.')
else:st.success('O texto tem pelo menos 500 palavras; extensão, por si só, não garante profundidade.')
st.subheader('Pontuação por dimensão')
rows=[{'Critério':k,'Pontos':v,'Máximo':res['pesos'][k],'Aproveitamento (%)':round(v/res['pesos'][k]*100)} for k,v in res['pontuacoes'].items()]
st.dataframe(pd.DataFrame(rows),hide_index=True,use_container_width=True)
col1,col2=st.columns(2)
with col1:
 st.subheader('O que está bom')
 if res['acertos']:
  for x in res['acertos']:st.markdown(f'✅ {x}')
 else:st.write('Nenhum sinal positivo detectado pelas regras automáticas.')
with col2:
 st.subheader('O que precisa melhorar')
 if res['melhorias']:
  for x in res['melhorias']:st.markdown(f"**[{x['impacto']}] {x['criterio']}** — {x['acao']}")
 else:st.write('Nenhuma pendência heurística identificada.')
st.subheader('Auditoria detalhada')
for item in res['criterios']:
 with st.expander(f"{'✅' if item['status']=='Atendido' else '⚠️'} {item['criterio']} — {item['evidencia']}"):
  st.write('**Critério:**',item['criterio']);st.write('**Evidência observada:**',item['evidencia']);st.write('**Ação recomendada:**',item['acao']);st.write('**Prioridade:**',item['impacto'])
st.subheader('Distribuição de marcas')
st.json(res['metricas']['marcas_detectadas'],expanded=False)
st.subheader('Exportar diagnóstico')
report_json=json.dumps(res,ensure_ascii=False,indent=2)
html_rows=''.join(f"<tr><td>{escape(k)}</td><td>{v}/{res['pesos'][k]}</td></tr>" for k,v in res['pontuacoes'].items())
html_issues=''.join(f"<li><b>{escape(x['impacto'])} · {escape(x['criterio'])}:</b> {escape(x['acao'])}<br><small>{escape(x['evidencia'])}</small></li>" for x in res['melhorias'])
html_report=f'''<!doctype html><html lang="pt-br"><meta charset="utf-8"><title>DexGEO - {escape(file.name)}</title><style>body{{font:15px Arial;max-width:850px;margin:48px auto;color:#16314b;line-height:1.55}}header{{background:#09284b;color:white;padding:24px;border-radius:12px}}h1{{margin:0}}.score{{font-size:42px;font-weight:bold}}table{{border-collapse:collapse;width:100%}}td{{border-bottom:1px solid #ddd;padding:9px}}li{{margin:12px 0}}small{{color:#607183}}@media print{{body{{margin:22mm}}}}</style><header><h1>DexGEO</h1><p>Diagnóstico editorial · {escape(file.name)}</p></header><h2>Resultado: <span class="score">{res['score']}/100</span></h2><p>{escape(res['faixa'])} · {res['metricas']['palavras']} palavras · {escape(res['intencao_de_marca'])}</p><h2>Pontuação por critério</h2><table>{html_rows}</table><h2>Recomendações priorizadas</h2><ol>{html_issues}</ol><h2>Limitações</h2><ul>{''.join('<li>'+escape(x)+'</li>' for x in res['ressalvas'])}</ul></html>'''
x,y=st.columns(2)
x.download_button('📥 Baixar relatório JSON',report_json,file_name='dexgeo_diagnostico.json',mime='application/json',use_container_width=True)
y.download_button('📄 Baixar relatório HTML (imprimível)',html_report,file_name='dexgeo_relatorio.html',mime='text/html',use_container_width=True)
st.caption('Os arquivos são processados em memória na execução da aplicação. Para implantação corporativa, configure retenção, logs, acesso, criptografia e LGPD.')
