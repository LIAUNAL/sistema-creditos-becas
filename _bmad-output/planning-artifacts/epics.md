---
title: "Sistema de Créditos y Becas — Epics y Stories"
status: draft
created: 2026-09-27
updated: 2026-10-01
project: sistema-creditos-becas
prd: prd.md
---

# Epics y Stories — Sistema de Créditos y Becas

> Trazabilidad: cada story cita **FR-XXX** del PRD. Criterios en **Given/When/Then**. Prioridad Must/Should heredada del FR principal.

---

## Epic 1: Solicitud de crédito

**Objetivo:** permitir que un estudiante registre una solicitud de crédito con sus datos socioeconómicos, que el sistema valide los documentos requeridos antes de enviarla a revisión, y que un asesor financiero la apruebe o rechace.

**Incluye:** registro de solicitud, validación documental, cola de revisión del asesor financiero.

**Depende de:** nada (fundación). **Bloquea a:** Epic 3 (desembolso solo aplica a créditos aprobados).

### Story 1.1: Registro de solicitud de crédito con datos socioeconómicos

**Description:** Como estudiante, quiero registrar una solicitud de crédito con mis datos socioeconómicos, para iniciar el proceso de evaluación financiera.

**FRs:** FR-001

**Acceptance Criteria:**

- **Given** un estudiante autenticado sin solicitud activa
  **When** completa el formulario con ingresos del hogar, número de dependientes, estrato y ocupación del acudiente y lo envía
  **Then** el sistema crea la solicitud con estado `borrador`, le asigna un identificador único y la asocia al estudiante.

- **Given** un estudiante que ya tiene una solicitud activa en curso
  **When** intenta crear una segunda solicitud para el mismo periodo académico
  **Then** el sistema rechaza la creación y muestra el estado de la solicitud existente.

- **Given** un formulario con campos socioeconómicos obligatorios vacíos
  **When** el estudiante intenta enviar la solicitud
  **Then** el sistema bloquea el envío y resalta los campos faltantes.

**Notas técnicas:** el estado inicial `borrador` habilita la carga de documentos antes de pasar a `pendiente_validacion`.

---

### Story 1.2: Validación de documentos requeridos antes de enviar a revisión

**Description:** Como estudiante, quiero que el sistema valide mis documentos antes de enviarlos, para no esperar días por un rechazo evitable.

**FRs:** FR-002, FR-004

**Acceptance Criteria:**

- **Given** una solicitud en estado `borrador` con identificación, certificado de ingresos y certificado de matrícula adjuntos
  **When** el estudiante confirma el envío a revisión
  **Then** el sistema cambia el estado a `pendiente_revision` y notifica al estudiante la confirmación de envío.

- **Given** una solicitud en estado `borrador` a la que le falta el certificado de ingresos
  **When** el estudiante intenta confirmar el envío a revisión
  **Then** el sistema rechaza el envío, indica el documento faltante y la solicitud permanece en `borrador`.

- **Given** un documento adjunto en un formato no soportado
  **When** el estudiante lo carga
  **Then** el sistema rechaza el archivo y solicita un formato válido sin descartar los documentos ya cargados.

**Notas técnicas:** la lista de documentos requeridos (identificación, certificado de ingresos, certificado de matrícula) es configurable por tipo de crédito.

---

### Story 1.3: Revisión y decisión del asesor financiero

**Description:** Como asesor financiero, quiero revisar una solicitud completa y aprobarla o rechazarla con un motivo, para decidir el acceso al crédito.

**FRs:** FR-003, FR-004

**Acceptance Criteria:**

- **Given** una solicitud en estado `pendiente_revision` con todos los documentos validados
  **When** el asesor financiero la aprueba
  **Then** el sistema cambia el estado a `aprobada`, registra el asesor y la fecha, y notifica al estudiante.

- **Given** una solicitud en estado `pendiente_revision`
  **When** el asesor financiero la rechaza sin registrar un motivo
  **Then** el sistema bloquea la acción y exige un motivo de rechazo.

- **Given** una solicitud rechazada con motivo registrado
  **When** se consulta su historial
  **Then** el sistema muestra el asesor, la fecha y el motivo del rechazo.

**Notas técnicas:** la aprobación es la precondición para generar el calendario de desembolso (Epic 3).

---

## Epic 2: Evaluación de elegibilidad para becas

**Objetivo:** calcular un puntaje objetivo de elegibilidad de beca a partir de criterios socioeconómicos y académicos, escalar al comité los casos que el sistema no puede autodecidir, y permitir que el estudiante consulte el estado de su evaluación.

**Incluye:** motor de puntaje, cola de revisión del comité de becas, consulta de estado por el estudiante.

**Depende de:** nada (evaluable independiente de la solicitud de crédito). **Bloquea a:** nada.

### Story 2.1: Cálculo de puntaje de elegibilidad de beca

**Description:** Como sistema, quiero calcular un puntaje de elegibilidad de beca combinando criterios socioeconómicos y académicos, para decidir automáticamente los casos claros.

**FRs:** FR-010

**Acceptance Criteria:**

- **Given** un estudiante con promedio acumulado, estrato e ingresos del hogar registrados
  **When** se ejecuta el cálculo de elegibilidad
  **Then** el sistema produce un puntaje numérico y clasifica el caso como `elegible`, `no_elegible` o `limitrofe` según los umbrales configurados.

- **Given** un estudiante sin promedio académico registrado
  **When** se ejecuta el cálculo de elegibilidad
  **Then** el sistema marca el caso como `datos_incompletos` sin producir una decisión automática.

**Notas técnicas:** los umbrales de `elegible`/`limitrofe`/`no_elegible` son configurables por periodo.

---

### Story 2.2: Revisión de casos limítrofes por el comité de becas

**Description:** Como integrante del comité de becas, quiero revisar los casos limítrofes que el sistema no puede autodecidir, para tomar la decisión final con criterio humano.

**FRs:** FR-011

**Acceptance Criteria:**

- **Given** un caso clasificado como `limitrofe` por el motor de puntaje
  **When** se ejecuta el cálculo de elegibilidad
  **Then** el sistema lo agrega a la cola de revisión del comité de becas y notifica al comité.

- **Given** un caso `limitrofe` en la cola del comité
  **When** el comité registra su decisión final (`otorgada` o `denegada`) con un comentario
  **Then** el sistema actualiza el estado del caso y conserva el comentario del comité en el historial.

- **Given** un caso clasificado como `elegible` o `no_elegible` (no limítrofe)
  **When** se ejecuta el cálculo de elegibilidad
  **Then** el sistema no lo agrega a la cola del comité; la decisión queda automática.

**Notas técnicas:** el comité solo ve los casos escalados por umbral, no la totalidad de solicitudes.

---

### Story 2.3: Consulta del estado de evaluación por el estudiante

**Description:** Como estudiante, quiero consultar el estado de mi evaluación de elegibilidad de beca, para saber si necesito aportar más información.

**FRs:** FR-012

**Acceptance Criteria:**

- **Given** un estudiante con una evaluación de beca en curso
  **When** consulta su estado
  **Then** el sistema muestra la clasificación actual (`elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos`).

- **Given** una evaluación marcada como `datos_incompletos`
  **When** el estudiante consulta su estado
  **Then** el sistema indica cuáles datos académicos o socioeconómicos faltan por registrar.

**Notas técnicas:** la consulta es de solo lectura; no expone el puntaje numérico interno al estudiante, solo la clasificación.

---

## Epic 3: Desembolso y seguimiento

**Objetivo:** programar un calendario de desembolso para todo crédito aprobado, notificar al estudiante cuando un desembolso ocurre, y marcar como vencido un desembolso no confirmado tras el plazo definido.

**Incluye:** generación de calendario, notificación de desembolso, vencimiento automático.

**Depende de:** Epic 1 (requiere crédito aprobado). **Bloquea a:** Epic 4 (los reportes de mora leen los desembolsos vencidos).

### Story 3.1: Calendario de desembolso para crédito aprobado

**Description:** Como sistema, quiero generar un calendario de desembolsos cuando un crédito es aprobado, para que el estudiante sepa cuándo y cuánto recibirá.

**FRs:** FR-020

**Acceptance Criteria:**

- **Given** una solicitud de crédito en estado `aprobada` con monto y número de cuotas definidos
  **When** el sistema genera el calendario
  **Then** crea un desembolso programado por cuota, cada uno con fecha y monto, en estado `programado`.

- **Given** un crédito aprobado con monto igual a cero o inválido
  **When** el sistema intenta generar el calendario
  **Then** rechaza la generación y registra el error sin crear desembolsos parciales.

**Notas técnicas:** el calendario se genera una sola vez por crédito aprobado; una reaprobación no debe duplicar desembolsos.

---

### Story 3.2: Notificación de desembolso al estudiante

**Description:** Como estudiante, quiero recibir una notificación cuando ocurre un desembolso de mi crédito, para confirmar que el dinero fue liberado.

**FRs:** FR-021

**Acceptance Criteria:**

- **Given** un desembolso programado cuya fecha se ejecuta
  **When** el sistema procesa la ejecución
  **Then** cambia el estado del desembolso a `ejecutado` y notifica al estudiante con fecha y monto.

- **Given** un desembolso ya marcado como `ejecutado`
  **When** el estudiante consulta su historial de desembolsos
  **Then** el sistema muestra el desembolso con su fecha de ejecución y estado.

**Notas técnicas:** la notificación reutiliza el mismo canal que la Story 1.3 (resultado de revisión).

---

### Story 3.3: Marcado de desembolso vencido

**Description:** Como sistema, quiero marcar como vencido un desembolso que no fue confirmado dentro del plazo definido, para que dirección académica pueda dar seguimiento a la mora.

**FRs:** FR-022

**Acceptance Criteria:**

- **Given** un desembolso en estado `programado` cuya fecha programada más el plazo de confirmación ya pasó sin confirmación
  **When** el sistema ejecuta la revisión periódica de vencimientos
  **Then** cambia el estado del desembolso a `vencido` y lo incluye en el conteo de mora del periodo.

- **Given** un desembolso confirmado dentro del plazo
  **When** el sistema ejecuta la revisión periódica de vencimientos
  **Then** el desembolso permanece en `ejecutado` y no se marca como `vencido`.

**Notas técnicas:** el plazo de confirmación es configurable por tipo de crédito; por defecto se sugieren 15 días.

---

## Epic 4: Reportes para dirección académica

**Objetivo:** exponer un reporte consolidado de créditos y becas otorgados por periodo académico, y alertar cuando la tasa de mora o vencimiento cruza el umbral definido.

**Incluye:** reporte consolidado por periodo, cálculo de tasa de mora, alerta de umbral.

**Depende de:** Epic 1, Epic 2 y Epic 3 (consolida créditos aprobados, becas otorgadas y desembolsos vencidos). **Bloquea a:** nada.

### Story 4.1: Reporte consolidado de créditos y becas por periodo

**Description:** Como integrante de dirección académica, quiero consultar un reporte consolidado de créditos y becas otorgados por periodo, para dar seguimiento al programa.

**FRs:** FR-030

**Acceptance Criteria:**

- **Given** un periodo académico con solicitudes de crédito aprobadas y becas otorgadas
  **When** dirección académica consulta el reporte de ese periodo
  **Then** el sistema muestra el total de créditos aprobados, el total de becas otorgadas y el monto total desembolsado.

- **Given** un periodo académico sin ninguna solicitud registrada
  **When** dirección académica consulta el reporte de ese periodo
  **Then** el sistema muestra el reporte con todos los totales en cero, sin error.

**Notas técnicas:** el reporte se calcula sobre datos consolidados de las Epic 1, 2 y 3; no requiere una tabla de resumen separada para el piloto.

---

### Story 4.2: Alerta de tasa de mora sobre el umbral definido

**Description:** Como integrante de dirección académica, quiero recibir una alerta cuando la tasa de mora de un periodo supera el umbral definido, para intervenir a tiempo.

**FRs:** FR-031

**Acceptance Criteria:**

- **Given** un periodo con una tasa de desembolsos vencidos que supera el umbral configurado
  **When** el sistema recalcula la tasa de mora del periodo
  **Then** genera una alerta indicando el periodo, la tasa calculada y el umbral configurado.

- **Given** un periodo con tasa de mora por debajo del umbral configurado
  **When** el sistema recalcula la tasa de mora del periodo
  **Then** no genera ninguna alerta para ese periodo.

**Notas técnicas:** la tasa de mora se calcula como desembolsos `vencido` sobre el total de desembolsos `programado`+`ejecutado`+`vencido` del periodo.

---

## Epic 5: Aplicación web

**Objetivo:** ofrecer una aplicación web, ejecutable con `npm start`, que permita a los cuatro roles (estudiante, asesor financiero, comité de becas y dirección académica) completar los flujos de los Epics 1-4 con identidad y roles, persistencia, notificaciones dentro de la aplicación, visibilidad restringida de datos socioeconómicos (NFR-003) y trazabilidad de decisiones (NFR-001), sin cambiar las reglas de negocio de los módulos existentes.

**Incluye:** servidor HTTP, base de datos SQLite con migraciones, autenticación y roles, línea base de seguridad web, asignación de casos, notificador colector con bandeja de salida, persistencia de los módulos con escritura explícita, pantallas de los flujos de crédito, beca, desembolso y reportes, bandeja de notificaciones y verificación de punta a punta.

**Depende de:** Epic 1, Epic 2, Epic 3 y Epic 4 (envuelve sus módulos). **Bloquea a:** nada.

### Story 5.1: Fundación del servidor HTTP

**Description:** Como equipo de desarrollo, quiero un servidor HTTP con enrutador, mapeo de errores, endpoint de salud y comando de arranque, para tener la base sobre la que se construyen las pantallas.

**FRs:** FR-052, NFR-006

**Acceptance Criteria:**

- **Given** el proyecto instalado
  **When** se ejecuta `npm start`
  **Then** el servidor escucha y `GET /health` responde 200.

- **Given** un manejador que lanza un error de módulo con `.codigo`
  **When** se atiende la petición
  **Then** el servidor responde con el estado HTTP mapeado a ese código y no expone la traza.

- **Given** una ruta inexistente
  **When** se la solicita
  **Then** el servidor responde 404.

- **Given** la prueba de humo que levanta el servidor en un puerto efímero
  **When** termina la prueba
  **Then** el servidor se cierra en `after` y `node --test src/` no queda colgado.

**Notas técnicas:** plan P1, D1 (solo built-ins de Node, sin dependencias, sin paso de build). `package.json` gana `engines` para `node:sqlite` (R2) y `scripts.start`. Regla de cierre de servidor y puerto efímero (sección 6 del plan). Las 94 pruebas existentes deben seguir verdes.

---

### Story 5.2: Base de datos, migraciones y registro de auditoría

**Description:** Como sistema, quiero una conexión SQLite con ejecutor de migraciones, reloj inyectable y tabla `audit_log`, para persistir datos y registrar autor y fecha de cada decisión.

**FRs:** FR-052, NFR-001, NFR-005

**Acceptance Criteria:**

- **Given** una base de datos nueva
  **When** se ejecuta el ejecutor de migraciones dos veces
  **Then** las tablas existen y la segunda ejecución no cambia el esquema ni falla.

- **Given** un reloj inyectado con una fecha fija
  **When** se escribe una entrada en `audit_log`
  **Then** la entrada guarda actor, rol, acción, objetivo y la fecha ISO del reloj.

- **Given** el servidor reiniciado con el mismo archivo de base de datos
  **When** se leen las entradas de `audit_log`
  **Then** las entradas previas siguen presentes.

**Notas técnicas:** plan P2, D1, D2, sección 4 (`audit_log` satisface NFR-001 porque los módulos no registran al miembro del comité). Pruebas sobre `:memory:`. Fechas normalizadas a ISO en el borde (plan F5).

---

### Story 5.3: Identidad: usuarios, sesiones y guardia de roles

**Description:** Como usuario del sistema, quiero iniciar y cerrar sesión con mi rol, para acceder solo a lo que me corresponde.

**FRs:** FR-040, NFR-004

**Acceptance Criteria:**

- **Given** un usuario sembrado con contraseña hasheada
  **When** envía credenciales correctas
  **Then** el sistema crea una sesión en SQLite y el identificador de sesión es distinto del anterior al login (rotación).

- **Given** credenciales incorrectas repetidas más allá del límite
  **When** envía otro intento
  **Then** el sistema responde 429.

- **Given** un usuario con rol `estudiante`
  **When** solicita una ruta restringida al rol `asesor_financiero`
  **Then** el sistema responde 403.

- **Given** un usuario sin sesión
  **When** solicita una ruta protegida
  **Then** el sistema responde 401 o redirige al login.

- **Given** una sesión activa
  **When** el usuario cierra sesión
  **Then** la sesión se elimina y el mismo identificador deja de ser válido.

**Notas técnicas:** plan P3, D3 (usuarios sembrados, scrypt, cookies HttpOnly + SameSite con sesión en SQLite; no es un proveedor de identidad productivo), R3. La prueba de scrypt verifica el uso de la variante asíncrona (callback o promesa), no `scryptSync`. Aprovisionamiento de cuentas reales no está resuelto por el plan (ver gaps del proposal).

---

### Story 5.4: Línea base de seguridad web

**Description:** Como equipo de desarrollo, quiero un conjunto de protecciones web básicas, para que ninguna pantalla posterior nazca vulnerable.

**FRs:** NFR-004

**Acceptance Criteria:**

- **Given** una plantilla que renderiza un valor de usuario con `<script>`
  **When** se genera el HTML
  **Then** el script aparece escapado y no como etiqueta ejecutable.

- **Given** una petición POST sin token CSRF válido
  **When** llega al servidor
  **Then** el servidor la rechaza con 403.

- **Given** una respuesta que establece la cookie de sesión
  **When** se inspecciona `Set-Cookie`
  **Then** incluye HttpOnly y SameSite (y Secure cuando aplica).

- **Given** un cuerpo de petición mayor al límite configurado
  **When** llega al servidor
  **Then** el servidor responde 413.

- **Given** una petición que se detiene sin completar el cuerpo
  **When** vence el tiempo límite
  **Then** el servidor cierra la conexión.

**Notas técnicas:** plan P4, R3 (cada ítem tiene su prueba de aceptación). Depende de 5.3 por la cookie de sesión.

---

### Story 5.5: Visibilidad y asignación de casos

**Description:** Como sistema, quiero una tabla de asignaciones y funciones de política por rol, para que los datos socioeconómicos solo los vean los asignados al caso.

**FRs:** FR-041, NFR-003

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** la política evalúa el acceso a un recurso de otro estudiante
  **Then** deniega el acceso.

- **Given** un asesor financiero asignado a una solicitud
  **When** la política evalúa el acceso a esa solicitud
  **Then** lo permite; para una solicitud no asignada a él, lo deniega.

- **Given** un integrante del comité asignado a un caso
  **When** la política evalúa el acceso a ese caso
  **Then** lo permite; sin asignación, lo deniega.

- **Given** un integrante de dirección académica
  **When** la política proyecta una solicitud
  **Then** el resultado no incluye campos socioeconómicos.

**Notas técnicas:** plan P5, R4, Q5. Regla de asignación por defecto, pendiente de confirmar (Q5): un asesor reclama una solicitud sin asignar (registrado en `assignments` y `audit_log`); todo integrante del comité queda asignado a todo caso del comité. Debe quedar terminada antes del primer slice que expone datos (5.8).

---

### Story 5.6: Notificador colector y bandeja de salida (outbox)

**Description:** Como sistema, quiero un notificador por caso de uso que registre los avisos en memoria y una transacción única que guarde estado y avisos, para que nunca exista un aviso sin su estado ni al revés.

**FRs:** FR-050, NFR-005

**Acceptance Criteria:**

- **Given** un notificador colector
  **When** un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLimitrofe` y `notificarDesembolso`
  **Then** cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos.

- **Given** un módulo stub que muta el estado y luego lanza una excepción
  **When** el caso de uso lo invoca con el ayudante transaccional
  **Then** el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga.

- **Given** una transacción síncrona que guarda estado y filas del outbox
  **When** una de las dos escrituras falla
  **Then** ninguna de las dos queda confirmada (todo o nada).

- **Given** filas de outbox confirmadas
  **When** corre el paso de entrega posterior al commit
  **Then** las filas pasan a la tabla `notifications` y la entrega no revierte el estado.

- **Given** el contrato del puerto de notificación
  **When** corre la prueba de contrato
  **Then** el colector implementa los cuatro métodos con la firma que cada módulo espera.

**Notas técnicas:** plan P6, D2, D6, R6. Prueba genérica "el estado persiste cuando el módulo lanza tras mutar" con un STUB de módulo que lanza (el colector nunca lanza). Residual de Judgment Day #2: esta story DEBE definir cómo llega el colector a los módulos (los módulos reciben el notificador una vez en el constructor), por ejemplo construyendo el módulo por llamada o pasando/reiniciando el colector por llamada; el plan no lo decide. Ninguna transacción abarca un `await`.

---

### Story 5.7: Persistencia de los módulos de solicitud de crédito

**Description:** Como sistema, quiero repositorios SQLite para registro, envío y decisión de solicitudes con escritura explícita, para que las transiciones de estado sobrevivan al reinicio.

**FRs:** FR-052, NFR-005, NFR-006

**Acceptance Criteria:**

- **Given** los repositorios en memoria y SQLite
  **When** corre la misma suite de contrato
  **Then** ambas implementaciones se comportan igual (guardar, obtener, listar por estudiante y por estado).

- **Given** una solicitud que pasa a `pendiente_revision`, `aprobada` o `rechazada` mediante el caso de uso
  **When** se recarga desde SQLite
  **Then** se observa el mismo estado en cada una de las tres transiciones.

- **Given** la confirmación de envío o la decisión del asesor con el notificador colector
  **When** el caso de uso termina
  **Then** estado y filas de outbox se confirman juntos o no se confirman.

- **Given** el conjunto de pruebas existente
  **When** corre `npm test`
  **Then** las 94 pruebas previas siguen verdes con los puertos aditivos (no-op en memoria por defecto).

**Notas técnicas:** plan P7, D2 (el caso de uso, no el módulo, posee el paso de persistencia en `try/finally`; los módulos devuelven referencias vivas, plan F2), R1. Candidata `size:exception`: pronóstico ~440 líneas (por encima del presupuesto de ~400; el plan hizo una pasada de partición honesta y no se divide más sin romper cohesión). Residual #4: `confirmarEnvio` y `_decidir` llaman al notificador de forma síncrona (solo `ejecutar` y `procesarResultado` hacen `await`).

---

### Story 5.8: Flujo del estudiante: solicitud de crédito

**Description:** Como estudiante, quiero crear mi solicitud de crédito, adjuntar documentos y enviarla a revisión desde el navegador, para iniciar el proceso de evaluación financiera.

**FRs:** FR-042, FR-001, FR-002

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** completa y envía el formulario de solicitud
  **Then** se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista.

- **Given** una solicitud `borrador` con los tres documentos adjuntos (metadatos)
  **When** el estudiante confirma el envío
  **Then** el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox.

- **Given** una solicitud `borrador` sin certificado de ingresos
  **When** el estudiante confirma el envío
  **Then** el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`.

- **Given** dos estudiantes con solicitudes distintas
  **When** el primero solicita la solicitud del segundo por URL
  **Then** el sistema responde 403 o 404 (visibilidad NFR-003).

**Notas técnicas:** plan P8, D2, D4 (páginas mínimas accesibles renderizadas en servidor), F8. Los documentos se guardan solo como metadatos (nombre de archivo): pendiente de confirmar (Q3) si se guardan los bytes en disco. El id del estudiante se mapea al campo de cada módulo (`estudianteId`, `idEstudiante`, `estudiante`) en `src/app/`.

---

### Story 5.9: Flujo del asesor financiero: cola y decisión

**Description:** Como asesor financiero, quiero ver mi cola de solicitudes y aprobarlas o rechazarlas con un motivo desde el navegador, para decidir el acceso al crédito.

**FRs:** FR-043, FR-041, FR-003, FR-004

**Acceptance Criteria:**

- **Given** solicitudes `pendiente_revision` sin asignar
  **When** un asesor reclama una
  **Then** queda asignada a él y se registra la asignación en `assignments` y `audit_log`.

- **Given** una solicitud asignada al asesor
  **When** la rechaza sin motivo
  **Then** el sistema bloquea la acción y exige el motivo.

- **Given** una solicitud asignada al asesor
  **When** la rechaza con motivo
  **Then** el estado pasa a `rechazada` y `audit_log` registra asesor, rol, acción y fecha.

- **Given** una solicitud asignada a otro asesor
  **When** este asesor intenta decidirla
  **Then** el sistema responde 403.

- **Given** un usuario de dirección académica
  **When** abre una solicitud
  **Then** no ve campos socioeconómicos.

**Notas técnicas:** plan P9, R4, Q5 (regla de asignación pendiente de confirmar). Reutiliza el colector y la persistencia con `try/finally` de 5.6 y 5.7. R7: una respuesta distinta a Q5 puede invalidar esta story.

---

### Story 5.10: Condiciones del crédito y calendario de desembolso

**Description:** Como asesor financiero, quiero registrar monto, cuotas y fecha de la primera cuota al aprobar un crédito, para que el sistema genere el calendario de desembolsos.

**FRs:** FR-044, FR-020

**Acceptance Criteria:**

- **Given** una solicitud `pendiente_revision` asignada al asesor
  **When** la aprueba con monto, número de cuotas y fecha de primera cuota válidos
  **Then** se guardan los términos y se genera un desembolso `programado` por cuota con `periodoAcademico` y `tipoCredito` copiados.

- **Given** una aprobación con monto cero o inválido
  **When** se intenta generar el calendario
  **Then** se rechaza, se registra el error en `calendar_errors` y no se crean desembolsos parciales.

- **Given** un crédito aprobado con calendario ya generado
  **When** se repite la aprobación
  **Then** no se duplican desembolsos.

- **Given** el calendario generado
  **When** se recarga desde SQLite
  **Then** los desembolsos conservan fecha, monto, periodo y tipo de crédito.

**Notas técnicas:** plan P10, D5 (3.1 se dispara al aprobar el asesor), F4. Plan sin resolver: la aprobación se confirma antes de validar los términos del crédito (nota de un solo juez); la story debe decidir el orden o declarar el supuesto. Candidata `size:exception`: ~420 líneas. Si este caso de uso notifica, debe llevar el notificador colector y la persistencia en `try/finally` (residual #3).

---

### Story 5.11: Becas, backend 1: solicitud y elegibilidad automática

**Description:** Como estudiante, quiero registrar una solicitud de beca y que el sistema calcule mi elegibilidad, para saber si accedo a la beca.

**FRs:** FR-045, FR-010

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** envía una solicitud de beca con datos académicos y socioeconómicos, incluido `promedioAcumulado`
  **Then** se guarda en `scholarship_applications` y se ejecuta el cálculo de elegibilidad.

- **Given** un resultado `elegible`
  **When** termina el cálculo
  **Then** se registra una fila en `scholarship_awards` con el periodo de la solicitud.

- **Given** una solicitud sin `promedioAcumulado`
  **When** se ejecuta el cálculo
  **Then** el caso queda `datos_incompletos` y no se genera decisión automática.

- **Given** dos estudiantes
  **When** uno consulta la solicitud de beca del otro
  **Then** el sistema responde 403 o 404.

**Notas técnicas:** plan P11, D5, F4, Q4 (cómo se inicia la solicitud de beca y quién ingresa `promedioAcumulado`: el plan no define el origen; esta story asume, SUPUESTO, que el estudiante lo ingresa; pendiente de confirmar (Q4)). La proyección `scholarship_awards` registra TAMBIÉN las `elegible` automáticas para que el reporte 4.1 las cuente (epics.md, Story 2.2 / reporte). Si notifica, lleva el tratamiento del colector (residual #3). El plan no define el flujo de reejecución para datos incompletos ni dónde se guarda la configuración de umbrales (notas de un solo juez).

---

### Story 5.12: Becas, backend 2: comité y otorgamiento

**Description:** Como integrante del comité de becas, quiero ver mis casos limítrofes y registrar la decisión con comentario, para decidir con criterio humano.

**FRs:** FR-046, FR-041, FR-011

**Acceptance Criteria:**

- **Given** un caso clasificado `limitrofe`
  **When** se ejecuta la evaluación
  **Then** aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox.

- **Given** un caso en la cola
  **When** un integrante registra `otorgada` o `denegada` con comentario
  **Then** se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud.

- **Given** un usuario del comité no asignado al caso
  **When** intenta abrirlo
  **Then** el sistema responde 403.

- **Given** una decisión registrada
  **When** se recarga desde SQLite
  **Then** el estado y el comentario persisten.

**Notas técnicas:** plan P12, R4, Q5 (por defecto, todo integrante del comité está asignado a todo caso; pendiente de confirmar). `registrarDecision` no recibe id de integrante, por eso el autor se registra en `audit_log` (NFR-001). El módulo guarda `estudiante: caso.estudiante` sin validar, con otro nombre de campo y sin periodo (plan F4): el puente en `src/app/` lo normaliza. Residual #3: esta story DEBE llevar el tratamiento de notificador colector y persistencia en `try/finally` con estado y outbox en una transacción (`revisionComite` espera al notificador). El módulo devuelve copias (plan F2). Sin trigger de sistema definido para escalamientos: el actor de `audit_log` para escalamientos del sistema no está resuelto en el plan.

---

### Story 5.13: Interfaz de becas y estado del estudiante

**Description:** Como estudiante, quiero ver el estado de mi evaluación de beca en pantalla, para saber si necesito aportar más información.

**FRs:** FR-047, FR-012

**Acceptance Criteria:**

- **Given** una evaluación en curso
  **When** el estudiante abre su página de estado
  **Then** ve `elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos` y no el puntaje numérico.

- **Given** una evaluación `datos_incompletos`
  **When** el estudiante abre su estado
  **Then** la página indica qué datos faltan.

- **Given** un integrante del comité
  **When** abre la pantalla de la cola
  **Then** ve solo los casos asignados.

- **Given** un estudiante sin solicitud de beca
  **When** abre la página de estado
  **Then** ve un mensaje de que no hay evaluación, sin error.

**Notas técnicas:** plan P13, D4, R3 (escape de HTML en toda plantilla). La consulta es de solo lectura (Story 2.3).

---

### Story 5.14: Ejecución de desembolso

**Description:** Como asesor financiero, quiero ejecutar un desembolso programado y que el estudiante sea notificado, para confirmar que el dinero fue liberado.

**FRs:** FR-048, FR-021

**Acceptance Criteria:**

- **Given** un desembolso `programado`
  **When** el actor autorizado lo ejecuta
  **Then** el estado pasa a `ejecutado`, se recarga igual desde SQLite y se guarda un aviso en el outbox.

- **Given** un módulo de ejecución que muta el estado y luego lanza una excepción (STUB que lanza)
  **When** el caso de uso termina
  **Then** el estado `ejecutado` queda persistido.

- **Given** la ejecución con el notificador colector
  **When** una de las escrituras de estado u outbox falla
  **Then** ninguna se confirma (todo o nada).

- **Given** un estudiante
  **When** intenta ejecutar un desembolso
  **Then** el sistema responde 403; y un estudiante solo ve sus propios desembolsos.

**Notas técnicas:** plan P14, D2, D6, R6, Q2 (actor de ejecución, por defecto el asesor financiero; pendiente de confirmar (Q2)). Residual #1: el plan dice "notificador que lanza", pero el colector nunca lanza; la excepción DEBE provenir de un STUB de módulo que lanza, como en 5.6. `ejecutar` es sin estado y establece el estado antes de `await` al notificador (`src/desembolso/ejecucionDesembolso.js`, línea del plan 61-72); la persistencia en `try/finally` más el colector lo hace seguro. El archivo real es `ejecucionDesembolso.js` (no `ejecutarDesembolso.js`).

---

### Story 5.15: Revisión de vencidos

**Description:** Como sistema, quiero marcar como vencidos los desembolsos no confirmados mediante un temporizador diario y un endpoint manual, para dar seguimiento a la mora.

**FRs:** FR-049, FR-022

**Acceptance Criteria:**

- **Given** un desembolso `programado` cuya fecha más el plazo ya pasó
  **When** corre la revisión
  **Then** pasa a `vencido` y el estado persiste al recargar desde SQLite.

- **Given** un desembolso confirmado dentro del plazo
  **When** corre la revisión
  **Then** permanece `ejecutado`.

- **Given** una revisión que genera avisos
  **When** el caso de uso termina
  **Then** estado y filas de outbox se confirman juntos o no se confirman.

- **Given** un usuario de dirección académica o asesor
  **When** invoca el endpoint manual
  **Then** corre la revisión y un estudiante recibe 403.

- **Given** el servidor detenido en una prueba
  **When** termina el proceso de pruebas
  **Then** el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado).

**Notas técnicas:** plan P15, D5 (temporizador en proceso más endpoint manual), R5 (no es seguro con múltiples instancias y depende de que el servidor esté en marcha). El caso de uso persiste en `try/finally` después de `revisar` (módulo sin estado que muta los desembolsos recibidos). Residual #3: si `revisar` notifica, lleva el tratamiento del colector. El plazo de confirmación es configurable por tipo de crédito (Story 3.3).

---

### Story 5.16: Bandeja de notificaciones

**Description:** Como usuario, quiero ver mis notificaciones dentro de la aplicación, para enterarme de decisiones y desembolsos sin correo.

**FRs:** FR-050

**Acceptance Criteria:**

- **Given** notificaciones entregadas para varios usuarios
  **When** un usuario abre su bandeja
  **Then** ve solo las propias.

- **Given** una notificación no leída
  **When** el usuario la marca como leída
  **Then** queda marcada y no cambia el estado de negocio asociado.

- **Given** un usuario sin notificaciones
  **When** abre la bandeja
  **Then** ve una lista vacía sin error.

**Notas técnicas:** plan P16, D6 (sin correo; entrega y marcado de leída son un paso posterior al commit). Ver la prueba de visibilidad NFR-003.

---

### Story 5.17: Reportes y umbral de mora

**Description:** Como integrante de dirección académica, quiero ver el reporte consolidado y la alerta de mora por periodo con un umbral configurable, para dar seguimiento al programa.

**FRs:** FR-051, FR-030, FR-031

**Acceptance Criteria:**

- **Given** un periodo con créditos aprobados, becas `elegible` automáticas y `otorgada` por el comité
  **When** dirección académica abre el reporte
  **Then** el total de becas cuenta ambos orígenes leyendo `scholarship_awards`.

- **Given** un periodo sin registros
  **When** se abre el reporte
  **Then** muestra todos los totales en cero, sin error.

- **Given** un umbral configurado por periodo y una tasa de mora superior
  **When** se recalcula la tasa
  **Then** se muestra la alerta con periodo, tasa y umbral.

- **Given** una tasa por debajo del umbral
  **When** se recalcula
  **Then** no se muestra alerta.

- **Given** un usuario que no es de dirección académica
  **When** solicita el reporte
  **Then** el sistema responde 403.

**Notas técnicas:** plan P17, sección 4 (el reporte lee la proyección `scholarship_awards`, de modo que las otorgadas automáticas se cuentan, consistente con la Story 4.1). Los desembolsos deben tener `periodoAcademico` (copiado en 5.10). Umbral por periodo: el plan no dice dónde se guarda (nota abierta).

---

### Story 5.18: Endurecimiento y verificación de punta a punta

**Description:** Como equipo de desarrollo, quiero pruebas de rendimiento, barrido de visibilidad entre roles y una prueba de punta a punta, para cerrar el epic con evidencia.

**FRs:** NFR-002, NFR-003, FR-052

**Acceptance Criteria:**

- **Given** 10.000 registros en el periodo
  **When** se genera el reporte consolidado
  **Then** tarda menos de 5 s.

- **Given** los cuatro roles y datos de varios estudiantes
  **When** corre el barrido de visibilidad
  **Then** ningún rol accede a recursos que no le corresponden.

- **Given** una base limpia
  **When** corre la prueba de humo de punta a punta
  **Then** un crédito pasa de solicitud a desembolso `ejecutado`.

- **Given** el README
  **When** un desarrollador sigue la guía de ejecución
  **Then** logra iniciar la aplicación con `npm start`.

**Notas técnicas:** plan P18, sección 10 ("Done when"). Diseño de la prueba de rendimiento NFR-002: el plan lo registra como nota sin resolver; la story debe definirlo (supuesto: base `:memory:` sembrada con 10.000 registros). Cierra la compuerta: 94 pruebas más las de transición y atomicidad verdes.

---

## Dependencias entre stories

```
1.1 ─→ 1.2 ─→ 1.3 ─┬─→ 3.1 ─→ 3.2 ─→ 3.3 ─┬─→ 4.1 ─→ 4.2
                    │                       │
2.1 ─→ 2.2 ─→ 2.3 ──┴───────────────────────┘

4.2 ─→ 5.1 ─→ 5.2 ─→ 5.3 ─→ 5.4 ─→ 5.5 ─→ 5.6 ─→ 5.7 ─→ 5.8 ─→ 5.9 ─→ 5.10
5.10 ─→ 5.11 ─→ 5.12 ─→ 5.13 ─→ 5.14 ─→ 5.15 ─→ 5.16 ─→ 5.17 ─→ 5.18
```

- **Epic 1** es fundación: la aprobación (Story 1.3) habilita el calendario de desembolso.
- **Epic 2** es independiente de Epic 1 (la elegibilidad de beca no requiere una solicitud de crédito aprobada).
- **Epic 3** depende de Epic 1 (solo hay calendario de desembolso para crédito aprobado).
- **Epic 4** depende de Epic 1, 2 y 3 (consolida créditos, becas y desembolsos vencidos por periodo).
- **Epic 5** depende de Epic 1, 2, 3 y 4 (envuelve sus módulos en una aplicación web); sus stories forman una cadena apilada 5.1 a 5.18, con 5.6 antes de toda story que notifica y 5.5 antes de la primera que expone datos (5.8).

## Traza FR → Story

| FR | Story |
|----|-------|
| FR-001 | 1.1 |
| FR-002,004 | 1.2 |
| FR-003,004 | 1.3 |
| FR-010 | 2.1 |
| FR-011 | 2.2 |
| FR-012 | 2.3 |
| FR-020 | 3.1 |
| FR-021 | 3.2 |
| FR-022 | 3.3 |
| FR-030 | 4.1 |
| FR-031 | 4.2 |
| FR-040 | 5.3 |
| FR-041 | 5.5, 5.9, 5.12 |
| FR-042 | 5.8 |
| FR-043 | 5.9 |
| FR-044 | 5.10 |
| FR-045 | 5.11 |
| FR-046 | 5.12 |
| FR-047 | 5.13 |
| FR-048 | 5.14 |
| FR-049 | 5.15 |
| FR-050 | 5.6, 5.16 |
| FR-051 | 5.17 |
| FR-052 | 5.1, 5.2, 5.7 |

## Criterios de listo (DoD) por story

- Criterios Given/When/Then verificados con datos de prueba representativos.
- Estado de la entidad (solicitud, evaluación, desembolso) documentado y sin transiciones ambiguas.
- Notificación al estudiante probada donde aplique (FR-004, FR-021).
- Reporte y alerta de mora validados contra al menos un periodo con datos y uno vacío.
- Para el Epic 5: `npm test` verde (las 94 pruebas previas más las nuevas), prueba de visibilidad (NFR-003) en cada story que expone datos, y PR de aproximadamente 400 líneas cambiadas o menos.

---

*Epics derivados del PRD `prd.md` — 5 epics, 29 stories.*
