"""Referência: mesmo fluxo do server.py (PyMuPDF + analyzer.py). Uso: python ref.py arquivo.pdf [tema] [marcas separadas por |]"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python_original'))
import pymupdf as fitz
from analyzer import analyze
path=sys.argv[1]; topic=sys.argv[2] if len(sys.argv)>2 else ''; brands=sys.argv[3].split('|') if len(sys.argv)>3 and sys.argv[3] else None
out={}
try:
    pdf=fitz.open(stream=open(path,'rb').read(),filetype='pdf')
    if pdf.page_count>50: out={'error':'Envie um documento com até 50 páginas.'}
    else:
        try: text='\n\n'.join(p.get_text('text',sort=True) for p in pdf)
        except Exception as e:
            print(json.dumps({'error':'500: '+str(e)},ensure_ascii=False)); sys.exit()
        out['text']=text
        if len(text.strip())<100: out['error']='Não foi encontrado texto selecionável suficiente. Este PDF pode ser digitalizado; use OCR antes da análise.'
        else: out['res']=analyze(text,topic=topic,brands=[b for b in (brands or []) if b.strip()] or None,filename=os.path.basename(path),page_count=pdf.page_count)
except Exception as e: out={'error':'open: '+str(e)}
print(json.dumps(out,ensure_ascii=False))
