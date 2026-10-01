'use strict';

// Campos socioeconomicos (NFR-003): los de la solicitud de credito
// (CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS) y el promedio acumulado que usa la evaluacion de elegibilidad.
const CAMPOS_SOCIOECONOMICOS = Object.freeze([
  'ingresosHogar',
  'numeroDependientes',
  'estrato',
  'ocupacionAcudiente',
  'promedioAcumulado',
]);

// Se compara sin distinguir mayusculas ni guiones bajos para cubrir tambien `ingresos_hogar`.
const normalizar = (clave) => clave.replace(/_/g, '').toLowerCase();
const CLAVES_SOCIOECONOMICAS = new Set(CAMPOS_SOCIOECONOMICOS.map(normalizar));

// Roles que pueden recibir los campos socioeconomicos de cada tipo de recurso. Todo rol ausente
// (incluida direccion_academica, que NUNCA los recibe) los pierde: la proyeccion falla cerrado.
const VEN_SOCIOECONOMICOS_EN_SOLICITUD = Object.freeze(['estudiante', 'asesor_financiero']);
const VEN_SOCIOECONOMICOS_EN_EVALUACION = Object.freeze(['asesor_financiero', 'comite_becas']);

// Copia profunda sin los campos socioeconomicos, en objetos, listas y anidados.
function quitarSocioeconomicos(valor) {
  if (Array.isArray(valor)) return valor.map(quitarSocioeconomicos);
  if (valor === null || typeof valor !== 'object') return valor;
  const resultado = {};
  for (const [clave, contenido] of Object.entries(valor)) {
    if (!CLAVES_SOCIOECONOMICAS.has(normalizar(clave))) {
      resultado[clave] = quitarSocioeconomicos(contenido);
    }
  }
  return resultado;
}

function proyectarPara(rolesQueLosVen) {
  return (usuario, recurso) =>
    rolesQueLosVen.includes(usuario?.rol) ? recurso : quitarSocioeconomicos(recurso);
}

// Un usuario es el estudiante `estudianteId` si coincide con `usuario.estudianteId` (cuando la
// cuenta lo trae) o, mientras las cuentas no lo tengan, con su id de usuario como texto.
function esEstudianteDe(usuario, recurso) {
  if (usuario?.rol !== 'estudiante' || typeof recurso?.estudianteId !== 'string') return false;
  return recurso.estudianteId === String(usuario.estudianteId ?? usuario.id);
}

/**
 * Politicas de visibilidad (NFR-003, FR-041). Funciones puras: la unica dependencia es el
 * almacen de asignaciones inyectado. Un recurso ausente, un usuario sin sesion o un rol
 * desconocido siempre se deniegan.
 */
function crearPoliticas({ asignaciones }) {
  function puedeVerSolicitud(usuario, solicitud) {
    if (!usuario || !solicitud) return false;
    switch (usuario.rol) {
      case 'estudiante':
        return esEstudianteDe(usuario, solicitud);
      case 'asesor_financiero':
        return asignaciones.estaAsignado(usuario.id, 'solicitud_credito', solicitud.id);
      case 'direccion_academica':
        // Story 5.9: puede ABRIR la solicitud, pero solo por la vista proyectada: quien la use debe
        // pasar el recurso por `proyectarSolicitud`, que le quita todo campo socioeconomico (NFR-003).
        return true;
      default:
        return false; // comite_becas no ve solicitudes de credito.
    }
  }

  // La asignacion de los integrantes del comite la crea `asignarComiteACaso` (regla Q5 por defecto).
  function puedeVerCasoComite(usuario, caso) {
    if (usuario?.rol !== 'comite_becas' || !caso) return false;
    return asignaciones.estaAsignado(usuario.id, 'caso_comite', caso.id);
  }

  // Lectura aparte del caso: el estudiante solo consulta el estado de su propia evaluacion.
  const puedeVerEstadoEvaluacion = (usuario, evaluacion) => esEstudianteDe(usuario, evaluacion);

  const puedeVerReportes = (usuario) => usuario?.rol === 'direccion_academica';

  return {
    puedeVerSolicitud,
    puedeVerCasoComite,
    puedeVerEstadoEvaluacion,
    puedeVerReportes,
    proyectarSolicitud: proyectarPara(VEN_SOCIOECONOMICOS_EN_SOLICITUD),
    proyectarEvaluacion: proyectarPara(VEN_SOCIOECONOMICOS_EN_EVALUACION),
  };
}

module.exports = { crearPoliticas, CAMPOS_SOCIOECONOMICOS };
