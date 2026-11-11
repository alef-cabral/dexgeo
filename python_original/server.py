"""DexGEO Web — API FastAPI que expõe o analyzer.py e serve o front-end em /static.

Execução:
    uvicorn server:app --reload --port 8000
Depois, abra http://localhost:8000
"""
from __future__ import annotations

from pathlib import Path

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from analyzer import WEIGHTS, analyze

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

MAX_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_PAGES = 50
MIN_CHARS = 100

app = FastAPI(title="DexGEO API", version="0.2.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "produto": "DexGEO", "versao": "Web 0.2"}


@app.get("/api/config")
def config():
    """Valores padrão usados pelo front-end."""
    return {
        "pesos": WEIGHTS,
        "marcas_padrao": ["Dexco", "Deca", "Portinari", "Ceusa", "Durafloor", "Duratex"],
        "limites": {"max_mb": MAX_BYTES // (1024 * 1024), "max_paginas": MAX_PAGES},
    }


@app.post("/api/analyze")
async def analyze_pdf(
    file: UploadFile = File(...),
    topic: str = Form(""),
    brands: str = Form(""),
    user_name: str = Form(""),
    user_area: str = Form(""),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Envie um arquivo no formato PDF.")

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "O limite é de 20 MB por arquivo.")

    try:
        pdf = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Não foi possível ler esse PDF: {exc}") from exc

    if pdf.page_count > MAX_PAGES:
        raise HTTPException(422, f"Envie um documento com até {MAX_PAGES} páginas.")

    text = "\n\n".join(page.get_text("text", sort=True) for page in pdf)
    pages = pdf.page_count
    pdf.close()

    if len(text.strip()) < MIN_CHARS:
        raise HTTPException(
            422,
            "Não foi encontrado texto selecionável suficiente. Este PDF pode ser "
            "digitalizado; use OCR antes da análise.",
        )

    res = analyze(
        text,
        topic=topic,
        brands=[b for b in brands.splitlines() if b.strip()] or None,
        filename=file.filename,
        page_count=pages,
    )
    # Identificação de quem utilizou a ferramenta (sem login)
    res["usuario"] = {"nome": user_name.strip(), "area": user_area.strip()}
    return JSONResponse(res)


# Front-end estático
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")
