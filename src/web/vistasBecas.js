'use strict';

const { html } = require('./html');
const { pagina, resumen, campoDeTexto, campoCsrf } = require('./vistas');

// Vistas HTML de becas (Story 5.13): pantallas del estudiante (listado, solicitud y pagina de estado),
// del comite (cola, detalle y decision) y el aterrizaje de direccion. Todo valor interpolado pasa por la
// plantilla `html`, que lo escapa. Sin scripts ni estilos en linea (CSP). Las vistas del estudiante nunca
// reciben el puntaje ni los datos socioeconomicos: el servicio ya los proyecta fuera.

const ETIQUETAS_CAMPO = Object.freeze({
  promedioAcumulado: 'Promedio acumulado',
  estrato: 'Estrato',
  ingresosHogar: 'Ingresos mensuales del hogar',
});

const ETIQUETAS_CATEGORIA = Object.freeze({
  academico: 'dato académico',
  socioeconomico: 'dato socioeconómico',
});

const AYUDAS_CAMPO = Object.freeze({
  promedioAcumulado: 'Número entre 0 y 5, con punto decimal.',
  estrato: 'Un entero entre 1 y 6.',
  ingresosHogar: 'Solo números, sin signos ni separadores de miles.',
});

const MODOS_CAMPO = Object.freeze({ promedioAcumulado: 'decimal', estrato: 'numeric', ingresosHogar: 'decimal' });

// Explicacion de cada estado para el estudiante; ninguna cita un numero.
const EXPLICACIONES_ESTADO = Object.freeze({
  elegible: 'Su solicitud cumple los requisitos y la beca quedó otorgada.',
  no_elegible: 'Su solicitud no cumple los requisitos de la beca en este periodo.',
  'limitrofe en revisión': 'Su caso está en revisión por el comité de becas, que tomará la decisión final.',
  datos_incompletos: 'Faltan datos para evaluar su solicitud. Complételos para recibir una evaluación.',
  otorgada: 'El comité de becas otorgó la beca.',
  denegada: 'El comité de becas denegó la beca.',
});

const ETIQUETAS_CASO = Object.freeze({
  en_revision_comite: 'En revisión del comité',
  otorgada: 'Otorgada',
  denegada: 'Denegada',
});

const CAMPOS_NUEVA_SOLICITUD = Object.freeze([
  { id: 'periodoAcademico', etiqueta: 'Periodo académico', ayuda: 'Por ejemplo: 2026-1.', requerido: true },
  ...['promedioAcumulado', 'estrato', 'ingresosHogar'].map((id) => ({
    id,
    etiqueta: ETIQUETAS_CAMPO[id],
    ayuda: `${AYUDAS_CAMPO[id]} Puede dejarlo en blanco y completarlo después.`,
    modo: MODOS_CAMPO[id],
    requerido: false,
  })),
]);

const descripcionDe = (estado) => EXPLICACIONES_ESTADO[estado] ?? '';

// ---------------------------------------------------------------- Estudiante

function vistaListadoBecas({ usuario, csrf, solicitudes }) {
  const contenido = solicitudes.length === 0
    ? html`<p>Aún no tiene una evaluación de beca.</p>
<p><a class="boton" href="/becas/nueva">Solicitar una beca</a></p>`
    : html`<p><a class="boton" href="/becas/nueva">Solicitar una beca</a></p>
<table>
<caption>Mis solicitudes de beca</caption>
<thead>
<tr><th scope="col">Periodo</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr>
</thead>
<tbody>
${solicitudes.map((s) => html`<tr>
<td>${s.periodoAcademico}</td>
<td><strong>${s.clasificacion}</strong></td>
<td><a href="/becas/${s.id}">Ver estado de ${s.periodoAcademico}</a></td>
</tr>`)}
</tbody>
</table>`;
  return pagina({
    titulo: 'Mis becas',
    usuario,
    csrf,
    contenido: html`<h1>Mis becas</h1>
${contenido}`,
  });
}

// `avisos`: mensajes que no pertenecen a un campo (p. ej. periodo repetido, con el enlace ya armado).
function vistaFormularioBeca({ usuario, csrf, valores = {}, errores = {}, avisos = [] }) {
  const elementos = [
    ...avisos.map((mensaje) => ({ mensaje })),
    ...CAMPOS_NUEVA_SOLICITUD.filter((c) => errores[c.id]).map((c) => ({ campo: c.id, mensaje: errores[c.id] })),
  ];
  return pagina({
    titulo: 'Solicitar una beca',
    usuario,
    csrf,
    contenido: html`<h1>Solicitar una beca</h1>
<p>Indique el periodo y sus datos. Si todavía le falta alguno, déjelo en blanco: podrá completarlo desde la página de estado.</p>
${elementos.length > 0 ? resumen('Revise la información', elementos) : ''}
<form method="post" action="/becas">
${campoCsrf(csrf)}
${CAMPOS_NUEVA_SOLICITUD.map((c) => campoDeTexto({ ...c, valores, errores }))}
<button type="submit">Enviar solicitud</button>
</form>
<p><a href="/becas">Volver a mis becas</a></p>`,
  });
}

function seccionDatosFaltantes({ solicitud, csrf, valores, errores }) {
  const faltantes = solicitud.datosFaltantes ?? [];
  return html`<section aria-labelledby="faltantes">
<h2 id="faltantes">Datos que faltan</h2>
<ul>
${faltantes.map((d) => html`<li>${ETIQUETAS_CAMPO[d.campo] ?? d.campo} (${ETIQUETAS_CATEGORIA[d.categoria] ?? d.categoria})</li>`)}
</ul>
</section>
<section aria-labelledby="completar">
<h2 id="completar">Completar datos</h2>
<form method="post" action="/becas/${solicitud.id}/completar">
${campoCsrf(csrf)}
${faltantes.map((d) =>
    campoDeTexto({
      id: d.campo,
      etiqueta: ETIQUETAS_CAMPO[d.campo] ?? d.campo,
      ayuda: AYUDAS_CAMPO[d.campo],
      modo: MODOS_CAMPO[d.campo],
      valores,
      errores,
    }),
  )}
<button type="submit">Completar datos</button>
</form>
</section>`;
}

// Pagina de estado (solo lectura): la etiqueta, la decision del comite y su comentario si existen y, si
// faltan datos, cuales son y el formulario para completarlos. Nunca el puntaje ni los datos ya guardados.
function vistaEstadoBeca({ usuario, csrf, solicitud, valores = {}, errores = {}, resumenErrores = null }) {
  const etiqueta = solicitud.clasificacion;
  return pagina({
    titulo: `Estado de la beca ${solicitud.periodoAcademico}`,
    usuario,
    csrf,
    contenido: html`<h1>Estado de la beca ${solicitud.periodoAcademico}</h1>
${resumenErrores ? resumen(resumenErrores.titulo, resumenErrores.elementos) : ''}
<dl class="datos">
<dt>Periodo académico</dt><dd>${solicitud.periodoAcademico}</dd>
<dt>Estado de la evaluación</dt><dd><strong>${etiqueta}</strong></dd>
</dl>
<p>${descripcionDe(etiqueta)}</p>
${solicitud.decisionComite
    ? html`<section aria-labelledby="decision-comite">
<h2 id="decision-comite">Decisión del comité</h2>
<dl class="datos">
<dt>Decisión</dt><dd>${solicitud.decisionComite}</dd>
<dt>Comentario del comité</dt><dd>${solicitud.comentarioComite}</dd>
</dl>
</section>`
    : ''}
${etiqueta === 'datos_incompletos' ? seccionDatosFaltantes({ solicitud, csrf, valores, errores }) : ''}
<p><a href="/becas">Volver a mis becas</a></p>`,
  });
}

// ---------------------------------------------------------------- Comite de becas

const idCorto = (id) => String(id).slice(0, 8);

function vistaColaComite({ usuario, csrf, cola }) {
  const contenido = cola.length === 0
    ? html`<p>No hay casos pendientes de revisión.</p>`
    : html`<table>
<caption>Casos limítrofes pendientes de revisión</caption>
<thead>
<tr><th scope="col">Caso</th><th scope="col">Periodo</th><th scope="col">Ingresó</th><th scope="col">Acción</th></tr>
</thead>
<tbody>
${cola.map((c) => html`<tr>
<td><code>${idCorto(c.id)}</code></td>
<td>${c.periodoAcademico}</td>
<td><time datetime="${c.ingresadoEn}">${c.ingresadoEn.slice(0, 10)}</time></td>
<td><a href="/comite/casos/${c.id}">Revisar caso ${idCorto(c.id)}</a></td>
</tr>`)}
</tbody>
</table>`;
  return pagina({
    titulo: 'Cola del comité',
    usuario,
    csrf,
    contenido: html`<h1>Cola del comité de becas</h1>
<p>Casos limítrofes asignados a usted que esperan una decisión.</p>
${contenido}`,
  });
}

function entradaDeHistorial(entrada) {
  const fecha = html`<time datetime="${entrada.fecha}">${String(entrada.fecha).slice(0, 10)}</time>`;
  if (entrada.decision === undefined) return html`<li>${fecha}: ingresó a la cola del comité.</li>`;
  return html`<li>${fecha}: decisión <strong>${entrada.decision}</strong>. Comentario: ${entrada.comentario}</li>`;
}

function formularioDecision({ caso, csrf, valores, errores }) {
  const opcion = (valor, texto) => html`<p class="opcion"><input type="radio" name="decision" value="${valor}" id="decision-${valor}"${valores.decision === valor ? html` checked` : ''} required><label for="decision-${valor}" class="etiqueta-opcion">${texto}</label></p>`;
  const descripcionComentario = ['comentario-ayuda', errores.comentario ? 'comentario-error' : null].filter(Boolean).join(' ');
  return html`<section aria-labelledby="decidir">
<h2 id="decidir">Registrar la decisión</h2>
<form method="post" action="/comite/casos/${caso.id}/decision">
${campoCsrf(csrf)}
<fieldset class="campo">
<legend>Decisión del comité</legend>
${errores.decision ? html`<p id="decision-error" class="error-campo"><span class="solo-lectores">Error: </span>${errores.decision}</p>` : ''}
${opcion('otorgada', 'Otorgar la beca')}
${opcion('denegada', 'Denegar la beca')}
</fieldset>
<div class="campo">
<label for="comentario">Comentario de la decisión</label>
<p id="comentario-ayuda" class="ayuda">Obligatorio. Queda en el historial del caso y lo verá el estudiante.</p>
${errores.comentario ? html`<p id="comentario-error" class="error-campo"><span class="solo-lectores">Error: </span>${errores.comentario}</p>` : ''}
<textarea id="comentario" name="comentario" rows="5" required${errores.comentario ? html` aria-invalid="true"` : ''} aria-describedby="${descripcionComentario}">${valores.comentario ?? ''}</textarea>
</div>
<button type="submit">Registrar decisión</button>
</form>
</section>`;
}

// `caso`: proyeccion del comite (puntaje y datos de entrada incluidos). El formulario solo se ofrece mientras
// el caso sigue en revision.
function vistaCasoComite({ usuario, csrf, caso, valores = {}, errores = {}, resumenErrores = null }) {
  const enRevision = caso.estado === 'en_revision_comite';
  return pagina({
    titulo: `Caso ${idCorto(caso.id)}`,
    usuario,
    csrf,
    contenido: html`<h1>Caso ${idCorto(caso.id)} del comité</h1>
${resumenErrores ? resumen(resumenErrores.titulo, resumenErrores.elementos) : ''}
<dl class="datos">
<dt>Periodo académico</dt><dd>${caso.periodoAcademico}</dd>
<dt>Estado del caso</dt><dd><strong>${ETIQUETAS_CASO[caso.estado] ?? caso.estado}</strong></dd>
<dt>Puntaje de la evaluación</dt><dd>${Number(caso.puntaje).toFixed(2)}</dd>
<dt>Promedio acumulado</dt><dd>${caso.promedioAcumulado ?? 'Sin dato'}</dd>
<dt>Estrato</dt><dd>${caso.estrato ?? 'Sin dato'}</dd>
<dt>Ingresos mensuales del hogar</dt><dd>${caso.ingresosHogar ?? 'Sin dato'}</dd>
</dl>
<section aria-labelledby="historial">
<h2 id="historial">Historial del caso</h2>
<ul>
${caso.historial.map(entradaDeHistorial)}
</ul>
</section>
${enRevision ? formularioDecision({ caso, csrf, valores, errores }) : ''}
<p><a href="/comite">Volver a la cola del comité</a></p>`,
  });
}

// ---------------------------------------------------------------- Direccion academica

// Aterrizaje minimo: P17 reemplaza este contenido por los informes consolidados. Sin datos socioeconomicos.
function vistaInicioDireccion({ usuario, csrf }) {
  return pagina({
    titulo: 'Inicio de dirección académica',
    usuario,
    csrf,
    contenido: html`<h1>Inicio de dirección académica</h1>
<p>Los informes consolidados estarán disponibles aquí.</p>
<p>Mientras tanto, puede abrir el resumen de una solicitud de crédito si conoce su identificador.</p>`,
  });
}

module.exports = {
  vistaListadoBecas,
  vistaFormularioBeca,
  vistaEstadoBeca,
  vistaColaComite,
  vistaCasoComite,
  vistaInicioDireccion,
};
