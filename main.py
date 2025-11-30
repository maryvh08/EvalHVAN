from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import json
import fitz  # PyMuPDF
from difflib import SequenceMatcher

app = FastAPI()

# Permitir requests desde frontend (GitHub Pages)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cargar JSONs
with open("data/indicators.json", encoding="utf-8") as f:
    indicators = json.load(f)
with open("data/advices.json", encoding="utf-8") as f:
    advices = json.load(f)

# Cargar todos los F{Cargo} y P{Cargo} dinámicamente
import glob
import os

F_files = {}
P_files = {}

for f in glob.glob("data/F*.json"):
    cargo = os.path.basename(f)[1:-5]  # Quitar F y .json
    with open(f, encoding="utf-8") as jf:
        F_files[cargo] = json.load(jf)

for f in glob.glob("data/P*.json"):
    cargo = os.path.basename(f)[1:-5]  # Quitar P y .json
    with open(f, encoding="utf-8") as jf:
        P_files[cargo] = json.load(jf)

# Función de similitud
def similitud(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

# Analizar sección de texto con lista de palabras clave
def analizar_texto(texto, lista_keywords):
    if not texto.strip():
        return 0
    scores = [max([similitud(palabra, palabra_json) for palabra_json in lista_keywords]) for palabra in texto.split()]
    if scores:
        return sum(scores)/len(scores) * 5  # Escalar a 1-5
    return 0

# Endpoint para analizar
@app.post("/analizar")
async def analizar(nombre: str = Form(...), capitulo: str = Form(...), cargo: str = Form(...), hvfile: UploadFile = UploadFile(...)):
    # Leer PDF
    pdf_bytes = await hvfile.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()

    # Secciones básicas
    secciones = {
        "Perfil": "",
        "Asistencia a eventos": "",
        "Experiencia en ANEIAP": "",
        "Eventos organizados": ""
    }

    # Extraer secciones usando delimitadores
    def extraer_seccion(texto, inicio, fin):
        try:
            start = texto.index(inicio) + len(inicio)
            end = texto.index(fin)
            return texto[start:end].strip()
        except ValueError:
            return ""

    secciones["Perfil"] = extraer_seccion(text, "Perfil", "Estudios realizados")
    secciones["Asistencia a eventos"] = extraer_seccion(text, "Estudios realizados", "Actualización profesional")
    secciones["Experiencia en ANEIAP"] = extraer_seccion(text, "Actualización profesional", "Eventos organizados")
    secciones["Eventos organizados"] = extraer_seccion(text, "Experiencia en ANEIAP", "Experiencia laboral") or extraer_seccion(text, "Experiencia en ANEIAP", "Firma")

    # Analizar cada sección con JSONs
    resultado = {
        "titulo": f"Análisis hoja de vida {nombre} - {cargo}",
        "perfil": {},
        "experiencia": {},
        "global": 0,
        "comentarios": ""
    }

    # Perfil del aspirante
    funciones = F_files.get(cargo, [])
    perfiles = P_files.get(cargo, [])
    indicadores = indicators.get(capitulo, {}).get(cargo, {})

    perfil_texto = secciones["Perfil"]
    resultado["perfil"]["funciones"] = analizar_texto(perfil_texto, funciones)
    resultado["perfil"]["perfil"] = analizar_texto(perfil_texto, perfiles)

    # Experiencia en ANEIAP, Asistencia, Eventos
    for key in ["Asistencia a eventos", "Eventos organizados", "Experiencia en ANEIAP"]:
        texto = secciones[key]
        # Usar keywords de indicadores del cargo
        all_keywords = []
        for ind in indicadores.values():
            all_keywords.extend(ind)
        score = analizar_texto(texto, all_keywords)
        resultado["experiencia"][key] = round(score,2)
        if score < 3.5:
            # Agregar consejos si hay
            for ind_name, consejos in advices.get(cargo, {}).items():
                resultado["experiencia"].setdefault("consejos", []).extend(consejos)

    # Puntaje global promedio
    scores = list(resultado["perfil"].values()) + [v for k,v in resultado["experiencia"].items() if k != "consejos"]
    resultado["global"] = round(sum(scores)/len(scores),2)
    resultado["comentarios"] = "Buen desempeño, revisa los consejos para mejorar algunas secciones." if resultado["global"] >=3 else "Se recomienda reforzar las secciones con baja puntuación."

    return resultado
