# aplicacion-web Specification

## Purpose
**Objetivo:** ofrecer una aplicación web, ejecutable con `npm start`, que permita a los cuatro roles (estudiante, asesor financiero, comité de becas y dirección académica) completar los flujos de los Epics 1-4 con identidad y roles, persistencia, notificaciones dentro de la aplicación, visibilidad restringida de datos socioeconómicos (NFR-003) y trazabilidad de decisiones (NFR-001), sin cambiar las reglas de negocio de los módulos existentes. **Incluye:** servidor HTTP, base de datos SQLite con migraciones, autenticación y roles, línea base de seguridad web, asignación de casos, notificador colector con bandeja de salida, persistencia de los módulos con escritura explícita, pantallas de los flujos de crédito, beca, desembolso y reportes, bandeja de notificaciones y verificación de punta a punta. **Depende de:** Epic 1, Epic 2, Epic 3 y Epic 4 (envuelve sus módulos). **Bloquea a:** nada.

## Requirements

### Requirement: Fundación del servidor HTTP
The system SHALL support fundación del servidor HTTP.

#### Scenario: Se ejecuta `npm start`
- **GIVEN** el proyecto instalado
- **WHEN** se ejecuta `npm start`
- **THEN** el servidor escucha y `GET /health` responde 200

#### Scenario: Se atiende la petición
- **GIVEN** un manejador que lanza un error de módulo con `.codigo`
- **WHEN** se atiende la petición
- **THEN** el servidor responde con el estado HTTP mapeado a ese código y no expone la traza

#### Scenario: Se la solicita
- **GIVEN** una ruta inexistente
- **WHEN** se la solicita
- **THEN** el servidor responde 404

#### Scenario: Termina la prueba
- **GIVEN** la prueba de humo que levanta el servidor en un puerto efímero
- **WHEN** termina la prueba
- **THEN** el servidor se cierra en `after` y `node --test src/` no queda colgado

### Requirement: Base de datos, migraciones y registro de auditoría
The system SHALL support base de datos, migraciones y registro de auditoría.

#### Scenario: Se ejecuta el ejecutor de migraciones dos veces
- **GIVEN** una base de datos nueva
- **WHEN** se ejecuta el ejecutor de migraciones dos veces
- **THEN** las tablas existen y la segunda ejecución no cambia el esquema ni falla

#### Scenario: Se escribe una entrada en `audit_log`
- **GIVEN** un reloj inyectado con una fecha fija
- **WHEN** se escribe una entrada en `audit_log`
- **THEN** la entrada guarda actor, rol, acción, objetivo y la fecha ISO del reloj

#### Scenario: Se leen las entradas de `audit_log`
- **GIVEN** el servidor reiniciado con el mismo archivo de base de datos
- **WHEN** se leen las entradas de `audit_log`
- **THEN** las entradas previas siguen presentes

### Requirement: Identidad: usuarios, sesiones y guardia de roles
The system SHALL support identidad: usuarios, sesiones y guardia de roles.

#### Scenario: Envía credenciales correctas
- **GIVEN** un usuario sembrado con contraseña hasheada
- **WHEN** envía credenciales correctas
- **THEN** el sistema crea una sesión en SQLite y el identificador de sesión es distinto del anterior al login (rotación)

#### Scenario: Envía otro intento
- **GIVEN** credenciales incorrectas repetidas más allá del límite
- **WHEN** envía otro intento
- **THEN** el sistema responde 429

#### Scenario: Solicita una ruta restringida al rol `asesor_financiero`
- **GIVEN** un usuario con rol `estudiante`
- **WHEN** solicita una ruta restringida al rol `asesor_financiero`
- **THEN** el sistema responde 403

#### Scenario: Solicita una ruta protegida
- **GIVEN** un usuario sin sesión
- **WHEN** solicita una ruta protegida
- **THEN** el sistema responde 401 o redirige al login

#### Scenario: El usuario cierra sesión
- **GIVEN** una sesión activa
- **WHEN** el usuario cierra sesión
- **THEN** la sesión se elimina y el mismo identificador deja de ser válido

### Requirement: Línea base de seguridad web
The system SHALL support línea base de seguridad web.

#### Scenario: Se genera el HTML
- **GIVEN** una plantilla que renderiza un valor de usuario con `<script>`
- **WHEN** se genera el HTML
- **THEN** el script aparece escapado y no como etiqueta ejecutable

#### Scenario: Llega al servidor
- **GIVEN** una petición POST sin token CSRF válido
- **WHEN** llega al servidor
- **THEN** el servidor la rechaza con 403

#### Scenario: Se inspecciona `Set-Cookie`
- **GIVEN** una respuesta que establece la cookie de sesión
- **WHEN** se inspecciona `Set-Cookie`
- **THEN** incluye HttpOnly y SameSite (y Secure cuando aplica)

#### Scenario: Llega al servidor (4)
- **GIVEN** un cuerpo de petición mayor al límite configurado
- **WHEN** llega al servidor
- **THEN** el servidor responde 413

#### Scenario: Vence el tiempo límite
- **GIVEN** una petición que se detiene sin completar el cuerpo
- **WHEN** vence el tiempo límite
- **THEN** el servidor cierra la conexión

### Requirement: Visibilidad y asignación de casos
The system SHALL support visibilidad y asignación de casos.

#### Scenario: La política evalúa el acceso a un recurso de otro estudiante
- **GIVEN** un estudiante autenticado
- **WHEN** la política evalúa el acceso a un recurso de otro estudiante
- **THEN** deniega el acceso

#### Scenario: La política evalúa el acceso a esa solicitud
- **GIVEN** un asesor financiero asignado a una solicitud
- **WHEN** la política evalúa el acceso a esa solicitud
- **THEN** lo permite; para una solicitud no asignada a él, lo deniega

#### Scenario: La política evalúa el acceso a ese caso
- **GIVEN** un integrante del comité asignado a un caso
- **WHEN** la política evalúa el acceso a ese caso
- **THEN** lo permite; sin asignación, lo deniega

#### Scenario: La política proyecta una solicitud
- **GIVEN** un integrante de dirección académica
- **WHEN** la política proyecta una solicitud
- **THEN** el resultado no incluye campos socioeconómicos

### Requirement: Notificador colector y bandeja de salida (outbox)
The system SHALL support notificador colector y bandeja de salida (outbox).

#### Scenario: Un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLi
- **GIVEN** un notificador colector
- **WHEN** un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLimitrofe` y `notificarDesembolso`
- **THEN** cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos

#### Scenario: El caso de uso lo invoca con el ayudante transaccional
- **GIVEN** un módulo stub que muta el estado y luego lanza una excepción
- **WHEN** el caso de uso lo invoca con el ayudante transaccional
- **THEN** el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga

#### Scenario: Una de las dos escrituras falla
- **GIVEN** una transacción síncrona que guarda estado y filas del outbox
- **WHEN** una de las dos escrituras falla
- **THEN** ninguna de las dos queda confirmada (todo o nada)

#### Scenario: Corre el paso de entrega posterior al commit
- **GIVEN** filas de outbox confirmadas
- **WHEN** corre el paso de entrega posterior al commit
- **THEN** las filas pasan a la tabla `notifications` y la entrega no revierte el estado

#### Scenario: Corre la prueba de contrato
- **GIVEN** el contrato del puerto de notificación
- **WHEN** corre la prueba de contrato
- **THEN** el colector implementa los cuatro métodos con la firma que cada módulo espera

### Requirement: Persistencia de los módulos de solicitud de crédito
The system SHALL support persistencia de los módulos de solicitud de crédito.

#### Scenario: Corre la misma suite de contrato
- **GIVEN** los repositorios en memoria y SQLite
- **WHEN** corre la misma suite de contrato
- **THEN** ambas implementaciones se comportan igual (guardar, obtener, listar por estudiante y por estado)

#### Scenario: Se recarga desde SQLite
- **GIVEN** una solicitud que pasa a `pendiente_revision`, `aprobada` o `rechazada` mediante el caso de uso
- **WHEN** se recarga desde SQLite
- **THEN** se observa el mismo estado en cada una de las tres transiciones

#### Scenario: El caso de uso termina
- **GIVEN** la confirmación de envío o la decisión del asesor con el notificador colector
- **WHEN** el caso de uso termina
- **THEN** estado y filas de outbox se confirman juntos o no se confirman

#### Scenario: Corre `npm test`
- **GIVEN** el conjunto de pruebas existente
- **WHEN** corre `npm test`
- **THEN** las 94 pruebas previas siguen verdes con los puertos aditivos (no-op en memoria por defecto)

### Requirement: Flujo del estudiante: solicitud de crédito
The system SHALL support flujo del estudiante: solicitud de crédito.

#### Scenario: Completa y envía el formulario de solicitud
- **GIVEN** un estudiante autenticado
- **WHEN** completa y envía el formulario de solicitud
- **THEN** se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista

#### Scenario: El estudiante confirma el envío
- **GIVEN** una solicitud `borrador` con los tres documentos adjuntos (metadatos)
- **WHEN** el estudiante confirma el envío
- **THEN** el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox

#### Scenario: El estudiante confirma el envío (3)
- **GIVEN** una solicitud `borrador` sin certificado de ingresos
- **WHEN** el estudiante confirma el envío
- **THEN** el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`

#### Scenario: El primero solicita la solicitud del segundo por URL
- **GIVEN** dos estudiantes con solicitudes distintas
- **WHEN** el primero solicita la solicitud del segundo por URL
- **THEN** el sistema responde 403 o 404 (visibilidad NFR-003)

### Requirement: Flujo del asesor financiero: cola y decisión
The system SHALL support flujo del asesor financiero: cola y decisión.

#### Scenario: Un asesor reclama una
- **GIVEN** solicitudes `pendiente_revision` sin asignar
- **WHEN** un asesor reclama una
- **THEN** queda asignada a él y se registra la asignación en `assignments` y `audit_log`

#### Scenario: La rechaza sin motivo
- **GIVEN** una solicitud asignada al asesor
- **WHEN** la rechaza sin motivo
- **THEN** el sistema bloquea la acción y exige el motivo

#### Scenario: La rechaza con motivo
- **GIVEN** una solicitud asignada al asesor
- **WHEN** la rechaza con motivo
- **THEN** el estado pasa a `rechazada` y `audit_log` registra asesor, rol, acción y fecha

#### Scenario: Este asesor intenta decidirla
- **GIVEN** una solicitud asignada a otro asesor
- **WHEN** este asesor intenta decidirla
- **THEN** el sistema responde 403

#### Scenario: Abre una solicitud
- **GIVEN** un usuario de dirección académica
- **WHEN** abre una solicitud
- **THEN** no ve campos socioeconómicos

### Requirement: Condiciones del crédito y calendario de desembolso
The system SHALL support condiciones del crédito y calendario de desembolso.

#### Scenario: La aprueba con monto, número de cuotas y fecha de primera cuota válidos
- **GIVEN** una solicitud `pendiente_revision` asignada al asesor
- **WHEN** la aprueba con monto, número de cuotas y fecha de primera cuota válidos
- **THEN** se guardan los términos y se genera un desembolso `programado` por cuota con `periodoAcademico` y `tipoCredito` copiados

#### Scenario: Se intenta generar el calendario
- **GIVEN** una aprobación con monto cero o inválido
- **WHEN** se intenta generar el calendario
- **THEN** se rechaza, se registra el error en `calendar_errors` y no se crean desembolsos parciales

#### Scenario: Se repite la aprobación
- **GIVEN** un crédito aprobado con calendario ya generado
- **WHEN** se repite la aprobación
- **THEN** no se duplican desembolsos

#### Scenario: Se recarga desde SQLite
- **GIVEN** el calendario generado
- **WHEN** se recarga desde SQLite
- **THEN** los desembolsos conservan fecha, monto, periodo y tipo de crédito

### Requirement: Becas, backend 1: solicitud y elegibilidad automática
The system SHALL support becas, backend 1: solicitud y elegibilidad automática.

#### Scenario: Envía una solicitud de beca con datos académicos y socioeconómicos, incl
- **GIVEN** un estudiante autenticado
- **WHEN** envía una solicitud de beca con datos académicos y socioeconómicos, incluido `promedioAcumulado`
- **THEN** se guarda en `scholarship_applications` y se ejecuta el cálculo de elegibilidad

#### Scenario: Termina el cálculo
- **GIVEN** un resultado `elegible`
- **WHEN** termina el cálculo
- **THEN** se registra una fila en `scholarship_awards` con el periodo de la solicitud

#### Scenario: Se ejecuta el cálculo
- **GIVEN** una solicitud sin `promedioAcumulado`
- **WHEN** se ejecuta el cálculo
- **THEN** el caso queda `datos_incompletos` y no se genera decisión automática

#### Scenario: Uno consulta la solicitud de beca del otro
- **GIVEN** dos estudiantes
- **WHEN** uno consulta la solicitud de beca del otro
- **THEN** el sistema responde 403 o 404

### Requirement: Becas, backend 2: comité y otorgamiento
The system SHALL support becas, backend 2: comité y otorgamiento.

#### Scenario: Se ejecuta la evaluación
- **GIVEN** un caso clasificado `limitrofe`
- **WHEN** se ejecuta la evaluación
- **THEN** aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox

#### Scenario: Un integrante registra `otorgada` o `denegada` con comentario
- **GIVEN** un caso en la cola
- **WHEN** un integrante registra `otorgada` o `denegada` con comentario
- **THEN** se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud

#### Scenario: Intenta abrirlo
- **GIVEN** un usuario del comité no asignado al caso
- **WHEN** intenta abrirlo
- **THEN** el sistema responde 403

#### Scenario: Se recarga desde SQLite
- **GIVEN** una decisión registrada
- **WHEN** se recarga desde SQLite
- **THEN** el estado y el comentario persisten

### Requirement: Interfaz de becas y estado del estudiante
The system SHALL support interfaz de becas y estado del estudiante.

#### Scenario: El estudiante abre su página de estado
- **GIVEN** una evaluación en curso
- **WHEN** el estudiante abre su página de estado
- **THEN** ve `elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos` y no el puntaje numérico

#### Scenario: El estudiante abre su estado
- **GIVEN** una evaluación `datos_incompletos`
- **WHEN** el estudiante abre su estado
- **THEN** la página indica qué datos faltan

#### Scenario: Abre la pantalla de la cola
- **GIVEN** un integrante del comité
- **WHEN** abre la pantalla de la cola
- **THEN** ve solo los casos asignados

#### Scenario: Abre la página de estado
- **GIVEN** un estudiante sin solicitud de beca
- **WHEN** abre la página de estado
- **THEN** ve un mensaje de que no hay evaluación, sin error

### Requirement: Ejecución de desembolso
The system SHALL support ejecución de desembolso.

#### Scenario: El actor autorizado lo ejecuta
- **GIVEN** un desembolso `programado`
- **WHEN** el actor autorizado lo ejecuta
- **THEN** el estado pasa a `ejecutado`, se recarga igual desde SQLite y se guarda un aviso en el outbox

#### Scenario: El caso de uso termina
- **GIVEN** un módulo de ejecución que muta el estado y luego lanza una excepción (STUB que lanza)
- **WHEN** el caso de uso termina
- **THEN** el estado `ejecutado` queda persistido

#### Scenario: Una de las escrituras de estado u outbox falla
- **GIVEN** la ejecución con el notificador colector
- **WHEN** una de las escrituras de estado u outbox falla
- **THEN** ninguna se confirma (todo o nada)

#### Scenario: Intenta ejecutar un desembolso
- **GIVEN** un estudiante
- **WHEN** intenta ejecutar un desembolso
- **THEN** el sistema responde 403; y un estudiante solo ve sus propios desembolsos

### Requirement: Revisión de vencidos
The system SHALL support revisión de vencidos.

#### Scenario: Corre la revisión
- **GIVEN** un desembolso `programado` cuya fecha más el plazo ya pasó
- **WHEN** corre la revisión
- **THEN** pasa a `vencido` y el estado persiste al recargar desde SQLite

#### Scenario: Corre la revisión (2)
- **GIVEN** un desembolso confirmado dentro del plazo
- **WHEN** corre la revisión
- **THEN** permanece `ejecutado`

#### Scenario: El caso de uso termina
- **GIVEN** una revisión que genera avisos
- **WHEN** el caso de uso termina
- **THEN** estado y filas de outbox se confirman juntos o no se confirman

#### Scenario: Invoca el endpoint manual
- **GIVEN** un usuario de dirección académica o asesor
- **WHEN** invoca el endpoint manual
- **THEN** corre la revisión y un estudiante recibe 403

#### Scenario: Termina el proceso de pruebas
- **GIVEN** el servidor detenido en una prueba
- **WHEN** termina el proceso de pruebas
- **THEN** el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado)

### Requirement: Bandeja de notificaciones
The system SHALL support bandeja de notificaciones.

#### Scenario: Un usuario abre su bandeja
- **GIVEN** notificaciones entregadas para varios usuarios
- **WHEN** un usuario abre su bandeja
- **THEN** ve solo las propias

#### Scenario: El usuario la marca como leída
- **GIVEN** una notificación no leída
- **WHEN** el usuario la marca como leída
- **THEN** queda marcada y no cambia el estado de negocio asociado

#### Scenario: Abre la bandeja
- **GIVEN** un usuario sin notificaciones
- **WHEN** abre la bandeja
- **THEN** ve una lista vacía sin error

### Requirement: Reportes y umbral de mora
The system SHALL support reportes y umbral de mora.

#### Scenario: Dirección académica abre el reporte
- **GIVEN** un periodo con créditos aprobados, becas `elegible` automáticas y `otorgada` por el comité
- **WHEN** dirección académica abre el reporte
- **THEN** el total de becas cuenta ambos orígenes leyendo `scholarship_awards`

#### Scenario: Se abre el reporte
- **GIVEN** un periodo sin registros
- **WHEN** se abre el reporte
- **THEN** muestra todos los totales en cero, sin error

#### Scenario: Se recalcula la tasa
- **GIVEN** un umbral configurado por periodo y una tasa de mora superior
- **WHEN** se recalcula la tasa
- **THEN** se muestra la alerta con periodo, tasa y umbral

#### Scenario: Se recalcula
- **GIVEN** una tasa por debajo del umbral
- **WHEN** se recalcula
- **THEN** no se muestra alerta

#### Scenario: Solicita el reporte
- **GIVEN** un usuario que no es de dirección académica
- **WHEN** solicita el reporte
- **THEN** el sistema responde 403

### Requirement: Endurecimiento y verificación de punta a punta
The system SHALL support endurecimiento y verificación de punta a punta.

#### Scenario: Se genera el reporte consolidado
- **GIVEN** 10.000 registros en el periodo
- **WHEN** se genera el reporte consolidado
- **THEN** tarda menos de 5 s

#### Scenario: Corre el barrido de visibilidad
- **GIVEN** los cuatro roles y datos de varios estudiantes
- **WHEN** corre el barrido de visibilidad
- **THEN** ningún rol accede a recursos que no le corresponden

#### Scenario: Corre la prueba de humo de punta a punta
- **GIVEN** una base limpia
- **WHEN** corre la prueba de humo de punta a punta
- **THEN** un crédito pasa de solicitud a desembolso `ejecutado`

#### Scenario: Un desarrollador sigue la guía de ejecución
- **GIVEN** el README
- **WHEN** un desarrollador sigue la guía de ejecución
- **THEN** logra iniciar la aplicación con `npm start`
