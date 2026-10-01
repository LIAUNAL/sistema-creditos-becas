'use strict';

const { html } = require('./html');

// Vistas HTML del flujo del estudiante (D1/D4: paginas minimas, accesibles y renderizadas en
// servidor). Todo valor interpolado pasa por la plantilla `html`, que lo escapa. Sin scripts ni
// estilos en linea: la CSP solo permite recursos propios.

const ETIQUETAS_ESTADO = Object.freeze({
  borrador: 'Borrador',
  pendiente_revision: 'Pendiente de revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
});

const ETIQUETAS_DOCUMENTO = Object.freeze({
  identificacion: 'Documento de identificación',
  certificado_ingresos: 'Certificado de ingresos',
  certificado_matricula: 'Certificado de matrícula',
});

const MENSAJES_ERROR_LOGIN = Object.freeze({
  credenciales: 'El usuario o la contraseña son incorrectos.',
  intentos: 'Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.',
  formato: 'Ingrese su usuario y su contraseña.',
});

const TITULOS_ERROR = Object.freeze({
  400: ['Solicitud no válida', 'La petición no se pudo procesar. Revise los datos e intente de nuevo.'],
  403: ['Acceso no permitido', 'Su cuenta no tiene permiso para ver esta página.'],
  404: ['No encontrado', 'La página o la solicitud que busca no existe o no está disponible para usted.'],
  409: ['Conflicto', 'La operación no es posible en el estado actual de la solicitud.'],
});

const etiquetaEstado = (estado) => ETIQUETAS_ESTADO[estado] ?? estado;
const etiquetaDocumento = (tipo) => ETIQUETAS_DOCUMENTO[tipo] ?? tipo;

const campoCsrf = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

function navegacion(usuario, csrf) {
  return html`<nav aria-label="Principal">
${usuario.rol === 'estudiante' ? html`<a href="/solicitudes">Mis solicitudes</a>
<a href="/solicitudes/nueva">Nueva solicitud</a>` : ''}
<form method="post" action="/logout" class="en-linea">
${campoCsrf(csrf)}
<button type="submit" class="boton-secundario">Cerrar sesión (${usuario.nombre_usuario})</button>
</form>
</nav>`;
}

// Estructura comun: idioma, titulo, enlace para saltar al contenido y regiones de referencia.
function pagina({ titulo, usuario, csrf, contenido }) {
  return html`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} - Créditos y becas</title>
<link rel="stylesheet" href="/estilos.css">
</head>
<body>
<a class="salto" href="#contenido">Saltar al contenido</a>
<header class="encabezado">
<p class="marca">Sistema de créditos y becas</p>
${usuario ? navegacion(usuario, csrf) : ''}
</header>
<main id="contenido" tabindex="-1">
${contenido}
</main>
<footer class="pie"><p>Los documentos se registran solo por nombre de archivo; no se almacena su contenido.</p></footer>
</body>
</html>
`;
}

// Resumen de errores: `role="alert"` lo anuncia a los lectores de pantalla. Cada elemento puede
// enlazar al campo con error (`campo`).
function resumen(titulo, elementos) {
  return html`<div class="resumen-errores" role="alert">
<h2>${titulo}</h2>
<ul>
${elementos.map(({ campo, mensaje }) =>
    campo ? html`<li><a href="#${campo}">${mensaje}</a></li>` : html`<li>${mensaje}</li>`,
  )}
</ul>
</div>`;
}

function campoDeTexto({ id, etiqueta, valores, errores, ayuda, modo }) {
  const error = errores[id];
  const descripcion = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return html`<div class="campo">
<label for="${id}">${etiqueta}</label>
${ayuda ? html`<p id="${id}-ayuda" class="ayuda">${ayuda}</p>` : ''}
${error ? html`<p id="${id}-error" class="error-campo"><span class="solo-lectores">Error: </span>${error}</p>` : ''}
<input id="${id}" name="${id}" type="text" value="${valores[id] ?? ''}"${modo ? html` inputmode="${modo}"` : ''} required${error ? html` aria-invalid="true"` : ''}${descripcion ? html` aria-describedby="${descripcion}"` : ''}>
</div>`;
}

function vistaLogin({ codigoError } = {}) {
  const mensaje = MENSAJES_ERROR_LOGIN[codigoError];
  return pagina({
    titulo: 'Iniciar sesión',
    contenido: html`<h1>Iniciar sesión</h1>
${mensaje ? resumen('No se pudo iniciar sesión', [{ mensaje }]) : ''}
<form method="post" action="/login">
<div class="campo">
<label for="nombre_usuario">Usuario</label>
<input id="nombre_usuario" name="nombre_usuario" type="text" autocomplete="username" required>
</div>
<div class="campo">
<label for="contrasena">Contraseña</label>
<input id="contrasena" name="contrasena" type="password" autocomplete="current-password" required>
</div>
<button type="submit">Ingresar</button>
</form>`,
  });
}

function vistaListado({ usuario, csrf, solicitudes }) {
  const contenido = solicitudes.length === 0
    ? html`<p>Aún no tiene solicitudes de crédito.</p>`
    : html`<table>
<caption>Solicitudes de crédito registradas</caption>
<thead>
<tr><th scope="col">Periodo</th><th scope="col">Estado</th><th scope="col">Ocupación del acudiente</th><th scope="col">Creada</th><th scope="col">Detalle</th></tr>
</thead>
<tbody>
${solicitudes.map((s) => html`<tr>
<td>${s.periodoAcademico}</td>
<td>${etiquetaEstado(s.estado)} (<code>${s.estado}</code>)</td>
<td>${s.ocupacionAcudiente}</td>
<td><time datetime="${s.creadaEn}">${String(s.creadaEn).slice(0, 10)}</time></td>
<td><a href="/solicitudes/${s.id}">Ver solicitud ${s.periodoAcademico}</a></td>
</tr>`)}
</tbody>
</table>`;
  return pagina({
    titulo: 'Mis solicitudes',
    usuario,
    csrf,
    contenido: html`<h1>Mis solicitudes de crédito</h1>
<p><a class="boton" href="/solicitudes/nueva">Crear una solicitud</a></p>
${contenido}`,
  });
}

const CAMPOS_SOLICITUD = Object.freeze([
  { id: 'periodoAcademico', etiqueta: 'Periodo académico', ayuda: 'Por ejemplo: 2026-1.' },
  { id: 'ingresosHogar', etiqueta: 'Ingresos mensuales del hogar', ayuda: 'Solo números, sin signos ni separadores.', modo: 'decimal' },
  { id: 'numeroDependientes', etiqueta: 'Número de dependientes', modo: 'numeric' },
  { id: 'estrato', etiqueta: 'Estrato (1 a 6)', modo: 'numeric' },
  { id: 'ocupacionAcudiente', etiqueta: 'Ocupación del acudiente' },
]);

// `avisos`: mensajes que no pertenecen a un campo (p. ej. solicitud activa duplicada).
function vistaFormularioSolicitud({ usuario, csrf, valores = {}, errores = {}, avisos = [] }) {
  const elementos = [
    ...avisos.map((mensaje) => ({ mensaje })),
    ...CAMPOS_SOLICITUD.filter((c) => errores[c.id]).map((c) => ({ campo: c.id, mensaje: errores[c.id] })),
  ];
  return pagina({
    titulo: 'Nueva solicitud',
    usuario,
    csrf,
    contenido: html`<h1>Nueva solicitud de crédito</h1>
${elementos.length > 0 ? resumen('Revise la información', elementos) : ''}
<form method="post" action="/solicitudes">
${campoCsrf(csrf)}
${CAMPOS_SOLICITUD.map((c) => campoDeTexto({ ...c, valores, errores }))}
<button type="submit">Crear solicitud</button>
</form>`,
  });
}

function seccionDocumentos({ solicitud, documentos, faltantes, csrf, valoresDocumento, erroresDocumento }) {
  const adjuntos = documentos.length === 0
    ? html`<p>No hay documentos adjuntados.</p>`
    : html`<ul>
${documentos.map((d) => html`<li>${etiquetaDocumento(d.tipo)}: <code>${d.nombreArchivo}</code></li>`)}
</ul>`;
  if (solicitud.estado !== 'borrador') {
    return html`<section aria-labelledby="documentos"><h2 id="documentos">Documentos adjuntados</h2>${adjuntos}
<p>La solicitud ya fue enviada y está en proceso de revisión.</p></section>`;
  }
  const tipoActual = valoresDocumento.tipo ?? '';
  return html`<section aria-labelledby="documentos">
<h2 id="documentos">Documentos adjuntados</h2>
${adjuntos}
${faltantes.length > 0 ? html`<h3>Documentos requeridos pendientes</h3>
<ul>
${faltantes.map((tipo) => html`<li>${etiquetaDocumento(tipo)}</li>`)}
</ul>` : html`<p>Están adjuntos los tres documentos requeridos.</p>`}
</section>
<section aria-labelledby="adjuntar">
<h2 id="adjuntar">Adjuntar un documento</h2>
<form method="post" action="/solicitudes/${solicitud.id}/documentos">
${campoCsrf(csrf)}
<div class="campo">
<label for="tipo">Tipo de documento</label>
${erroresDocumento.tipo ? html`<p id="tipo-error" class="error-campo"><span class="solo-lectores">Error: </span>${erroresDocumento.tipo}</p>` : ''}
<select id="tipo" name="tipo" required>
${Object.entries(ETIQUETAS_DOCUMENTO).map(([tipo, etiqueta]) =>
    html`<option value="${tipo}"${tipo === tipoActual ? html` selected` : ''}>${etiqueta}</option>`)}
</select>
</div>
${campoDeTexto({
    id: 'nombreArchivo',
    etiqueta: 'Nombre del archivo',
    ayuda: 'Formatos permitidos: pdf, jpg, jpeg y png. Solo se registra el nombre; no se carga el contenido.',
    valores: valoresDocumento,
    errores: erroresDocumento,
  })}
<button type="submit">Adjuntar documento</button>
</form>
</section>
<section aria-labelledby="enviar">
<h2 id="enviar">Enviar a revisión</h2>
<p>Al confirmar, la solicitud deja de ser un borrador y no podrá modificarse.</p>
<form method="post" action="/solicitudes/${solicitud.id}/enviar">
${campoCsrf(csrf)}
<button type="submit">Confirmar envío</button>
</form>
</section>`;
}

// `resumenErrores`: `{ titulo, elementos }` opcional para mostrar mensajes sobre la solicitud.
function vistaDetalle({
  usuario,
  csrf,
  detalle,
  resumenErrores = null,
  valoresDocumento = {},
  erroresDocumento = {},
}) {
  const { solicitud, documentos, faltantes } = detalle;
  return pagina({
    titulo: `Solicitud ${solicitud.periodoAcademico}`,
    usuario,
    csrf,
    contenido: html`<h1>Solicitud de crédito ${solicitud.periodoAcademico}</h1>
${resumenErrores ? resumen(resumenErrores.titulo, resumenErrores.elementos) : ''}
<dl class="datos">
<dt>Estado</dt><dd><strong>${etiquetaEstado(solicitud.estado)}</strong> (<code>${solicitud.estado}</code>)</dd>
<dt>Periodo académico</dt><dd>${solicitud.periodoAcademico}</dd>
<dt>Ingresos mensuales del hogar</dt><dd>${solicitud.ingresosHogar}</dd>
<dt>Número de dependientes</dt><dd>${solicitud.numeroDependientes}</dd>
<dt>Estrato</dt><dd>${solicitud.estrato}</dd>
<dt>Ocupación del acudiente</dt><dd>${solicitud.ocupacionAcudiente}</dd>
<dt>Creada</dt><dd><time datetime="${solicitud.creadaEn}">${String(solicitud.creadaEn).slice(0, 10)}</time></dd>
</dl>
${seccionDocumentos({ solicitud, documentos, faltantes, csrf, valoresDocumento, erroresDocumento })}
<p><a href="/solicitudes">Volver a mis solicitudes</a></p>`,
  });
}

function vistaError({ estado, usuario, csrf }) {
  const [titulo, mensaje] = TITULOS_ERROR[estado] ?? TITULOS_ERROR[400];
  return pagina({
    titulo,
    usuario,
    csrf,
    contenido: html`<h1>${titulo}</h1><p>${mensaje}</p>
${usuario?.rol === 'estudiante' ? html`<p><a href="/solicitudes">Volver a mis solicitudes</a></p>` : ''}`,
  });
}

module.exports = {
  vistaLogin,
  vistaListado,
  vistaFormularioSolicitud,
  vistaDetalle,
  vistaError,
  etiquetaDocumento,
  etiquetaEstado,
};
