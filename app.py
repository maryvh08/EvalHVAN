from flask import Flask, render_template, request
import json
from utils.pdf_reader import pdf_to_text
from utils.scoring import score_list
from utils.text_processing import clean

app = Flask(__name__)

CARGOS = ["PC", "IC", "CCP", "DCA", "DCC", "DCD", "DCF", "DCM"]

UNIVERSIDADES = [
    "UNIGUAJIRA", "UNIMAGDALENA", "UNINORTE", "UNIATLÁNTICO", "CUC", "UNISIMÓN",
    "LIBREQUILLA", "UTB", "UFPS", "UNALMED", "UPBMED", "UDEA", "UTP", "UNALMA",
    "LIBRECALI", "UNIVALLE", "ICESI", "UAO", "USC", "UDISTRITAL", "UNALBOG",
    "UPBMONTERÍA", "AREANDINA", "UNICÓDOBA"
]

@app.route("/")
def index():
    return render_template("index.html", cargos=CARGOS, universidades=UNIVERSIDADES)

@app.route("/analizar", methods=["POST"])
def analizar():
    nombre = request.form["nombre"]
    cargo = request.form["cargo"]
    capitulo = request.form["capitulo"]
    file = request.files["pdf"]

    cv_text = clean(pdf_to_text(file))

    # Cargar FXX y PXX
    funciones = json.load(open(f"data/F{cargo}.json", encoding="utf-8"))["contenido"]
    perfiles = json.load(open(f"data/P{cargo}.json", encoding="utf-8"))["contenido"]

    # Cargar indicadores
    indicators = json.load(open("data/indicators.json", encoding="utf-8"))[capitulo][cargo]

    # Cargar consejos
    advice = json.load(open("data/advice.json", encoding="utf-8"))[cargo]

    # --------- SCORES ----------
    perfil_score, perfil_detalle = score_list(perfiles, cv_text)
    func_score, func_detalle = score_list(funciones, cv_text)

    # indicadores
    indicadores_detalle = []
    indicators_scores = []

    for indicador, palabras in indicators.items():
        score, _ = score_list(palabras, cv_text)
        indicadores_detalle.append({"indicador": indicador, "score": score})
        indicators_scores.append(score)

    # puntuación global
    final_score = round((perfil_score + func_score + sum(indicators_scores)/len(indicators_scores)) / 3, 2)

    # determinar consejos
    recommendations = []
    for ind in indicadores_detalle:
        if ind["score"] < 3.5:
            recommendations.append({
                "indicador": ind["indicador"],
                "consejos": advice[ind["indicador"]]
            })

    return render_template(
        "report.html",
        nombre=nombre,
        cargo=cargo,
        perfil=perfil_detalle,
        funciones=func_detalle,
        indicadores=indicadores_detalle,
        recomendaciones=recommendations,
        final_score=final_score
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
