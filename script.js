from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import json
import fitz  # pip install PyMuPDF
import difflib

app = FastAPI()

# Para permitir que GitHub Pages haga requests al backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Carga de archivos JSON
with open("data/indicators.json") as f:
    indicators = json.load(f)
with open("data/advices.json") as f:
    advices = json.load(f)
# Aquí cargar F{Cargo} y P{Cargo} según necesites

@app.post("/analizar")
async def analizar(nombre: str = Form(...), capitulo: str = Form(...), cargo: str = Form(...), hvfile: UploadFile = UploadFile(...)):
    # Leer PDF
    pdf_bytes = await hvfile.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()

    # Aquí iría la lógica de análisis de cada sección
    # Ejemplo: calcular similitud con funciones y perfil
    # score_funciones = ...
    # score_perfil = ...
    # score_palabras_clave = ...

    # Ejemplo de respuesta
    resultado = {
        "titulo": f"Análisis hoja de vida {nombre} - {cargo}",
        "perfil": {"funciones": 4, "perfil": 3.5},
        "experiencia": {
            "Experiencia en ANEIAP": 4,
            "Eventos organizados": 3,
            "Asistencia a eventos": 4,
            "consejos": ["Mejorar la redacción de logros académicos."]
        },
        "global": 3.8,
        "comentarios": "Buen desempeño, se recomienda reforzar la experiencia en eventos."
    }

    return resultado
