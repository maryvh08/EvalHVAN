/* app.js
   Motor de concordancia mejorado (sin backend).
   Requiere en /data/:
   - F<CARGO>.json  (ej. FDCA.json) con formato {"contenido":[...]}
   - P<CARGO>.json  con formato {"contenido":[...]}
   - indicators.json
   - advices.json
*/

// ---------- utilidades de texto ----------
function normalizeText(s){
    if(!s) return "";
    // quitar tildes y normalizar
    const from = "ÁÀÂÄÃáàâäãÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇç";
    const to   = "AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc";
    s = s.split('').map((c,i)=> {
        const idx = from.indexOf(c);
        return idx>-1?to[idx]:c;
    }).join('');
    // quitar puntuación (dejamos espacios)
    s = s.replace(/[·/_,:;()”“"¿?¡!.\-–—\[\]{}<>#*=+\\|@%$^&~`]/g,' ');
    // espacios múltiples
    s = s.replace(/\s+/g,' ').trim().toLowerCase();
    return s;
}

function tokenize(s){
    return normalizeText(s).split(' ').filter(Boolean);
}

function unique(arr){ return Array.from(new Set(arr)); }

// Levenshtein (distancia) - para fuzzy
function levenshtein(a,b){
    if(a===b) return 0;
    if(a.length===0) return b.length;
    if(b.length===0) return a.length;
    const matrix = Array.from({length:a.length+1},()=>[]);
    for(let i=0;i<=a.length;i++) matrix[i][0]=i;
    for(let j=0;j<=b.length;j++) matrix[0][j]=j;
    for(let i=1;i<=a.length;i++){
        for(let j=1;j<=b.length;j++){
            const cost = a[i-1]===b[j-1]?0:1;
            matrix[i][j] = Math.min(
                matrix[i-1][j]+1,
                matrix[i][j-1]+1,
                matrix[i-1][j-1]+cost
            );
        }
    }
    return matrix[a.length][b.length];
}

// similarity fuzzy between two words 0..1
function fuzzyWordSim(a,b){
    a = a.toLowerCase(); b = b.toLowerCase();
    const d = levenshtein(a,b);
    const maxLen = Math.max(a.length,b.length);
    if(maxLen===0) return 1;
    const sim = 1 - (d / maxLen);
    return Math.max(0, Math.min(1, sim));
}

// ---------- stopwords simples (español) ----------
const STOP = new Set([
    'de','la','el','que','y','a','en','los','del','se','las','por','un','para','con','no','una','su','al',
    'es','lo','como','más','o','sus','pero','ha','me','si','mi','son','fue','este','ya','tambien','o','sin',
    'sobre','entre','cuando','todo','nos','donde','desde','todo','tener','tiene','todas','dar','ser','esta','sean'
]);

// Verbos relevantes comunes (lista corta, ampliable)
const VERBOS = ['coordinar','liderar','organizar','gestionar','apoyar','diseñar','planear','planificar',
                'capacitar','formar','evaluar','supervisar','dirigir','presentar','participar','elaborar',
                'desarrollar','tomar','identificar','proponer','asegurar','preparar','liderar','ejecutar'];

// ---------- scoring helpers ----------

// score token overlap (0..1) entre item y CV
function tokenOverlapScore(itemText, cvText){
    const it = tokenize(itemText).filter(w=>!STOP.has(w));
    const cv = tokenize(cvText).filter(w=>!STOP.has(w));
    if(it.length===0) return 0;
    const setCU = new Set(cv);
    let hits = 0;
    it.forEach(t => { if(setCU.has(t)) hits++; });
    return hits / it.length; // proporción de tokens del ítem encontrados en CV
}

// score fuzzy token matching (0..1) - para tokens del item que no encontraron exact match
function fuzzyTokensScore(itemText, cvText){
    const it = tokenize(itemText).filter(w=>!STOP.has(w));
    const cv = tokenize(cvText).filter(w=>!STOP.has(w));
    if(it.length===0) return 0;
    let totalSim = 0;
    it.forEach(tok => {
        // si existe match exacto, sim = 1
        if(cv.includes(tok)) { totalSim += 1; return; }
        // sino buscamos mejor sim con palabras del cv
        let best = 0;
        for(const cwt of cv){
            const sim = fuzzyWordSim(tok, cwt);
            if(sim > best) best = sim;
            if(best >= 0.85) break;
        }
        totalSim += best; // entre 0 y 1
    });
    return totalSim / it.length;
}

// verbo presence score (0..1)
function verbPresenceScore(itemText, cvText){
    const it = tokenize(itemText);
    const cv = tokenize(cvText);
    const verbsFound = VERBOS.filter(v => cv.includes(v));
    // si algún verbo del item aparece en CV -> 1, sino proporción de coincidencia con VERBOS
    const itHasVerbs = it.filter(t => VERBOS.includes(t));
    if(itHasVerbs.length===0){
        // medir si CV contiene cualquiera de los verbos relevantes
        return Math.min(1, verbsFound.length / 2); // al menos 2 verbos = 1
    } else {
        const found = itHasVerbs.filter(v => cv.includes(v)).length;
        return Math.min(1, found / itHasVerbs.length);
    }
}

// convertimos 0..1 -> escala 1..5 (1 mínimo, 5 máximo)
function mapToFive(x){ return 1 + Math.round(x * 4 * 100)/100; } // precision 2 decimales when displayed

// ---------- carga de JSON ----------
async function loadJSON(path){
    const res = await fetch(path);
    if(!res.ok) throw new Error('No se pudo cargar ' + path);
    return res.json();
}

// ---------- limpieza de arrays de contenido ----------
function extractContenido(jsonObj){
    if(!jsonObj) return [];
    // soporta "contenido" o "items" o "funciones"
    const arr = jsonObj.contenido || jsonObj.items || jsonObj.funciones || [];
    // filtrar vacíos, trim
    return arr.map(s => (s||'').trim()).filter(s => s.length>2);
}

// ---------- analizador de ítem individual ----------
function analyzeItem(itemText, cvText){
    const normItem = normalizeText(itemText);
    const normCv = normalizeText(cvText);

    const overlap = tokenOverlapScore(normItem, normCv);       // 0..1
    const fuzzy = fuzzyTokensScore(normItem, normCv);         // 0..1
    const verbScore = verbPresenceScore(normItem, normCv);    // 0..1

    // pesos: overlap 60%, fuzzy 30%, verbo 10%
    const combined = (0.6 * overlap) + (0.3 * fuzzy) + (0.1 * verbScore);

    // evidencia: palabras exactas y fuzzy matches
    const evidenceExact = [];
    const evidenceFuzzy = [];

    const itemTokens = tokenize(itemText).filter(w=>!STOP.has(w));
    const cvTokens = tokenize(cvText).filter(w=>!STOP.has(w));
    const cvSet = new Set(cvTokens);

    itemTokens.forEach(tok => {
        if(cvSet.has(tok)) evidenceExact.push(tok);
        else {
            // buscar mejor match
            let bestWord = null; let bestSim = 0;
            for(const cwt of cvTokens){
                const sim = fuzzyWordSim(tok, cwt);
                if(sim > bestSim){ bestSim = sim; bestWord = cwt; }
            }
            if(bestSim >= 0.6){ // umbral para considerarlo evidencia fuzzy
                evidenceFuzzy.push({item:tok, match:bestWord, sim:Math.round(bestSim*100)/100});
            }
        }
    });

    return {
        score01: combined,
        score5: mapToFive(combined),
        overlap, fuzzy, verbScore,
        evidenceExact: unique(evidenceExact),
        evidenceFuzzy
    };
}

// ---------- analizar indicadores ----------
function analyzeIndicator(indicatorWords, cvText){
    // indicatorWords: array de palabras clave
    const cvTokens = tokenize(cvText).filter(w=>!STOP.has(w));
    if(!indicatorWords || indicatorWords.length===0) return {score5:1, matches:[]};

    // exact matches proporción
    let hits = 0;
    const matches = [];
    const normalizedKw = indicatorWords.map(k => normalizeText(k));
    const cvSet = new Set(cvTokens);

    normalizedKw.forEach(k => {
        const parts = k.split(' ').filter(Boolean);
        let found = false;
        for(const p of parts){
            if(cvSet.has(p)){ hits++; matches.push(p); found = true; break; }
        }
        if(!found){
            // fuzzy check with cv tokens
            for(const cwt of cvTokens){
                const sim = fuzzyWordSim(k, cwt);
                if(sim >= 0.8){
                    hits++; matches.push(cwt);
                    break;
                }
            }
        }
    });

    const ratio = hits / normalizedKw.length;
    const score5 = mapToFive(Math.min(1, ratio));
    return {score5, ratio, matches: unique(matches)};
}

// ---------- presentación heurística ----------
function scorePresentation(cvText){
    const txt = (cvText||'').trim();
    if(txt.length < 120) return 1;
    const sentences = txt.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
    const avgLen = sentences.length ? txt.length / sentences.length : txt.length;
    // heuristicas: mucho texto => mejor, avgLen entre 30-160 aceptable
    let base = 0.6;
    if(txt.length > 800) base += 0.2;
    if(avgLen > 25 && avgLen < 140) base += 0.2;
    // puntuación 0..1 -> map 1..5
    return mapToFive(Math.min(1, base));
}

// ---------- función principal de evaluación ----------
async function evaluateAll(nombre, cargo, capitulo, cvText){
    // cargar JSONs (rutas /data/)
    const fPath = `./data/F${cargo}.json`;   // tu formato: "FXX.json"
    const pPath = `./data/P${cargo}.json`;
    const indicatorsPath = `./data/indicators.json`;
    const advicesPath = `./data/advices.json`;

    // cargar con manejo de errores
    let Fjson, Pjson, indicators, advices;
    try {
        Fjson = await loadJSON(fPath);
    } catch(e){
        throw new Error(`No se encontró o pudo cargar ${fPath}. Asegúrate de tenerlo en /data/`);
    }
    try {
        Pjson = await loadJSON(pPath);
    } catch(e){
        throw new Error(`No se encontró o pudo cargar ${pPath}. Asegúrate de tenerlo en /data/`);
    }
    try { indicators = await loadJSON(indicatorsPath); } catch(e){ indicators = {}; }
    try { advices = await loadJSON(advicesPath); } catch(e){ advices = {}; }

    const funciones = extractContenido(Fjson);
    const perfiles = extractContenido(Pjson);

    // analizar cada función
    const funcionesResults = funciones.map(it => {
        const r = analyzeItem(it, cvText);
        return {item: it, ...r};
    });

    // analizar cada perfil
    const perfilesResults = perfiles.map(it => {
        const r = analyzeItem(it, cvText);
        return {item: it, ...r};
    });

    // indicadores por capítulo/cargo
    const indicatorsByChapter = (indicators[capitulo] && indicators[capitulo][cargo]) ? indicators[capitulo][cargo] : {};
    const indicatorsResults = {};
    for(const indName in indicatorsByChapter){
        const kw = indicatorsByChapter[indName];
        indicatorsResults[indName] = analyzeIndicator(kw, cvText);
    }

    // presentación
    const presScore = scorePresentation(cvText);

    // promedios por sección (1..5)
    const avgFunciones = funcionesResults.length ? (funcionesResults.reduce((s,r)=>s + r.score01,0)/funcionesResults.length) : 0;
    const avgPerfiles = perfilesResults.length ? (perfilesResults.reduce((s,r)=>s + r.score01,0)/perfilesResults.length) : 0;
    const avgIndicadores01 = Object.keys(indicatorsResults).length ?
        (Object.values(indicatorsResults).reduce((s,r)=>s + ( (r.score5-1)/4 ),0) / Object.keys(indicatorsResults).length) : 0;

    const result = {
        nombre, cargo, capitulo,
        funcionesResults,
        perfilesResults,
        indicatorsResults,
        presentation: {score5: presScore},
        averages: {
            funciones5: mapToFive(avgFunciones),
            perfiles5: mapToFive(avgPerfiles),
            indicadores5: mapToFive(avgIndicadores01),
        }
    };

    // resultado global: promedio de las 4 secciones (funciones, perfiles, indicadores, presentación)
    const global01 = (avgFunciones + avgPerfiles + avgIndicadores01 + ((presScore-1)/4)) / 4;
    result.global = {score5: mapToFive(global01)};

    // sugerencias por indicador si bajo 3.5
    result.suggestions = {};
    for(const indName in indicatorsResults){
        const sc = indicatorsResults[indName].score5;
        if(sc < 3.5){
            // obtener un consejo si existe en advices
            const adv = (advices && advices[cargo] && advices[cargo][indName]) ? advices[cargo][indName] : [];
            result.suggestions[indName] = adv.length ? adv[0] : 'Mejorar experiencia relacionada con ' + indName;
        }
    }

    return result;
}

// ---------- UI: dibujar reporte ----------
function renderReport(res){
    const container = document.getElementById('report-container');
    container.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'report-title';
    title.textContent = `Análisis hoja de vida — ${res.nombre} — ${res.cargo}`;
    container.appendChild(title);

    // resumen general
    const resumen = document.createElement('div');
    resumen.className = 'section-block';
    resumen.innerHTML = `
        <p><strong>Capítulo:</strong> ${res.capitulo || '—'}</p>
        <p><strong>Promedio Funciones:</strong> <span class="badge">${res.averages.funciones5}/5</span>
           <strong style="margin-left:8px">Promedio Perfil:</strong> <span class="badge">${res.averages.perfiles5}/5</span>
           <strong style="margin-left:8px">Promedio Indicadores:</strong> <span class="badge">${res.averages.indicadores5}/5</span>
           <strong style="margin-left:8px">Presentación:</strong> <span class="badge">${res.presentation.score5}/5</span>
        </p>
        <p><strong>Resultado global:</strong> <span class="badge">${res.global.score5}/5</span></p>
    `;
    container.appendChild(resumen);

    // funciones: detalle por ítem
    const fBlock = document.createElement('div');
    fBlock.innerHTML = `<h4>Funciones del cargo — detalle</h4>`;
    fBlock.className = 'section-block';
    if(res.funcionesResults.length===0){
        fBlock.innerHTML += `<p class="muted">No hay funciones definidas en el JSON.</p>`;
    } else {
        res.funcionesResults.forEach(r => {
            const it = document.createElement('div');
            it.className = 'item-row';
            it.innerHTML = `
                <div><strong>${r.item}</strong> <span class="badge">${r.score5}/5</span></div>
                <div class="meta">(overlap:${Math.round(r.overlap*100)/100}, fuzzy:${Math.round(r.fuzzy*100)/100}, verb:${Math.round(r.verbScore*100)/100})</div>
                <div class="evidence">
                    ${ r.evidenceExact.length ? `<div><strong>Palabras encontradas:</strong> ${r.evidenceExact.join(', ')}</div>` : '' }
                    ${ r.evidenceFuzzy.length ? `<div><strong>Matches aproximados:</strong> ${r.evidenceFuzzy.map(x=>`${x.item}→${x.match} (${x.sim})`).join(', ')}</div>` : '' }
                </div>
            `;
            fBlock.appendChild(it);
        });
    }
    container.appendChild(fBlock);

    // perfiles: detalle
    const pBlock = document.createElement('div');
    pBlock.innerHTML = `<h4>Perfil del cargo — detalle</h4>`;
    pBlock.className = 'section-block';
    if(res.perfilesResults.length===0){
        pBlock.innerHTML += `<p class="muted">No hay items de perfil definidos.</p>`;
    } else {
        res.perfilesResults.forEach(r => {
            const it = document.createElement('div');
            it.className = 'item-row';
            it.innerHTML = `
                <div><strong>${r.item}</strong> <span class="badge">${r.score5}/5</span></div>
                <div class="meta">(overlap:${Math.round(r.overlap*100)/100}, fuzzy:${Math.round(r.fuzzy*100)/100}, verb:${Math.round(r.verbScore*100)/100})</div>
                <div class="evidence">
                    ${ r.evidenceExact.length ? `<div><strong>Palabras encontradas:</strong> ${r.evidenceExact.join(', ')}</div>` : '' }
                    ${ r.evidenceFuzzy.length ? `<div><strong>Matches aproximados:</strong> ${r.evidenceFuzzy.map(x=>`${x.item}→${x.match} (${x.sim})`).join(', ')}</div>` : '' }
                </div>
            `;
            pBlock.appendChild(it);
        });
    }
    container.appendChild(pBlock);

    // indicadores
    const indBlock = document.createElement('div');
    indBlock.innerHTML = `<h4>Indicadores por capítulo</h4>`;
    indBlock.className = 'section-block';
    const inds = res.indicatorsResults;
    if(!inds || Object.keys(inds).length===0){
        indBlock.innerHTML += `<p class="muted">No se encontraron indicadores para este capítulo/cargo en indicators.json</p>`;
    } else {
        for(const indName in inds){
            const row = document.createElement('div');
            row.className = 'item-row';
            const info = inds[indName];
            row.innerHTML = `
                <div><strong>${indName}</strong> <span class="badge">${info.score5}/5</span></div>
                <div class="meta">Ratio de coincidencia: ${Math.round((info.ratio||0)*100)/100}</div>
                <div class="evidence">${ info.matches && info.matches.length ? `<strong>Palabras clave encontradas:</strong> ${info.matches.join(', ')}` : '<span class="muted">No se encontraron palabras clave.</span>' }</div>
            `;
            indBlock.appendChild(row);
            // sugerencia si existe
            if(res.suggestions && res.suggestions[indName]){
                const sug = document.createElement('div');
                sug.className = 'item-row';
                sug.style.background = '#fff8e6';
                sug.innerHTML = `<strong>Consejo:</strong> ${res.suggestions[indName]}`;
                indBlock.appendChild(sug);
            }
        }
    }
    container.appendChild(indBlock);

    // comentarios finales
    const finalBlock = document.createElement('div');
    finalBlock.className = 'section-block';
    finalBlock.innerHTML = `
        <h4>Comentarios finales</h4>
        <p>El motor calcula concordancias por ítem y devuelve promedios por sección. Las coincidencias aproximadas (fuzzy) aparecen como <em>item→match (sim)</em>.</p>
        <p class="muted">Si un ítem tiene puntuación baja (≤ 3.5/5) revise las palabras clave o la redacción del CV para evidenciar las competencias requeridas.</p>
    `;
    container.appendChild(finalBlock);

    // scroll al reporte
    container.scrollIntoView({behavior:'smooth'});
}

// ---------- eventos UI ----------
document.getElementById('evaluar').addEventListener('click', async ()=>{
    const nombre = document.getElementById('nombre').value.trim();
    const cargo = document.getElementById('cargo').value.trim();
    const capitulo = document.getElementById('capitulo').value.trim();
    const cv = document.getElementById('cv').value.trim();

    if(!nombre || !cargo || !capitulo || !cv){
        alert('Complete todos los campos: nombre, cargo, capítulo y hoja de vida.');
        return;
    }

    try {
        const res = await evaluateAll(nombre, cargo, capitulo, cv);
        renderReport(res);
    } catch(err){
        document.getElementById('report-container').innerHTML = `<p class="muted">Error: ${err.message}</p>`;
        console.error(err);
    }
});

document.getElementById('print').addEventListener('click', ()=> window.print());
