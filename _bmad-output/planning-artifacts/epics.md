---
title: "Sistema de Créditos y Becas — Epics y Stories"
status: draft
created: 2026-09-27
updated: 2026-09-27
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

## Dependencias entre stories

```
1.1 ─→ 1.2 ─→ 1.3 ─┬─→ 3.1 ─→ 3.2 ─→ 3.3 ─┬─→ 4.1 ─→ 4.2
                    │                       │
2.1 ─→ 2.2 ─→ 2.3 ──┴───────────────────────┘
```

- **Epic 1** es fundación: la aprobación (Story 1.3) habilita el calendario de desembolso.
- **Epic 2** es independiente de Epic 1 (la elegibilidad de beca no requiere una solicitud de crédito aprobada).
- **Epic 3** depende de Epic 1 (solo hay calendario de desembolso para crédito aprobado).
- **Epic 4** depende de Epic 1, 2 y 3 (consolida créditos, becas y desembolsos vencidos por periodo).

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

## Criterios de listo (DoD) por story

- Criterios Given/When/Then verificados con datos de prueba representativos.
- Estado de la entidad (solicitud, evaluación, desembolso) documentado y sin transiciones ambiguas.
- Notificación al estudiante probada donde aplique (FR-004, FR-021).
- Reporte y alerta de mora validados contra al menos un periodo con datos y uno vacío.

---

*Epics derivados del PRD `prd.md` — 4 epics, 11 stories.*
