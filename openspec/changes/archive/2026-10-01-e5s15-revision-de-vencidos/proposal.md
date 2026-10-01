## Why

Entrega la Story 5.15 del Epic 5: Aplicación web.

## What Changes

- Revisión de vencidos.
- Pasa a `vencido` y el estado persiste al recargar desde SQLite.
- Permanece `ejecutado`.
- Estado y filas de outbox se confirman juntos o no se confirman.
- Corre la revisión y un estudiante recibe 403.
- El temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado).

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Revisión de vencidos".

## Impact

- Origen: BMAD Story 5.15 — Epic 5: Aplicación web
- Requisitos de esta story: FR-049, FR-022
- Capability: `aplicacion-web`
