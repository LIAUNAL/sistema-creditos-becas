## Why

Entrega la Story 5.14 del Epic 5: Aplicación web.

## What Changes

- Ejecución de desembolso.
- El estado pasa a `ejecutado`, se recarga igual desde SQLite y se guarda un aviso en el outbox.
- El estado `ejecutado` queda persistido.
- Ninguna se confirma (todo o nada).
- El sistema responde 403; y un estudiante solo ve sus propios desembolsos.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Ejecución de desembolso".

## Impact

- Origen: BMAD Story 5.14 — Epic 5: Aplicación web
- Requisitos de esta story: FR-048, FR-021
- Capability: `aplicacion-web`
