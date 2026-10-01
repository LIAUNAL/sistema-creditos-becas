## Why

Entrega la Story 5.11 del Epic 5: Aplicación web.

## What Changes

- Becas, backend 1: solicitud y elegibilidad automática.
- Se guarda en `scholarship_applications` y se ejecuta el cálculo de elegibilidad.
- Se registra una fila en `scholarship_awards` con el periodo de la solicitud.
- El caso queda `datos_incompletos` y no se genera decisión automática.
- El sistema responde 403 o 404.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Becas, backend 1: solicitud y elegibilidad automática".

## Impact

- Origen: BMAD Story 5.11 — Epic 5: Aplicación web
- Requisitos de esta story: FR-045, FR-010
- Capability: `aplicacion-web`
