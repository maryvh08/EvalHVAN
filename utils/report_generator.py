def build_report(name, cargo, perfil_score, func_score, indicators, advice, final_score):
    return {
        "nombre": name,
        "cargo": cargo,
        "perfil_score": perfil_score,
        "funciones_score": func_score,
        "indicadores": indicators,
        "advice": advice,
        "final_score": final_score
    }
