## Why

Entrega la Story 5.6 del Epic 5: Aplicación web.

## What Changes

- Notificador colector y bandeja de salida (outbox).
- Cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos.
- El estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga.
- Ninguna de las dos queda confirmada (todo o nada).
- Las filas pasan a la tabla `notifications` y la entrega no revierte el estado.
- El colector implementa los cuatro métodos con la firma que cada módulo espera.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Notificador colector y bandeja de salida (outbox)".

## Impact

- Origen: BMAD Story 5.6 — Epic 5: Aplicación web
- Requisitos de esta story: FR-050, NFR-005
- Capability: `aplicacion-web`
