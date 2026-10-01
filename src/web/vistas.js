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

const ETIQUETAS_DESEMBOLSO = Object.freeze({
  programado: 'Programado',
  ejecutado: 'Ejecutado',
  vencido: 'Vencido',
});

const etiquetaDesembolso = (estado) => ETIQUETAS_DESEMBOLSO[estado] ?? estado;

const etiquetaEstado = (estado) => ETIQUETAS_ESTADO[estado] ?? estado;
const etiquetaDocumento = (tipo) => ETIQUETAS_DOCUMENTO[tipo] ?? tipo;

const campoCsrf = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

// Story 5.16: estudiantes y comite ven el enlace a la bandeja con el contador de avisos sin leer (texto, no solo color).
function enlaceAvisos(usuario) {
  if (usuario.rol !== 'estudiante' && usuario.rol !== 'comite_becas') return '';
  const sinLeer = Number(usuario.avisosNoLeidos ?? 0);
  return html`<a href="/avisos">${sinLeer > 0 ? `Avisos (${sinLeer})` : 'Avisos'}</a>`;
}

function navegacion(usuario, csrf) {
  return html`<nav aria-label="Principal">
${usuario.rol === 'estudiante' ? html`<a href="/solicitudes">Mis solicitudes</a>
<a href="/solicitudes/nueva">Nueva solicitud</a>
<a href="/becas">Mis becas</a>` : ''}
${usuario.rol === 'asesor_financiero' ? html`<a href="/asesor/cola">Cola de revisión</a>` : ''}
${usuario.rol === 'comite_becas' ? html`<a href="/comite">Cola del comité</a>` : ''}
${usuario.rol === 'direccion_academica' ? html`<a href="/direccion">Inicio</a>` : ''}
${enlaceAvisos(usuario)}
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

// `requerido: false` para datos que pueden quedar en blanco (p. ej. los de la solicitud de beca).
function campoDeTexto({ id, etiqueta, valores, errores, ayuda, modo, tipo = 'text', requerido = true }) {
  const error = errores[id];
  const descripcion = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return html`<div class="campo">
<label for="${id}">${etiqueta}</label>
${ayuda ? html`<p id="${id}-ayuda" class="ayuda">${ayuda}</p>` : ''}
${error ? html`<p id="${id}-error" class="error-campo"><span class="solo-lectores">Error: </span>${error}</p>` : ''}
<input id="${id}" name="${id}" type="${tipo}" value="${valores[id] ?? ''}"${modo ? html` inputmode="${modo}"` : ''}${requerido ? html` required` : ''}${error ? html` aria-invalid="true"` : ''}${descripcion ? html` aria-describedby="${descripcion}"` : ''}>
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

const dosDecimales = (monto) => Number(monto).toFixed(2);

// Story 5.10: calendario de desembolsos de una solicitud aprobada, solo lectura para el estudiante.
function seccionCalendario(calendario) {
  if (calendario.length === 0) {
    return html`<section aria-labelledby="calendario"><h2 id="calendario">Calendario de desembolsos</h2>
<p>Aún no hay desembolsos programados.</p></section>`;
  }
  const totalCentavos = calendario.reduce((suma, cuota) => suma + Math.round(cuota.monto * 100), 0);
  return html`<section aria-labelledby="calendario">
<h2 id="calendario">Calendario de desembolsos</h2>
<p>Su crédito fue aprobado por <strong>${dosDecimales(totalCentavos / 100)}</strong> en ${calendario.length} cuotas.</p>
<table>
<caption>Cuotas de desembolso programadas</caption>
<thead>
<tr><th scope="col">Cuota</th><th scope="col">Fecha</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col">Fecha de ejecución</th></tr>
</thead>
<tbody>
${calendario.map((cuota) => html`<tr>
<td>${cuota.numeroCuota}</td>
<td><time datetime="${cuota.fecha}">${cuota.fecha}</time></td>
<td>${dosDecimales(cuota.monto)}</td>
<td>${etiquetaDesembolso(cuota.estado)} (<code>${cuota.estado}</code>)</td>
<td>${celdaFechaEjecucion(cuota)}</td>
</tr>`)}
</tbody>
</table>
</section>`;
}

// Story 5.14: fecha en que se ejecuto la cuota, o aviso de que aun no se ejecuta.
const celdaFechaEjecucion = (cuota) =>
  cuota.fechaEjecucion
    ? html`<time datetime="${cuota.fechaEjecucion}">${cuota.fechaEjecucion}</time>`
    : html`Sin ejecutar`;

// `resumenErrores`: `{ titulo, elementos }` opcional para mostrar mensajes sobre la solicitud.
function vistaDetalle({
  usuario,
  csrf,
  detalle,
  resumenErrores = null,
  valoresDocumento = {},
  erroresDocumento = {},
}) {
  const { solicitud, documentos, faltantes, calendario } = detalle;
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
${calendario ? seccionCalendario(calendario) : ''}
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
${usuario?.rol === 'estudiante' ? html`<p><a href="/solicitudes">Volver a mis solicitudes</a> · <a href="/becas">Volver a mis becas</a></p>` : ''}
${usuario?.rol === 'asesor_financiero' ? html`<p><a href="/asesor/cola">Volver a la cola de revisión</a></p>` : ''}
${usuario?.rol === 'comite_becas' ? html`<p><a href="/comite">Volver a la cola del comité</a></p>` : ''}
${usuario?.rol === 'direccion_academica' ? html`<p><a href="/direccion">Volver al inicio</a></p>` : ''}`,
  });
}

// ---------------------------------------------------------------- Asesor financiero (Story 5.9)

// `bloqueVencimientos`: HTML ya renderizado de la revision manual de vencidos (Story 5.15), opcional.
function vistaCola({ usuario, csrf, cola, resumenErrores = null, bloqueVencimientos = '' }) {
  const contenido = cola.length === 0
    ? html`<p>No hay solicitudes pendientes de revisión.</p>`
    : html`<table>
<caption>Solicitudes pendientes de revisión</caption>
<thead>
<tr><th scope="col">Periodo</th><th scope="col">Creada</th><th scope="col">Asignación</th><th scope="col">Acción</th></tr>
</thead>
<tbody>
${cola.map((s) => html`<tr>
<td>${s.periodoAcademico}</td>
<td><time datetime="${s.creadaEn}">${String(s.creadaEn).slice(0, 10)}</time></td>
<td>${s.asignadaAMi ? 'Asignada a usted' : 'Sin asignar'}</td>
<td>${s.asignadaAMi
    ? html`<a href="/asesor/solicitudes/${s.id}">Revisar solicitud ${s.periodoAcademico}</a>`
    : html`<form method="post" action="/asesor/solicitudes/${s.id}/reclamar" class="en-linea">
${campoCsrf(csrf)}
<button type="submit">Reclamar solicitud ${s.periodoAcademico}</button>
</form>`}</td>
</tr>`)}
</tbody>
</table>`;
  return pagina({
    titulo: 'Cola de revisión',
    usuario,
    csrf,
    contenido: html`<h1>Cola de revisión</h1>
${resumenErrores ? resumen(resumenErrores.titulo, resumenErrores.elementos) : ''}
<p>Reclame una solicitud para ver sus datos y decidirla.</p>
${contenido}
${bloqueVencimientos}`,
  });
}

function seccionRechazo({ solicitud, csrf, valorMotivo, errorMotivo }) {
  const descripcion = ['motivo-ayuda', errorMotivo ? 'motivo-error' : null].filter(Boolean).join(' ');
  return html`<section aria-labelledby="rechazar">
<h2 id="rechazar">Rechazar la solicitud</h2>
<form method="post" action="/asesor/solicitudes/${solicitud.id}/rechazar">
${campoCsrf(csrf)}
<div class="campo">
<label for="motivo">Motivo del rechazo</label>
<p id="motivo-ayuda" class="ayuda">Obligatorio. El estudiante será notificado de la decisión.</p>
${errorMotivo ? html`<p id="motivo-error" class="error-campo"><span class="solo-lectores">Error: </span>${errorMotivo}</p>` : ''}
<textarea id="motivo" name="motivo" rows="4" required${errorMotivo ? html` aria-invalid="true"` : ''} aria-describedby="${descripcion}">${valorMotivo ?? ''}</textarea>
</div>
<button type="submit">Rechazar solicitud</button>
</form>
</section>`;
}

const CAMPOS_APROBACION = Object.freeze([
  { id: 'monto', etiqueta: 'Monto aprobado', ayuda: 'Solo números, con hasta dos decimales y sin separadores de miles.', modo: 'decimal' },
  { id: 'numeroCuotas', etiqueta: 'Número de cuotas', ayuda: 'Un entero mayor que cero.', modo: 'numeric' },
  { id: 'fechaPrimeraCuota', etiqueta: 'Fecha de la primera cuota', ayuda: 'Las demás cuotas caen cada mes.', tipo: 'date' },
]);

// Story 5.10: aprobar con las condiciones del credito. Los campos con error se anuncian en el
// resumen (`resumenErrores`) y junto al campo.
function seccionAprobacion({ solicitud, csrf, valoresAprobacion = {}, erroresAprobacion = {} }) {
  return html`<section aria-labelledby="aprobar">
<h2 id="aprobar">Aprobar la solicitud</h2>
<p>Al aprobar se generan los desembolsos programados y el estudiante será notificado de la decisión.</p>
<form method="post" action="/asesor/solicitudes/${solicitud.id}/aprobar">
${campoCsrf(csrf)}
${CAMPOS_APROBACION.map((c) => campoDeTexto({ ...c, valores: valoresAprobacion, errores: erroresAprobacion }))}
<button type="submit">Aprobar solicitud</button>
</form>
</section>`;
}

// Story 5.14: calendario de la solicitud aprobada para el asesor asignado. El boton de ejecutar solo
// se ofrece en las cuotas `programado`; en las ejecutadas se muestra la fecha de ejecucion.
function seccionDesembolsosAsesor({ desembolsos, csrf }) {
  if (desembolsos.length === 0) {
    return html`<section aria-labelledby="calendario"><h2 id="calendario">Calendario de desembolsos</h2>
<p>No hay desembolsos programados.</p></section>`;
  }
  return html`<section aria-labelledby="calendario">
<h2 id="calendario">Calendario de desembolsos</h2>
<table>
<caption>Cuotas de desembolso de la solicitud</caption>
<thead>
<tr><th scope="col">Cuota</th><th scope="col">Fecha</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col">Fecha de ejecución</th><th scope="col">Acción</th></tr>
</thead>
<tbody>
${desembolsos.map((cuota) => html`<tr>
<td>${cuota.numeroCuota}</td>
<td><time datetime="${cuota.fecha}">${cuota.fecha}</time></td>
<td>${dosDecimales(cuota.monto)}</td>
<td>${etiquetaDesembolso(cuota.estado)} (<code>${cuota.estado}</code>)</td>
<td>${celdaFechaEjecucion(cuota)}</td>
<td>${cuota.estado === 'programado'
    ? html`<form method="post" action="/asesor/desembolsos/${cuota.id}/ejecutar">
${campoCsrf(csrf)}
<button type="submit">Ejecutar desembolso</button>
</form>`
    : html`Sin acciones`}</td>
</tr>`)}
</tbody>
</table>
</section>`;
}

// `detalle`: { solicitud, documentos, decision, desembolsos? }. Los formularios de aprobacion y rechazo solo se
// ofrecen mientras la solicitud sigue pendiente de revision.
function vistaDetalleAsesor({
  usuario,
  csrf,
  detalle,
  resumenErrores = null,
  valorMotivo,
  errorMotivo,
  valoresAprobacion,
  erroresAprobacion,
}) {
  const { solicitud, documentos, decision, desembolsos } = detalle;
  return pagina({
    titulo: `Revisión ${solicitud.periodoAcademico}`,
    usuario,
    csrf,
    contenido: html`<h1>Revisión de la solicitud ${solicitud.periodoAcademico}</h1>
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
<section aria-labelledby="documentos">
<h2 id="documentos">Documentos adjuntados</h2>
${documentos.length === 0
    ? html`<p>No hay documentos adjuntados.</p>`
    : html`<ul>
${documentos.map((d) => html`<li>${etiquetaDocumento(d.tipo)}: <code>${d.nombreArchivo}</code></li>`)}
</ul>`}
</section>
${decision
    ? html`<section aria-labelledby="decision">
<h2 id="decision">Decisión registrada</h2>
<dl class="datos">
<dt>Tipo</dt><dd><code>${decision.tipo}</code></dd>
<dt>Fecha</dt><dd><time datetime="${decision.fecha}">${String(decision.fecha).slice(0, 10)}</time></dd>
${decision.motivo ? html`<dt>Motivo</dt><dd>${decision.motivo}</dd>` : ''}
</dl>
</section>`
    : solicitud.estado === 'pendiente_revision'
      ? html`${seccionAprobacion({ solicitud, csrf, valoresAprobacion, erroresAprobacion })}
${seccionRechazo({ solicitud, csrf, valorMotivo, errorMotivo })}`
      : ''}
${desembolsos ? seccionDesembolsosAsesor({ desembolsos, csrf }) : ''}
<p><a href="/asesor/cola">Volver a la cola de revisión</a></p>`,
  });
}

// ---------------------------------------------------------------- Direccion academica (Story 5.9)

// Resumen de solo lectura: nunca recibe campos socioeconomicos (el servicio los proyecta fuera).
function vistaResumenDireccion({ usuario, csrf, resumenSolicitud }) {
  const { id, periodoAcademico, estado, decision } = resumenSolicitud;
  return pagina({
    titulo: `Resumen ${periodoAcademico}`,
    usuario,
    csrf,
    contenido: html`<h1>Resumen de la solicitud ${periodoAcademico}</h1>
<dl class="datos">
<dt>Identificador</dt><dd><code>${id}</code></dd>
<dt>Periodo académico</dt><dd>${periodoAcademico}</dd>
<dt>Estado</dt><dd><strong>${etiquetaEstado(estado)}</strong> (<code>${estado}</code>)</dd>
${decision
    ? html`<dt>Tipo de decisión</dt><dd><code>${decision.tipo}</code></dd>
<dt>Fecha de la decisión</dt><dd><time datetime="${decision.fecha}">${String(decision.fecha).slice(0, 10)}</time></dd>`
    : html`<dt>Decisión</dt><dd>Aún no hay decisión.</dd>`}
</dl>
<p>Vista de solo lectura: no incluye información socioeconómica.</p>`,
  });
}

module.exports = {
  vistaLogin,
  vistaListado,
  vistaFormularioSolicitud,
  vistaDetalle,
  vistaError,
  vistaCola,
  // Piezas comunes que reutilizan las vistas de becas (vistasBecas.js).
  pagina,
  resumen,
  campoDeTexto,
  campoCsrf,
  vistaDetalleAsesor,
  vistaResumenDireccion,
  etiquetaDocumento,
  etiquetaEstado,
};
