# Arquitectura base

> Plantilla generada por `un-specweaver init`. Reemplaza el contenido por la arquitectura real
> de tu organizacion. Este archivo se carga como contexto en toda fase de diseno y
> construccion, asi que lo que este aqui manda sobre lo que el agente asuma por defecto.
>
> `un-specweaver init` nunca sobreescribe este archivo si ya existe.

## Stack por defecto

Decisión D1 — pendiente de confirmar (Q1); default del plan: aceptar D1-D3.

- Node v26.8.1 (versión verificada por el plan; el `package.json` declara `engines` para `node:sqlite`, se agrega en la story 5.1).
- Solo built-ins de Node: `node:http`, `node:sqlite`, `node:crypto`, `node:test`.
- CommonJS, cero dependencias externas, sin paso de build.
- HTML renderizado en servidor desde funciones de plantilla.
- Alternativa evaluada y no elegida por defecto: Express + React + Postgres (se decide en Q1).

## Estructura de proyecto

- `src/<capacidad>/`: módulos de negocio existentes (11). Reciben puertos de repositorio aditivos con escritura explícita y métodos de lista/consulta de solo lectura.
- `src/app/`: casos de uso que orquestran módulos, persisten en `try/finally` y poseen los puentes entre módulos.
- `src/infra/`: conexión SQLite y migraciones, repositorios, notificador colector y escritor/entrega del outbox, reloj, planificador.
- `src/web/`: enrutador, autenticación, manejadores, plantillas de vista y mapeo de errores (`.codigo` del módulo a estado HTTP).
- Pruebas `*.test.js` junto al código; `npm test` = `node --test src/`.

## Fronteras y capas

- Dirección de dependencia: web -> app -> módulos existentes; infra implementa los puertos.
- Los módulos existentes NUNCA importan `app`, `infra` ni `web`.
- Los puentes entre módulos viven en `src/app/` y no cambian la semántica de los módulos: id canónico `studentId` mapeado al campo de cada módulo (`estudianteId`, `idEstudiante`, `estudiante`); términos del crédito en una tabla de la aplicación mezclados en la solicitud que recibe `generar`; `periodoAcademico` y `tipoCredito` copiados a cada desembolso al generarlo; tabla `scholarship_applications` (incluye `promedioAcumulado`) que alimenta el cálculo de elegibilidad; proyección `scholarship_awards` que registra las `elegible` automáticas y las `otorgada` del comité; `audit_log`; normalización de fechas a ISO en el borde JSON/HTML.
- Ningún módulo se reescribe con otra semántica; sus pruebas existentes (94) son la compuerta de regresión.

## Persistencia

Decisión D2 — pendiente de confirmar (Q1); default del plan: SQLite con `node:sqlite`.

- Archivo SQLite con escritura explícita: un puerto de repositorio solo NO basta porque los módulos mutan referencias vivas (`confirmarEnvio`, `_decidir`) y los módulos sin estado (`ejecutar`, `revisar`) mutan los desembolsos recibidos.
- Cada punto de mutación persiste en el mismo caso de uso de `src/app/` con `save`/`actualizar` explícito dentro de `try/finally`, de modo que el estado se guarda aunque el módulo lance tras mutar.
- Notificador colector por caso de uso: solo registra el payload en memoria (síncrono, nunca lanza, no toca la base). Tras la llamada, el caso de uso guarda el estado y las filas del outbox en UNA transacción síncrona que no cruza un `await` (todo o nada).
- Política de fallos del notificador: un estado ya fijado nunca se revierte por la entrega ni por un error del notificador; la entrega del outbox es un paso posterior al commit.
- Migraciones con ejecutor propio; pruebas sobre `:memory:`.
- Tablas del plan: usuarios, sesiones, `audit_log`, `assignments`, `notifications` (outbox), `scholarship_applications`, `scholarship_awards`, términos del crédito, `calendar_errors`.
- Alternativa rechazada: hidratar por petición (los módulos no exponen API de siembra).
- Almacenamiento de archivos de documentos — pendiente de confirmar (Q3); default: solo metadatos (nombre de archivo), porque los módulos guardan solo el nombre.

## Autenticación y autorización

Decisión D3 — pendiente de confirmar (Q1).

- Tabla de usuarios sembrados, hash con scrypt asíncrono (nunca `scryptSync`), sesiones con cookie HttpOnly + SameSite guardadas en SQLite, rotación de sesión al iniciar sesión, limitación de intentos de login (429), middleware de guardia por rol para los cuatro roles (estudiante, asesor financiero, comité de becas, dirección académica).
- NO es un proveedor de identidad productivo.
- Autorización por caso (NFR-003): el estudiante solo ve sus recursos; el asesor ve solicitudes asignadas; el comité ve casos asignados; dirección académica ve reportes y ningún campo socioeconómico. Asignación en tabla `assignments` — pendiente de confirmar (Q5); default: un asesor reclama una solicitud sin asignar (registrado en `assignments` y `audit_log`) y todo integrante del comité está asignado a todo caso del comité.
- Aprovisionamiento de cuentas reales: el plan no lo resuelve (ver Fuera de alcance).

## Manejo de errores y observabilidad

- Los errores de módulo exponen `.codigo`; la capa web los mapea a estado HTTP sin exponer trazas.
- Hay códigos ambiguos en los módulos (`ESTADO_INVALIDO` cubre "no encontrado" y "estado incorrecto"); el plan lo anota como pendiente de resolver.
- `GET /health`.
- `audit_log` registra actor, rol, acción, objetivo y fecha por decisión (NFR-001); el comité no registra al integrante en el módulo, por eso el registro es de la aplicación.
- `calendar_errors` persiste el log de errores de generación de calendario (hoy en memoria).
- Formato de logs, correlation ids e instrumentación: el plan no los define (SUPUESTO: se deciden en la story 5.1 o se omiten en v1).

## Testing

- `node:test`, pruebas junto al código, TDD con RED primero, `npm test` verde antes de cada commit.
- Repositorios SQLite sobre `:memory:`; pruebas HTTP contra un servidor real en puerto efímero con `fetch` incorporado; pruebas de contrato compartidas entre repositorios en memoria y SQLite.
- Compuerta de regresión: las 94 pruebas existentes más pruebas "mutation persists" por transición (`pendiente_revision`, `aprobada`, `rechazada`, `ejecutado`, `vencido`) más dos pruebas de atomicidad: "el estado persiste cuando el módulo lanza tras mutar" (con un stub de módulo que lanza) y "estado y fila de outbox se confirman juntos o no se confirman".
- Pruebas de visibilidad (NFR-003) en cada slice que expone datos.
- Servidores y temporizadores de prueba con `unref()` o teardown para que `node --test src/` no se cuelgue.
- Presupuesto de PR: ~400 líneas cambiadas (adiciones más eliminaciones, pruebas incluidas); dos candidatas `size:exception` (5.7 y 5.10).

## Seguridad

Cada ítem tiene un dueño y una prueba de aceptación (R3): escape de HTML en plantillas (5.4), CSRF en POST (5.4), flags de cookie (5.4), límite de cuerpo 413 (5.4), timeout de petición (5.4), rotación de sesión (5.3), limitación de login 429 (5.3), scrypt asíncrono (5.3). Sin dependencias externas; secretos: el plan no define manejo de secretos (SUPUESTO: pendiente de decidir en la story 5.3).

## Decisiones cerradas

Formato: decisión — por qué — cuándo se tomaría de nuevo.

- Módulos de negocio como fuente de reglas; la web solo agrega transporte, persistencia, identidad y pantallas — evita reescribir lógica ya probada — si cambian las reglas de negocio del PRD.
- Persistencia con escritura explícita en el caso de uso, no en el módulo — los módulos mutan referencias vivas (R1) — si los módulos se rediseñan para no devolver referencias vivas.
- Notificador colector más outbox en una transacción síncrona — atomicidad sin transacción a través de `await` (R6) — si se pasa a una base con transacciones distribuidas o a una cola externa.
- Disparadores de acciones de sistema (D5): 2.1 al enviar la solicitud de beca; 3.1 cuando el asesor aprueba y entrega monto, cuotas y fecha de primera cuota; 3.3 por temporizador diario en proceso más endpoint manual — si hay despliegue multi-instancia (R5).
- Notificaciones solo dentro de la aplicación, sin correo (D6).
- UX: sin artefactos de UX; páginas mínimas accesibles (D4). Si el producto quiere una UI diseñada, correr primero el paso de UX de BMAD (el plan no bloquea por esto).
- Stack, persistencia y autenticación (D1-D3): pendiente de confirmar (Q1). Ejecutor del desembolso: pendiente de confirmar (Q2); default: asesor financiero. Almacenamiento de bytes de documentos: pendiente de confirmar (Q3). Origen de la solicitud de beca y de `promedioAcumulado`: pendiente de confirmar (Q4). Regla de asignación: pendiente de confirmar (Q5).

## Fuera de alcance

- Pasarela de pagos / integración bancaria, firma electrónica y portal de avalistas (PRD).
- Envío de correo electrónico.
- Proveedor de identidad productivo (SSO/OAuth/LDAP).
- Aplicaciones nativas o móviles.
- Ejecución multi-instancia del planificador (R5): el temporizador diario en proceso no es seguro con varias instancias.
- Express, React y Postgres no se usan por defecto (solo si Q1 los elige).
