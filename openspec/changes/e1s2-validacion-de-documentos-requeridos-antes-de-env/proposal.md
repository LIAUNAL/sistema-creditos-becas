## Why

Entrega la Story 1.2 del Epic 1: Solicitud de crédito.

## What Changes

- Validación de documentos requeridos antes de enviar a revisión.
- El sistema cambia el estado a `pendiente_revision` y notifica al estudiante la confirmación de envío.
- El sistema rechaza el envío, indica el documento faltante y la solicitud permanece en `borrador`.
- El sistema rechaza el archivo y solicita un formato válido sin descartar los documentos ya cargados.

## Capabilities

### New Capabilities

### Modified Capabilities

- `solicitud-de-credito`: agrega el requisito "Validación de documentos requeridos antes de enviar a revisión".

## Impact

- Origen: BMAD Story 1.2 — Epic 1: Solicitud de crédito
- Requisitos de esta story: FR-002, FR-004
- Capability: `solicitud-de-credito`
