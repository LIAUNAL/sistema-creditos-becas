'use strict';

const { ejecutarCasoDeUso } = require('../infra/casoDeUso');
const { crearUnidadDeTrabajo } = require('../infra/unidadDeTrabajo');
const { DOCUMENTOS_REQUERIDOS_POR_DEFECTO } = require('../solicitud-credito/envioSolicitud');
const { proyectarCalendario } = require('./proyeccionCalendario');

// Casos de uso del flujo del estudiante (Story 5.8). Cada uno corre en `ejecutarCasoDeUso` con su
// propia unidad de trabajo: el estado mutado y las notificaciones recolectadas se confirman en una
// sola transaccion. Los documentos son solo metadatos (tipo + nombre de archivo, F8/Q3).

const ESTRATOS = Object.freeze([1, 2, 3, 4, 5, 6]);
const MAX_PERIODO = 20;
const MAX_OCUPACION = 100;
const MAX_NOMBRE_ARCHIVO = 255;
const MAX_DEPENDIENTES = 30;

class ErrorDatosInvalidos extends Error {
  constructor(errores) {
    super(`Datos inválidos: ${Object.keys(errores).join(', ')}`);
    this.name = 'ErrorDatosInvalidos';
    this.codigo = 'DATOS_INVALIDOS';
    this.estadoHttp = 400;
    this.errores = errores;
  }
}

// Un recurso ajeno y uno inexistente son indistinguibles (regla P5: denegar == no encontrado).
class ErrorSolicitudNoEncontrada extends Error {
  constructor(solicitudId) {
    super(`La solicitud ${solicitudId} no existe o no es visible para el usuario`);
    this.name = 'ErrorSolicitudNoEncontrada';
    this.codigo = 'RECURSO_NO_ENCONTRADO';
    this.estadoHttp = 404;
  }
}

class ErrorRolNoPermitido extends Error {
  constructor() {
    super('Solo un estudiante puede operar sobre sus solicitudes');
    this.name = 'ErrorRolNoPermitido';
    this.codigo = 'ROL_NO_PERMITIDO';
    this.estadoHttp = 403;
  }
}

// Mismo criterio que las politicas de visibilidad (P5): `estudianteId` de la cuenta o su id de usuario.
function idCanonicoEstudiante(usuario) {
  return String(usuario.estudianteId ?? usuario.id);
}

const texto = (valor) => String(valor ?? '').trim();

function validarDatosSolicitud(datos = {}) {
  const errores = {};
  const periodoAcademico = texto(datos.periodoAcademico);
  const ingresos = texto(datos.ingresosHogar);
  const dependientes = texto(datos.numeroDependientes);
  const estrato = texto(datos.estrato);
  const ocupacionAcudiente = texto(datos.ocupacionAcudiente);

  if (periodoAcademico === '') errores.periodoAcademico = 'Indique el periodo académico.';
  else if (periodoAcademico.length > MAX_PERIODO) {
    errores.periodoAcademico = `El periodo académico admite hasta ${MAX_PERIODO} caracteres.`;
  }

  if (ingresos === '') errores.ingresosHogar = 'Indique los ingresos del hogar.';
  else if (!/^\d+(\.\d+)?$/.test(ingresos)) {
    errores.ingresosHogar = 'Ingrese un número mayor o igual a 0, sin signos ni separadores de miles.';
  }

  if (dependientes === '') errores.numeroDependientes = 'Indique el número de dependientes.';
  else if (!/^\d+$/.test(dependientes) || Number(dependientes) > MAX_DEPENDIENTES) {
    errores.numeroDependientes = `Ingrese un número entero entre 0 y ${MAX_DEPENDIENTES}.`;
  }

  if (estrato === '') errores.estrato = 'Indique el estrato.';
  else if (!/^\d$/.test(estrato) || !ESTRATOS.includes(Number(estrato))) {
    errores.estrato = 'Ingrese un estrato entero entre 1 y 6.';
  }

  if (ocupacionAcudiente === '') errores.ocupacionAcudiente = 'Indique la ocupación del acudiente.';
  else if (ocupacionAcudiente.length > MAX_OCUPACION) {
    errores.ocupacionAcudiente = `La ocupación admite hasta ${MAX_OCUPACION} caracteres.`;
  }

  if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);
  return {
    periodoAcademico,
    ingresosHogar: Number(ingresos),
    numeroDependientes: Number(dependientes),
    estrato: Number(estrato),
    ocupacionAcudiente,
  };
}

function validarDocumento({ tipo, nombreArchivo } = {}) {
  const errores = {};
  const nombre = texto(nombreArchivo);
  if (!DOCUMENTOS_REQUERIDOS_POR_DEFECTO.includes(tipo)) errores.tipo = 'Seleccione un tipo de documento de la lista.';
  if (nombre === '') errores.nombreArchivo = 'Indique el nombre del archivo.';
  else if (nombre.length > MAX_NOMBRE_ARCHIVO || /[\\/\u0000-\u001f]/.test(nombre)) {
    errores.nombreArchivo = 'El nombre del archivo no es válido: sin rutas ni caracteres de control.';
  }
  if (Object.keys(errores).length > 0) throw new ErrorDatosInvalidos(errores);
  return { tipo, nombreArchivo: nombre };
}

function crearServicioSolicitudes({ db, reloj, colector, registro, envio, repositorios, politicas, ejecucion }) {
  // Cada llamada es un caso de uso con su propia unidad de trabajo (identity map aislado).
  const caso = (operacion) =>
    ejecutarCasoDeUso({ db, colector, reloj, unidadDeTrabajo: crearUnidadDeTrabajo(), operacion });

  function exigirEstudiante(usuario) {
    if (usuario?.rol !== 'estudiante') throw new ErrorRolNoPermitido();
  }

  function cargarVisible(usuario, solicitudId) {
    const solicitud = registro.obtener(solicitudId);
    if (!solicitud || !politicas.puedeVerSolicitud(usuario, solicitud)) {
      throw new ErrorSolicitudNoEncontrada(solicitudId);
    }
    return solicitud;
  }

  const copiar = (usuario, solicitud) => ({ ...politicas.proyectarSolicitud(usuario, solicitud) });

  return {
    async crearSolicitud(usuario, datos) {
      exigirEstudiante(usuario);
      const validos = validarDatosSolicitud(datos);
      return caso(() => copiar(usuario, registro.crear({ ...validos, estudianteId: idCanonicoEstudiante(usuario) })));
    },

    async adjuntarDocumento(usuario, solicitudId, documento) {
      exigirEstudiante(usuario);
      const valido = validarDocumento(documento);
      return caso(() => {
        cargarVisible(usuario, solicitudId);
        return { ...envio.adjuntarDocumento(solicitudId, valido) };
      });
    },

    async confirmarEnvio(usuario, solicitudId) {
      exigirEstudiante(usuario);
      return caso(() => {
        cargarVisible(usuario, solicitudId);
        return copiar(usuario, envio.confirmarEnvio(solicitudId));
      });
    },

    async listarMisSolicitudes(usuario) {
      exigirEstudiante(usuario);
      return caso(() =>
        repositorios.solicitudes.listarPorEstudiante(idCanonicoEstudiante(usuario)).map((s) => copiar(usuario, s)),
      );
    },

    // Devuelve `undefined` si no existe o no es visible: el llamador responde 404 en ambos casos.
    async obtenerSolicitud(usuario, solicitudId) {
      exigirEstudiante(usuario);
      return caso(() => {
        const solicitud = registro.obtener(solicitudId);
        if (!solicitud || !politicas.puedeVerSolicitud(usuario, solicitud)) return undefined;
        const documentos = envio.documentosDe(solicitudId).map((d) => ({ ...d }));
        const cargados = new Set(documentos.map((d) => d.tipo));
        const detalle = {
          solicitud: copiar(usuario, solicitud),
          documentos,
          faltantes: DOCUMENTOS_REQUERIDOS_POR_DEFECTO.filter((tipo) => !cargados.has(tipo)),
        };
        // Story 5.10: el estudiante conoce cuando y cuanto se le desembolsa (solo lectura).
        if (solicitud.estado === 'aprobada') {
          // Story 5.14: con la fecha de ejecucion y el estado del historial del modulo (sin ids internos).
          detalle.calendario = proyectarCalendario(ejecucion, repositorios.calendario.obtenerPorSolicitud(solicitudId)).map(
            ({ id: _id, ...cuota }) => cuota,
          );
        }
        return detalle;
      });
    },
  };
}

module.exports = {
  crearServicioSolicitudes,
  idCanonicoEstudiante,
  ErrorDatosInvalidos,
  ErrorSolicitudNoEncontrada,
  DOCUMENTOS_REQUERIDOS: DOCUMENTOS_REQUERIDOS_POR_DEFECTO,
};
