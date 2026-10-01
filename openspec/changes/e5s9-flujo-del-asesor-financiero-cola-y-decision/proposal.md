## Why

Entrega la Story 5.9 del Epic 5: Aplicación web.

## What Changes

- Flujo del asesor financiero: cola y decisión.
- Queda asignada a él y se registra la asignación en `assignments` y `audit_log`.
- El sistema bloquea la acción y exige el motivo.
- El estado pasa a `rechazada` y `audit_log` registra asesor, rol, acción y fecha.
- El sistema responde 403.
- No ve campos socioeconómicos.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Flujo del asesor financiero: cola y decisión".

## Impact

- Origen: BMAD Story 5.9 — Epic 5: Aplicación web
- Requisitos de esta story: FR-043, FR-041, FR-003, FR-004
- Capability: `aplicacion-web`
