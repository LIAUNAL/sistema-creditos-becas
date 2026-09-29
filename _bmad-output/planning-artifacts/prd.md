---
title: "Sistema de Créditos y Becas — PRD"
status: draft
created: 2026-09-27
updated: 2026-09-27
project: sistema-creditos-becas
version: 0.1.0
document_output_language: Spanish
---

# PRD — Sistema de Créditos y Becas

> **Nota normativa:** este documento usa el verbo **DEBE** como equivalente en español de *shall* para requisitos normativos.

## 1. Resumen ejecutivo

La universidad gestiona hoy las solicitudes de crédito educativo y la evaluación de becas de forma manual y fragmentada entre bienestar universitario, la oficina financiera y dirección académica. El **Sistema de Créditos y Becas** centraliza el ciclo completo: solicitud del estudiante, validación documental, revisión humana, evaluación de elegibilidad de becas, desembolso y seguimiento, y reportería consolidada para la dirección académica.

## 2. Contexto y problema

### 2.1 Contexto

Actualmente el estudiante entrega documentos físicos o por correo, un asesor financiero revisa manualmente cada carpeta, y no existe un cálculo estandarizado de elegibilidad para becas. Los desembolsos no tienen calendario formal ni alertas de mora, y dirección académica no cuenta con un reporte consolidado por periodo.

### 2.2 Problema

1. **Solicitudes sin trazabilidad**: no hay registro único del estado de cada solicitud de crédito.
2. **Validación documental manual**: documentos incompletos llegan a revisión y se rechazan tarde.
3. **Elegibilidad de becas subjetiva**: no hay un puntaje objetivo que combine criterios socioeconómicos y académicos.
4. **Desembolsos sin seguimiento**: no hay calendario ni alerta de desembolsos vencidos sin confirmar.
5. **Sin reportería**: dirección académica no puede consultar cifras consolidadas de créditos/becas otorgados ni tasas de mora por periodo.

### 2.3 Oportunidad

Un sistema único que registre la solicitud, valide documentos antes de enviarla a revisión, calcule un puntaje de elegibilidad de becas con escalamiento a comité en casos limítrofes, programe y notifique desembolsos, y exponga reportes consolidados con alertas de mora, resuelve el problema sin depender de procesos manuales paralelos.

## 3. Objetivos

### 3.1 Objetivo general

Construir el flujo digital completo de créditos y becas universitarias: solicitud, elegibilidad, desembolso y reportería para dirección académica.

### 3.2 Objetivos específicos

| ID | Objetivo | Métrica asociada |
|----|----------|-------------------|
| OBJ-01 | Registro y validación documental de solicitudes de crédito | 100% de solicitudes con documentos validados antes de revisión |
| OBJ-02 | Evaluación objetiva de elegibilidad de becas con escalamiento a comité | Casos limítrofes escalados <48h |
| OBJ-03 | Calendario de desembolso con notificación y control de vencidos | 0 desembolsos vencidos sin marcar |
| OBJ-04 | Reportería consolidada y alertas de mora para dirección académica | Reporte por periodo disponible en <5 s |

### 3.3 No-objetivos

Pasarela de pagos externa, integración bancaria en tiempo real, firma electrónica de contratos, portal de terceros (avalistas) en esta versión.

## 4. Usuarios y stakeholders

| Actor | Rol | Necesidad principal | Frecuencia |
|-------|-----|----------------------|------------|
| **Estudiante** | Usuario primario | Solicitar crédito/beca y conocer el estado de su evaluación | Por periodo académico |
| **Asesor financiero** | Revisor | Aprobar o rechazar solicitudes con datos completos | Diaria |
| **Comité de becas** | Revisor especializado | Decidir casos limítrofes que el sistema no puede autodecidir | Semanal |
| **Dirección académica** | Stakeholder | Consultar reportes consolidados y alertas de mora por periodo | Mensual |

## 5. Requisitos funcionales

> Convención: cada FR usa **DEBE** (Must) o **DEBERÍA** (Should).

### Capacidad 1 — Solicitud de crédito

| ID | Requisito | Prioridad | Traza |
|----|-----------|-----------|-------|
| **FR-001** | El sistema DEBE permitir que un estudiante registre una solicitud de crédito con sus datos socioeconómicos (ingresos del hogar, número de dependientes, estrato, ocupación del acudiente). | Must | Epic 1, Story 1.1 |
| **FR-002** | El sistema DEBE validar que la solicitud incluya los documentos requeridos (identificación, certificado de ingresos, certificado de matrícula) antes de enviarla a revisión, rechazando el envío si falta alguno. | Must | Epic 1, Story 1.2 |
| **FR-003** | El sistema DEBE permitir que un asesor financiero revise una solicitud completa y la apruebe o rechace registrando un motivo. | Must | Epic 1, Story 1.3 |
| **FR-004** | El sistema DEBERÍA notificar al estudiante el resultado de la revisión de su solicitud. | Should | Epic 1, Story 1.3 |

### Capacidad 2 — Evaluación de elegibilidad para becas

| ID | Requisito | Prioridad | Traza |
|----|-----------|-----------|-------|
| **FR-010** | El sistema DEBE calcular un puntaje de elegibilidad de beca a partir de criterios socioeconómicos y académicos (promedio acumulado, estrato, ingresos del hogar). | Must | Epic 2, Story 2.1 |
| **FR-011** | El sistema DEBE escalar al comité de becas los casos limítrofes que el puntaje automático no puede decidir con certeza. | Must | Epic 2, Story 2.2 |
| **FR-012** | El sistema DEBE permitir que un estudiante consulte el estado de su evaluación de elegibilidad de beca en cualquier momento. | Must | Epic 2, Story 2.3 |

### Capacidad 3 — Desembolso y seguimiento

| ID | Requisito | Prioridad | Traza |
|----|-----------|-----------|-------|
| **FR-020** | El sistema DEBE generar un calendario de desembolsos para todo crédito aprobado, con fechas y montos por cuota. | Must | Epic 3, Story 3.1 |
| **FR-021** | El sistema DEBE notificar al estudiante cuando se ejecuta un desembolso de su calendario. | Must | Epic 3, Story 3.2 |
| **FR-022** | El sistema DEBE marcar como vencido un desembolso que no fue confirmado dentro del plazo definido tras su fecha programada. | Must | Epic 3, Story 3.3 |

### Capacidad 4 — Reportes para dirección académica

| ID | Requisito | Prioridad | Traza |
|----|-----------|-----------|-------|
| **FR-030** | El sistema DEBE permitir que dirección académica consulte un reporte consolidado de créditos y becas otorgados por periodo académico. | Must | Epic 4, Story 4.1 |
| **FR-031** | El sistema DEBE emitir una alerta cuando la tasa de mora o vencimiento de un periodo supera el umbral definido por dirección académica. | Must | Epic 4, Story 4.2 |

## 6. Requisitos no funcionales

| ID | Requisito | Criterio de aceptación | Prioridad |
|----|-----------|-------------------------|-----------|
| **NFR-001** | Trazabilidad | Toda decisión de aprobación/rechazo o escalamiento queda registrada con autor y fecha. | Must |
| **NFR-002** | Tiempo de respuesta | Los reportes consolidados por periodo DEBEN generarse en menos de 5 s con hasta 10.000 registros. | Should |
| **NFR-003** | Privacidad de datos socioeconómicos | Los datos socioeconómicos del estudiante solo son visibles para el asesor financiero y el comité de becas asignados al caso. | Must |

## 7. Fuera de alcance

| Ítem | Razón |
|------|-------|
| Pasarela de pagos / integración bancaria en tiempo real | El desembolso se registra y notifica; la ejecución bancaria es externa |
| Firma electrónica de contratos de crédito | Requiere proveedor externo, fuera de esta versión |
| Portal para avalistas o terceros | No forma parte del alcance del piloto |

---

*Artefacto generado en fase de planeación BMAD — estado `draft` hasta validación de arquitectura y epics.*
