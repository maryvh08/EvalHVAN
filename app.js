// -------------------------
// Cargar JSON desde /data/
// -------------------------
async function loadJSON(file) {
    const res = await fetch(`./data/${file}`);
    return res.json();
}

// -------------------------
// Calcular similitud básica
// -------------------------
function scoreSimilarity(cvText, keywords) {
    if (!keywords || keywords.length === 0) return 1;

    let count = 0;
    const cv = cvText.toLowerCase();

    keywords.forEach(k => {
        if (cv.includes(k.toLowerCase())) count++;
    });

    const ratio = count / keywords.length;
    return Math.min(5, Math.max(1, ratio * 5));
}

// -------------------------
// Evaluar presentación
// -------------------------
function scorePresentation(cvText) {
    const length = cvText.length;
    let score = 5;

    if (length < 300) score -= 1;
    if (/( {2,})/.test(cvText)) score -= 1;
    if (!/[.,;:?!]/.test(cvText)) score -= 1;

    return Math.max(1, score);
}

// -------------------------
// Crear bloque HTML
// -------------------------
function block(title, content) {
    return `
        <div class="report-block">
            <h3>${title}</h3>
            ${content}
        </div>
    `;
}

// -------------------------------------
// PROCESAR TODO AL HACER CLICK
// -------------------------------------
document.getElementById("evaluar").addEventListener("click", async () => {
    
    const nombre = document.getElementById("nombre").value;
    const cargo = document.getElementById("cargo").value;
    const capitulo = document.getElementById("capitulo").value;
    const cv = document.getElementById("cv").value;

    if (!nombre || !cargo || !capitulo || !cv) {
        alert("Por favor complete todos los campos.");
        return;
    }

    // ----- Cargar JSON del cargo -----
    const funciones = await loadJSON(`F${cargo}.json`);
    const perfiles = await loadJSON(`P${cargo}.json`);
    const indicators = await loadJSON("indicators.json");
    const advices = await loadJSON("advices.json");

    const indCargo = indicators[capitulo][cargo];

    // ----- Evaluaciones -----
    const scoreFunciones = scoreSimilarity(cv, funciones.items || []);
    const scorePerfiles = scoreSimilarity(cv, perfiles.items || []);

    // Indicadores
    let indicadorResultados = "";
    let sumInd = 0;
    let totalInd = 0;

    for (let indicador in indCargo) {
        const palabras = indCargo[indicador];
        const s = scoreSimilarity(cv, palabras);
        sumInd += s;
        totalInd++;

        let consejo = "";
        if (s < 3.5 && advices[cargo][indicador]) {
            consejo = `<p><strong>Consejo:</strong> ${advices[cargo][indicador][0]}</p>`;
        }

        indicadorResultados += `
            <p><strong>${indicador}</strong> — Puntaje: ${s.toFixed(2)}</p>
            ${consejo}
        `;
    }

    const scoreIndicadores = sumInd / totalInd;

    // Presentación
    const scorePres = scorePresentation(cv);

    // Promedio final
    const scoreFinal = (
        (scoreFunciones + scorePerfiles + scoreIndicadores + scorePres) / 4
    ).toFixed(2);

    // Construir reporte
    let html = `
        <h2>Análisis hoja de vida – ${nombre} – ${cargo}</h2>
        ${block("Perfil del aspirante", `
            <p><strong>Funciones:</strong> ${scoreFunciones.toFixed(2)}</p>
            <p><strong>Perfil:</strong> ${scorePerfiles.toFixed(2)}</p>
        `)}

        ${block("Indicadores por capítulo", indicadorResultados)}

        ${block("Presentación del documento", `
            <p>Puntaje de presentación: <strong>${scorePres}</strong></p>
        `)}

        ${block("Resultado global", `
            <p>Promedio final: <strong>${scoreFinal}</strong> / 5</p>
        `)}

        ${block("Comentarios finales", `
            <p>Este reporte ha sido generado automáticamente con base
            en similitudes de texto y estándares definidos del cargo ${cargo}.</p>
        `)}
    `;

    document.getElementById("report-container").innerHTML = html;
});
