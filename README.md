# Sistema de Créditos y Becas

Aplicación web para gestionar **solicitudes de crédito educativo** y **solicitudes de beca**. Cuatro roles trabajan sobre los mismos datos: el estudiante pide, el asesor financiero decide y ejecuta los desembolsos, el comité de becas resuelve los casos dudosos y la dirección académica consulta reportes y alertas.

No necesita instalar dependencias: usa solo Node.js (servidor HTTP propio y la base SQLite integrada en Node). Los textos de la interfaz están en español.

## Requisitos

- **Node.js 22.13 o superior** (usa el módulo integrado `node:sqlite`; con una versión anterior no arranca). Compruébelo con `node --version`.
- Nada más: el proyecto no tiene dependencias de `npm`, así que **no hace falta ejecutar `npm install`**.

## Inicio rápido

Desde la raíz del repositorio:

```bash
# 1. Crear la base y los cuatro usuarios (una contraseña por rol, a su elección)
SEED_PASSWORD_ESTUDIANTE=clave-estudiante \
SEED_PASSWORD_ASESOR_FINANCIERO=clave-asesor \
SEED_PASSWORD_COMITE_BECAS=clave-comite \
SEED_PASSWORD_DIRECCION_ACADEMICA=clave-direccion \
npm run seed

# 2. Iniciar el servidor
npm start
```

Abra <http://localhost:3000> e inicie sesión. La base se crea sola en `data/app.db` (variable `DB_PATH` para cambiar el lugar; use el mismo valor en `npm run seed` y en `npm start`).

Notas del arranque:

- Si no define `SEED_PASSWORD_<ROL>`, el sembrado **genera una contraseña aleatoria** y la imprime **una sola vez**; cópiela entonces. El sembrado es idempotente: un usuario que ya existe no se modifica.
- Sin `CSRF_SECRET` el servidor avisa por consola y usa un secreto aleatorio por proceso (las páginas abiertas dejan de servir al reiniciar). Para evitarlo: `CSRF_SECRET=una-frase-de-al-menos-16-caracteres npm start`.
- Si alguna variable de entorno tiene un valor inválido, el servidor imprime un mensaje de una línea y termina con código 1 **sin abrir el puerto**.
- `Ctrl+C` (o `SIGTERM`) cierra el servidor de forma ordenada.

### Usuarios y qué ve cada rol

El nombre de usuario es el nombre del rol; la contraseña es la que definió en el sembrado.

| Usuario | Rol | Al iniciar sesión llega a | Qué puede hacer |
| --- | --- | --- | --- |
| `estudiante` | Estudiante | `/solicitudes` | Crear solicitudes de crédito, adjuntar documentos y enviarlas; ver el estado y el calendario de desembolsos de las propias; presentar solicitudes de beca y ver su resultado; leer sus avisos. |
| `asesor_financiero` | Asesor financiero | `/asesor/cola` | Ver la cola de solicitudes pendientes, reclamar una, aprobarla con sus condiciones (monto, cuotas, fecha de la primera cuota) o rechazarla con motivo; ejecutar los desembolsos de sus solicitudes; lanzar la revisión de desembolsos vencidos. |
| `comite_becas` | Comité de becas | `/comite` | Ver la cola de casos limítrofes, abrir un caso (puntaje y datos de entrada) y decidir otorgar o denegar con un comentario; leer sus avisos de casos nuevos. |
| `direccion_academica` | Dirección académica | `/direccion` | Ver la mora por periodo, lanzar la revisión de vencidos, consultar el reporte consolidado por periodo (créditos aprobados, becas otorgadas, monto desembolsado) y la alerta de mora, y fijar el umbral de mora de cada periodo. Nunca ve datos socioeconómicos. |

Todos los roles tienen además `/avisos` (bandeja dentro de la aplicación; el asesor y la dirección no reciben avisos por ahora) y `/logout`.

### Recorrido de los flujos principales

**Crédito: solicitud, aprobación y desembolso**

1. Como `estudiante`: **Nueva solicitud** → complete periodo académico, ingresos del hogar, número de dependientes, estrato y ocupación del acudiente → guardar (queda como borrador).
2. En el detalle de la solicitud, adjunte los tres documentos (`identificacion`, `certificado_ingresos`, `certificado_matricula`; solo se registra el nombre del archivo, con extensión `pdf`, `jpg`, `jpeg` o `png`) y pulse **Enviar**. Pasa a `pendiente_revision` y el estudiante recibe un aviso.
3. Como `asesor_financiero`: abra **Cola de revisión**, **reclame** la solicitud y ábrala. **Apruebe** indicando monto, número de cuotas y fecha de la primera cuota (se genera el calendario de desembolsos), o **rechace** con un motivo.
4. En el mismo detalle, el asesor **ejecuta** cada cuota cuando corresponde: la cuota pasa de `programado` a `ejecutado`, queda en la auditoría y el estudiante recibe un aviso. Una cuota `programado` que no se ejecuta antes de su fecha más el plazo (15 días por defecto) pasa a `vencido` con la revisión diaria o con el botón de revisión manual.
5. Como `estudiante`: el detalle muestra el estado de cada cuota. Como `direccion_academica`: **Reportes** suma el monto desembolsado del periodo.

**Beca: solicitud y resultado**

1. Como `estudiante`: **Mis becas** → nueva solicitud con periodo académico, promedio acumulado (0 a 5), estrato e ingresos del hogar. Si falta algún dato, la solicitud queda `datos_incompletos` y se completa desde su página.
2. El sistema calcula la elegibilidad con la configuración por defecto: **elegible** (otorgada de forma automática), **no elegible**, o **limítrofe**.
3. Un caso limítrofe entra a la cola del `comite_becas`: un integrante abre el caso, decide **otorgar** o **denegar** y escribe un comentario. El estudiante ve el resultado y el comentario, **nunca el puntaje**.
4. Como `direccion_academica`: **Reportes** cuenta la beca (automática o por comité) en el periodo.

## Variables de entorno

Todas son opcionales. Las que se leen al arrancar se validan antes de abrir el puerto.

| Variable | Valor por defecto | Efecto |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor (entero de 0 a 65535; `0` pide uno libre y el arranque imprime el real). Escucha en todas las interfaces (`0.0.0.0`). |
| `DB_PATH` | `data/app.db` | Archivo SQLite (se crea con sus carpetas). `:memory:` usa una base en memoria que se pierde al terminar. Lo leen `npm start` y `npm run seed`. |
| `CSRF_SECRET` | aleatorio por proceso | Secreto (mínimo 16 caracteres) con el que se firman los tokens CSRF. Defínalo para que los tokens sobrevivan a un reinicio. |
| `TRUST_PROXY` | sin definir | Con `1`, la cookie de sesión lleva `Secure` cuando el proxy envía `X-Forwarded-Proto: https`. Sin él, ese encabezado se ignora. |
| `COOKIE_SECURE` | sin definir | Con `1`, la cookie de sesión siempre lleva `Secure` (solo funciona sobre HTTPS). |
| `SEED_PASSWORD_ESTUDIANTE` | contraseña aleatoria impresa una vez | Contraseña del usuario `estudiante` al ejecutar `npm run seed`. |
| `SEED_PASSWORD_ASESOR_FINANCIERO` | ídem | Contraseña del usuario `asesor_financiero`. |
| `SEED_PASSWORD_COMITE_BECAS` | ídem | Contraseña del usuario `comite_becas`. |
| `SEED_PASSWORD_DIRECCION_ACADEMICA` | ídem | Contraseña del usuario `direccion_academica`. |
| `VENCIMIENTOS_PLAZO_DIAS` | `15` | Días después de la fecha de una cuota tras los cuales, sin confirmar, se considera vencida (entero). |
| `VENCIMIENTOS_INTERVALO_MS` | `86400000` (24 h) | Cada cuánto corre la revisión de vencidos dentro del proceso (entero de 1 a 2147483647 ms). |
| `VENCIMIENTOS_AL_INICIAR` | corre al iniciar | Con el valor `false` se omite la revisión que se hace al arrancar. Cualquier otro valor la deja activa. |
| `UMBRAL_MORA_DEFECTO` | `0.10` | Umbral de la alerta de mora (fracción mayor que 0 y hasta 1) para los periodos sin umbral propio. |

## Pruebas

```bash
npm test
```

Ejecuta toda la suite con `node --test src/` (sin dependencias): pruebas unitarias de los módulos y los servicios, pruebas de flujo por HTTP contra el servidor real con SQLite en memoria, el barrido de roles y visibilidad (`src/web/barridoDeRoles.test.js`), la prueba de rendimiento con 10.000 registros por tipo (`src/web/rendimiento.test.js`), las pruebas de punta a punta (`src/web/e2e.test.js`) y la del arranque como proceso hijo (`src/web/arranque.test.js`).

## Estructura del proyecto

| Carpeta | Contenido |
| --- | --- |
| `src/solicitud-credito/`, `src/desembolso/`, `src/evaluacion-elegibilidad/`, `src/reportes/` | Módulos de negocio originales (reglas puras de solicitud de crédito, calendario y ejecución de desembolsos, cálculo de elegibilidad y comité, reporte consolidado y alerta de mora). |
| `src/infra/` | Persistencia y servicios técnicos: SQLite, migraciones (`versiones/`), repositorios, unidad de trabajo y transacciones, auditoría, asignaciones, contraseñas, planificador de vencimientos y sembrado. |
| `src/app/` | Casos de uso que unen los módulos con la persistencia (`servicio*.js`), las políticas de visibilidad y el contexto que lo arma todo (`contextoApp.js`). |
| `src/web/` | Servidor HTTP, router, autenticación y sesiones, CSRF, cabeceras de seguridad, páginas y vistas HTML, y el punto de entrada (`main.js`). |
| `docs/` | `architecture-base.md` y `web-app-plan.md` (decisiones, riesgos y plan de la aplicación). |
| `openspec/` | Especificaciones y cambios (uno por story del backlog). |

## Supuestos del equipo pendientes de confirmar con el negocio

Se tomaron por defecto para poder construir; cualquiera puede cambiar:

- **Pila tecnológica:** Node.js sin dependencias, servidor HTTP propio, HTML renderizado en el servidor y SQLite (`node:sqlite`). No se eligió otra (Express, React, PostgreSQL).
- **Quién ejecuta los desembolsos:** el asesor financiero asignado a la solicitud (la historia original no nombra un actor).
- **Documentos:** solo se guardan como metadatos (tipo y nombre de archivo); no se suben ni se almacenan los bytes.
- **Solicitud de beca:** la inicia el propio estudiante, que escribe su promedio acumulado.
- **Asignación:** un asesor **reclama** una solicitud de crédito sin asignar; **todos** los integrantes del comité quedan asignados a **todos** los casos.
- **Elegibilidad de becas** (`src/app/configuracionElegibilidad.js`): escala de notas de 0 a 5, estratos 1 a 6, ingresos de referencia de 6.000.000 mensuales; pesos 0,5 (promedio), 0,25 (estrato) y 0,25 (ingresos); puntaje igual o mayor a 70 es elegible, de 50 a menos de 70 es limítrofe (va al comité) y menos de 50 no es elegible. La aplicación puede usar otra configuración por periodo guardada en la tabla `configuracion_elegibilidad`, pero no hay pantalla para editarla.
- **Umbral de mora por defecto:** 10 % (`0.10`); no lo fija ningún documento. Se cambia con `UMBRAL_MORA_DEFECTO` y, por periodo, desde **Reportes**.

## Límites conocidos

- **Una sola instancia:** el bloqueo de intentos de inicio de sesión (5 fallos en 15 minutos) vive en la memoria del proceso y la revisión diaria de vencidos corre dentro del proceso con un temporizador. Con varias instancias cada una llevaría su cuenta y su propia revisión; con el servidor detenido no hay revisión (por eso corre al iniciar, y existe el botón manual).
- **Sin correo:** los avisos son solo la bandeja `/avisos` dentro de la aplicación.
- **Sin subida de archivos:** los documentos son solo metadatos.
- **Sin recuperación de contraseña ni alta de usuarios:** los únicos usuarios son los cuatro del sembrado; no hay pantallas para crearlos ni cambiar contraseñas.
- **Las peticiones `HEAD` no están soportadas** por el router (responden 404); use `GET`.
- **SQLite integrado de Node:** `node:sqlite` es un módulo reciente de Node (en algunas versiones de Node 22 puede imprimir una advertencia de módulo experimental al arrancar). La conexión es única y síncrona. La suite y esta guía se verificaron con Node v26.8.1.
- Las colas del asesor y del comité muestran todos los casos pendientes sin paginar.
