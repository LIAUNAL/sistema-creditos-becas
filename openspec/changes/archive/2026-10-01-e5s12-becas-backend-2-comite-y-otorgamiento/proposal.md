## Why

Entrega la Story 5.12 del Epic 5: Aplicación web.

## What Changes

- Becas, backend 2: comité y otorgamiento.
- Aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox.
- Se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud.
- El sistema responde 403.
- El estado y el comentario persisten.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Becas, backend 2: comité y otorgamiento".

## Impact

- Origen: BMAD Story 5.12 — Epic 5: Aplicación web
- Requisitos de esta story: FR-046, FR-041, FR-011, NFR-001
- Capability: `aplicacion-web`
