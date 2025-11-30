from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json
import re

def extract_text(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""
    for p in reader.pages:
        text += p.extract_text() or ""
    return text

def find_section(text, start_marker, end_marker):
    s = text.find(start_marker)
    if s == -1: return ""
    e = text.find(end_marker, s+len(start_marker))
    if e == -1:
        return text[s+len(start_marker):]
    return text[s+len(start_marker):e]

def load_json(path):
    with open(path,'r',encoding='utf-8') as f:
        return json.load(f)

def simple_score(target_text, keywords):
    # Use TF-IDF + cosine between target_text and the concatenated keywords string
    docs = [target_text, " ".join(keywords)]
    vect = TfidfVectorizer().fit_transform(docs)
    sim = cosine_similarity(vect[0:1], vect[1:2])[0][0]
    return sim  # 0..1

def analyze_pdf_text(pdf_path, chapter, cargo):
    text = extract_text(pdf_path)
    # ejemplo para perfil
    perfil_text = find_section(text, "Perfil", "Estudios realizados")
    # carga jsons
    f_cargo = load_json(f"data/F{cargo}.json")
    p_cargo = load_json(f"data/P{cargo}.json")
    indicators = load_json("data/indicators.json")
    advices = load_json("data/advices.json")
    # crear palabras clave combinadas (simplificado)
    keywords = []
    # agrega items de funciones y perfil (puede estar en listas)
    for item in f_cargo: keywords += item if isinstance(item, list) else [item]
    for item in p_cargo: keywords += item if isinstance(item, list) else [item]
    # agrega indicadores por chapter
    chapter_dict = indicators.get(chapter, {})
    cargo_indicators = chapter_dict.get(cargo, {})
    for k, words in cargo_indicators.items():
        keywords += words
    # calcula similitud
    sim = simple_score(perfil_text, keywords)
    score_1_5 = round(1 + 4*sim, 2)
    # decide advices
    advice_list = []
    if score_1_5 < 3.5:
        # pegar advices por indicador si existen (simplificado)
        for ind in cargo_indicators:
            advice_list += advices.get(cargo, {}).get(ind, [])
    return {
        "title": f"Análisis hoja de vida",
        "scores": {
            "perfil": score_1_5
        },
        "advices": advice_list
    }
