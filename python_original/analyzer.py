"""DexGEO 1.0 - transparent heuristic editorial audit, NOT an AI ranking predictor."""
from __future__ import annotations
import re, math, unicodedata
from collections import Counter
from datetime import datetime, timezone

WEIGHTS = {
    'Clareza e resposta objetiva':20,
    'Cobertura e profundidade':20,
    'Estrutura e escaneabilidade':15,
    'Perguntas e intenção de busca':15,
    'Confiabilidade e evidências':15,
    'Linguagem e naturalidade':10,
    'Marca e identificação':5,
}
QUESTION_WORDS = r'(?:como|qual|quais|quando|onde|por\s+que|quanto|quantos|o\s+que|é\s+possível|vale\s+a\s+pena|pode|deve)'
COMP = r'\b(comparad[oa]s?|diferenças?|versus|\bvs\.?\b|melhor|pior|vantagens?|desvantagens?|comparação|critérios?)\b'
EVIDENCE = r'\b(segundo|conforme|fonte|referênci[ao]s?|estudo|pesquisa|norma(?:s)?|abnt|inmetro|ensaio|teste|laborat[oó]rio|metodologia|dados|relat[oó]rio|certificad[oa]|documentação|ficha técnica)\b'
SIGNALS = {
 'numeric':r'\b\d+(?:[,.]\d+)?\s*(?:%|mm|cm|m²|m2|kg|anos?|meses?|dias?|r\$|reais|n|mpa)\b',
 'examples':r'\b(por exemplo|exemplos?|na prática|cenário|situação|caso de uso|aplicação|ambiente)\b',
 'limitations':r'\b(depende|atenção|limitaç(?:ão|ões)|evite|não recomendado|restriç(?:ão|ões)|cuidado|exceto|porém|entretanto)\b',
 'action':r'\b(para escolher|recomendamos|passo a passo|primeiro|em seguida|verifique|considere|avalie|confira|escolha|identifique|compare)\b',
}
STOPWORDS=set('a o as os e de do da dos das em no na nos nas um uma uns umas para por com que se ao aos à às é são ser foi mais menos como qual quais quando onde sobre até já muito também entre seu sua seus suas ele ela isso este esta esse essa pode podem'.split())

def norm(text):
 return ''.join(c for c in unicodedata.normalize('NFKD',str(text).lower()) if not unicodedata.combining(c))
def match(pattern,text): return bool(re.search(pattern,text,re.I|re.M))
def words(text): return re.findall(r"[\wÀ-ÿ]+(?:[-'][\wÀ-ÿ]+)*",text)
def sentences(text): return [x.strip() for x in re.split(r'(?<=[.!?])\s+|\n{2,}',text) if len(x.strip())>8]
def clamp(x,a=0,b=1):return max(a,min(b,x))
def round_score(raw, weight):return round(clamp(raw)*weight,1)
def finding(criteria,passed,reason,action,impact='Média'):
 return {'criterio':criteria,'status':'Atendido' if passed else 'Melhorar','evidencia':reason,'acao':action,'impacto':impact}

def analyze(text, topic='', brands=None, filename='documento.pdf', page_count=None):
 brands=[b.strip() for b in (brands or ['Dexco','Deca','Portinari','Ceusa','Durafloor','Duratex']) if b.strip()]
 text=re.sub(r'[ \t]+',' ',text or '').strip()
 paras=[p.strip() for p in re.split(r'\n\s*\n',text) if len(p.strip())>25]
 lines=[l.strip() for l in text.splitlines() if l.strip()]
 ws=words(text); wc=len(ws); ss=sentences(text); sc=len(ss)
 avg_sentence=round(sum(len(words(s)) for s in ss)/max(sc,1),1)
 question_lines=[l for l in lines if '?' in l and len(l)<180]
 question_count=len(re.findall(r'\?',text))
 headings=[l for l in lines if len(l)<110 and (re.match(r'^(?:#{1,5}\s+|\d+(?:\.\d+)*[.)]?\s+|(?:pergunta|resposta|introdução|conclusão|benefícios|vantagens|desvantagens|aplicações|características|como escolher|qual|quando|onde|porque|por que)\b)',l,re.I) or (len(words(l))<=11 and not re.search(r'[.!?;]$',l) and len(l)>8))]
 headings=headings[:100]
 lead=' '.join(ws[:100]); first_para=paras[0] if paras else text[:600]
 has_topic=bool(topic.strip()) and norm(topic) in norm(text)
 answer_direct=bool(re.search(r'\b(é|são|significa|consiste|serve|indicado|recomendado|utilizado|depende|permite|possui|apresenta)\b',first_para,re.I))
 question_intent=bool(question_count or re.search(QUESTION_WORDS+r'.{5,90}',text,re.I))
 evidence_hits=len(re.findall(EVIDENCE,text,re.I))
 urls=re.findall(r'https?://[^\s)>]+|\bwww\.[\w.-]+',text,re.I)
 figures=len(re.findall(SIGNALS['numeric'],text,re.I))
 examples=match(SIGNALS['examples'],text)
 limitations=match(SIGNALS['limitations'],text)
 actions=match(SIGNALS['action'],text)
 comparison=match(COMP,text)
 bullets=len([l for l in lines if re.match(r'^(?:[-•*]|\d+[.)])\s+',l)])
 brands_hits={brand:len(re.findall(r'(?<!\w)'+re.escape(brand)+r'(?!\w)',text,re.I)) for brand in brands}
 brand_total=sum(brands_hits.values())
 brand_density=100*brand_total/max(wc,1)
 branded_label = ('Branded' if brand_total>=3 and brand_density>=.65 else 'Misto' if brand_total>=1 else 'Non-branded (sem marcas configuradas detectadas)')
 if not brands: branded_label='Indeterminado (configure marcas)'
 top_tokens=[norm(w) for w in ws if len(w)>=4 and norm(w) not in STOPWORDS]
 freq=Counter(top_tokens)
 repeat_ratio=sum(c for c in freq.values() if c>=8)/max(len(top_tokens),1)
 findings=[]
 # 1 clarity
 c1=.42*int(answer_direct)+.25*int(has_topic or not topic.strip())+.18*int(bool(paras) and len(words(first_para))<=155)+.15*int(bool(headings))
 findings.append(finding('Clareza e resposta objetiva',answer_direct,'Abertura com resposta identificável' if answer_direct else 'Não foi identificada resposta direta na abertura','Abra com 1–3 frases que respondam à pergunta principal.', 'Alta'))
 if topic.strip(): findings.append(finding('Clareza e resposta objetiva',has_topic,'Tema-alvo encontrado no texto' if has_topic else f'O tema-alvo “{topic}” não aparece literalmente no documento','Introduza o tema principal naturalmente no título e no contexto inicial.','Alta'))
 # 2 coverage (500 heuristic but no hard requirement)
 volume=clamp(wc/600)
 c2=.40*volume+.15*int(examples)+.15*int(comparison)+.15*int(limitations)+.15*int(actions)
 findings.append(finding('Cobertura e profundidade',wc>=500,f'{wc} palavras extraídas; 500 é apenas uma referência operacional','Se necessário, desenvolva critérios, exemplos e limitações relevantes; não aumente texto artificialmente.','Média'))
 findings.append(finding('Cobertura e profundidade',examples,'Exemplos/aplicações encontrados' if examples else 'Sem exemplo prático identificado','Inclua ao menos um exemplo concreto de aplicação.', 'Média'))
 findings.append(finding('Cobertura e profundidade',comparison or limitations,'Comparações ou ressalvas detectadas' if comparison or limitations else 'Faltam comparações e ressalvas identificáveis','Explique quando cada alternativa é adequada, incluindo exceções e cuidados.','Alta'))
 # 3 structure
 c3=.35*int(len(headings)>=2)+.20*int(len(paras)>=3)+.20*int(bullets>=2)+.25*int(len(headings)>=4)
 findings.append(finding('Estrutura e escaneabilidade',len(headings)>=2,f'{len(headings)} possíveis títulos/subtítulos detectados','Organize a pauta em H2/H3 claros (confirmar hierarquia no CMS).','Alta'))
 findings.append(finding('Estrutura e escaneabilidade',bullets>=2,f'{bullets} linhas de lista detectadas','Use listas para critérios e passos quando facilitarem a leitura.','Média'))
 # 4 intent
 c4=.45*int(question_intent)+.30*int(question_count>=2)+.25*int(actions or comparison)
 findings.append(finding('Perguntas e intenção de busca',question_count>=2,f'{question_count} perguntas explícitas detectadas','Inclua dúvidas reais do usuário e respostas úteis, sem FAQ artificial.','Alta'))
 findings.append(finding('Perguntas e intenção de busca',actions or comparison,'Orientação de decisão encontrada' if actions or comparison else 'Orientação de decisão pouco explícita','Acrescente critérios de escolha ou um passo a passo quando pertinente.','Alta'))
 # 5 evidence
 c5=.45*int(evidence_hits>=1)+.20*int(evidence_hits>=3)+.15*int(figures>=1)+.20*int(len(urls)>0)
 findings.append(finding('Confiabilidade e evidências',evidence_hits>=1,f'{evidence_hits} expressões relacionadas a fontes/evidências','Cite fontes, documentos técnicos ou testes verificáveis, quando aplicável.','Alta'))
 findings.append(finding('Confiabilidade e evidências',len(urls)>0,f'{len(urls)} URLs explícitas encontradas','Inclua referências conferíveis para afirmações técnicas; URLs não substituem verificação.','Alta'))
 # 6 language
 c6=.50*clamp(1-abs(avg_sentence-19)/27)+.25*int(repeat_ratio<.24)+.25*int(sc>=4)
 findings.append(finding('Linguagem e naturalidade',avg_sentence<=28,f'Média estimada de {avg_sentence} palavras por frase','Simplifique frases extensas e evite linguagem excessivamente promocional.','Média'))
 findings.append(finding('Linguagem e naturalidade',repeat_ratio<.24,f'Índice heurístico de repetição: {repeat_ratio:.0%}','Evite repetição artificial de palavras-chave e slogans.','Média'))
 # 7 brand (brand saturation not automatically rewarded)
 c7=.50*int(bool(topic.strip()) or len(headings)>=1)+.50*int(brand_total>0 or (brands and wc>250))
 findings.append(finding('Marca e identificação',bool(topic.strip()) or len(headings)>=1,'Contexto/tópico identificável','Deixe o tema principal explícito em um título (H1/H2) logo no início do texto.','Baixa'))
 raw=[c1,c2,c3,c4,c5,c6,c7]
 scores={k:round_score(r,w) for (k,w),r in zip(WEIGHTS.items(),raw)}
 score=round(sum(scores.values()))
 if score<40: verdict='Baixa adequação editorial'
 elif score<60: verdict='Precisa de melhorias importantes'
 elif score<80: verdict='Boa base, com oportunidades'
 else: verdict='Alta aderência aos critérios'
 strengths=[f['evidencia'] for f in findings if f['status']=='Atendido'][:6]
 improvement=[f for f in findings if f['status']=='Melhorar']
 impact_priority={'Alta':0,'Média':1,'Baixa':2}
 improvement.sort(key=lambda x:(impact_priority[x['impacto']],list(WEIGHTS).index(x['criterio'])))
 if wc<100:
  verdict='Texto insuficiente para avaliação editorial confiável'
  improvement.insert(0,finding('Cobertura e profundidade',False,f'Somente {wc} palavras extraídas','Verifique se o PDF contém texto selecionável e se o arquivo está completo.','Alta'))
 return {
 'produto':'DexGEO','versao':'1.0','arquivo':filename,'data_utc':datetime.now(timezone.utc).isoformat(),
 'tema_alvo':topic,'score':score,'faixa':verdict,'pontuacoes':scores,'pesos':WEIGHTS,
 'metricas':{'palavras':wc,'paginas':page_count,'frases':sc,'media_palavras_por_frase':avg_sentence,'paragrafos':len(paras),'possiveis_subtitulos':len(headings),'perguntas':question_count,'listas':bullets,'urls_de_referencia':len(urls),'sinais_de_evidencia':evidence_hits,'dados_numericos':figures,'marcas_detectadas':brands_hits,'densidade_mencoes_marca_pct':round(brand_density,2),'termos_frequentes':freq.most_common(10)},
 'intencao_de_marca':branded_label,'acertos':strengths,'melhorias':improvement,'criterios':findings,
 'ressalvas':['A nota mede aderência editorial aos critérios do DexGEO, não a chance real de citação ou posicionamento.','O PDF isolado não permite verificar indexação, links internos, schema, autoridade do domínio ou concorrentes.','Os sinais são heurísticos e precisam de validação humana, especialmente para conteúdos técnicos.','500 palavras é uma referência operacional, não um fator oficial de GEO.','A análise não inclui OCR: PDFs digitalizados precisam de texto selecionável.']
 }
