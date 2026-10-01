## Why

Entrega la Story 5.8 del Epic 5: Aplicación web.

## What Changes

- Flujo del estudiante: solicitud de crédito.
- Se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista.
- El estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox.
- El envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`.
- El sistema responde 403 o 404 (visibilidad NFR-003).

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Flujo del estudiante: solicitud de crédito".

## Impact

- Origen: BMAD Story 5.8 — Epic 5: Aplicación web
- Requisitos de esta story: FR-042, FR-001, FR-002, NFR-003
- Capability: `aplicacion-web`
