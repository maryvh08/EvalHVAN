from flask import Flask, render_template, request
import json
import PyPDF2
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


app = Flask(__name__)

# Lista de capítulos
CAPITULOS = [
    "UNIGUAJIRA", "UNIMAGDALENA", "UNINORTE", "UNIATLÁNTICO", "CUC", "UNISIMÓN",
    "LIBREQUILLA", "UTB", "UFPS", "UNALMED", "UPBMED", "UDEA", "UTP", "UNALMA",
    "LIBRECALI", "UNIVALLE", "ICESI", "UAO", "USC", "UDISTRITAL", "UNALBOG",
    "UPBMONTERÍA", "AREANDINA", "UNICÓDOBA"
]


# -----------------------------------------------------------
# EXTRACCIÓN DE TEXTO PDF
# -----------------------------------------------------------
def extract_pdf_text(file):
    try:
        reader = PyPDF2.PdfReader(file)
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() + "\n"
        return full_text
    except:
        return ""


# -----------------------------------------------------------
# LIMPIEZA DE TEXTO
# -----------------------------------------------------------
def clean(text):
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text


# -----------------------------------------------------------
# SIMILITUD SEMÁNTICA
# -----------------------------------------------------------
def similarity(a, b):
    vect = TfidfVectorizer().fit_transform([a, b])
    return cosine_similarity(vect)[0][1]


# -----------------------------------------------------------
# REPORTE
# -----------------------------------------------------------
def generar_reporte(fun, perf, cv):
    f = clean(fun)
    p = clean(perf)
    c = clean(cv)

    sim_fun_cv = similarity(f, c)
    sim_prof_cv = similarity(p, c)
    sim_fun_prof = similarity(f, p)

    reporte = {
        "sim_fun_cv": round(sim_fun_cv, 2),
        "sim_prof_cv": round(sim_prof_cv, 2),
        "sim_fun_prof": round(sim_fun_prof, 2),
        "con_fun": "Alta relación entre las funciones y la experiencia." if sim_fun_cv > 0.55 else "Baja evidencia de experiencias relacionadas.",
        "con_prof": "El perfil requerido coincide con las competencias del CV." if sim_prof_cv > 0.55 else "Las competencias del CV no reflejan claramente el perfil solicitado.",
        "coherencia": "Funciones y perfil alineados internamente." if sim_fun_prof > 0.55 else "Existe inconsistencia entre lo que se pide y el perfil requerido."
    }

    return reporte


# -----------------------------------------------------------
# RUTAS
# -----------------------------------------------------------
@app.route("/", methods=["GET"])
def formulario():
    return render_template("index.html", capitulos=CAPITULOS)


@app.route("/analizar", methods=["POST"])
def analizar():
    fxx_file = request.files["fxx"]
    pxx_file = request.files["pxx"]
    cv_file = request.files["cv"]
    capitulo = request.form["capitulo"]

    fxx_data = json.load(fxx_file)
    pxx_data = json.load(pxx_file)
    funciones = " ".join(fxx_data["contenido"])
    perfil = " ".join(pxx_data["contenido"])

    cv_text = extract_pdf_text(cv_file)
    if cv_text.strip() == "":
        return "No se pudo extraer el texto del PDF (¿está escaneado?)"

    reporte = generar_reporte(funciones, perfil, cv_text)

    return render_template("reporte.html", reporte=reporte, capitulo=capitulo)
    

if __name__ == "__main__":
    app.run(debug=True)
