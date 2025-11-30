document.getElementById("hvForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const response = await fetch("https://tu-backend.repl.co/analizar", {
        method: "POST",
        body: formData
    });

    const data = await response.json();

    // Mostrar resultados
    let html = `<h2>${data.titulo}</h2>`;
    html += `<p><strong>Perfil:</strong> Funciones: ${data.perfil.funciones}, Perfil: ${data.perfil.perfil}</p>`;
    html += `<p><strong>Experiencia:</strong></p><ul>`;
    for (const [key, value] of Object.entries(data.experiencia)) {
        if(key !== "consejos") html += `<li>${key}: ${value}</li>`;
    }
    html += `</ul>`;
    html += `<p><strong>Consejos:</strong></p><ul>`;
    data.experiencia.consejos.forEach(c => html += `<li>${c}</li>`);
    html += `</ul>`;
    html += `<p><strong>Global:</strong> ${data.global}</p>`;
    html += `<p><strong>Comentarios:</strong> ${data.comentarios}</p>`;

    document.getElementById("resultado").innerHTML = html;
});
