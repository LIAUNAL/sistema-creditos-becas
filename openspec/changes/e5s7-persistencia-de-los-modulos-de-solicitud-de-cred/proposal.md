## Why

Entrega la Story 5.7 del Epic 5: Aplicación web.

## What Changes

- Persistencia de los módulos de solicitud de crédito.
- Ambas implementaciones se comportan igual (guardar, obtener, listar por estudiante y por estado).
- Se observa el mismo estado en cada una de las tres transiciones.
- Estado y filas de outbox se confirman juntos o no se confirman.
- Las 94 pruebas previas siguen verdes con los puertos aditivos (no-op en memoria por defecto).

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Persistencia de los módulos de solicitud de crédito".

## Impact

- Origen: BMAD Story 5.7 — Epic 5: Aplicación web
- Requisitos de esta story: FR-052, NFR-005, NFR-006
- Capability: `aplicacion-web`
