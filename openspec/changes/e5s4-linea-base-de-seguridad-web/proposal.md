## Why

Entrega la Story 5.4 del Epic 5: Aplicación web.

## What Changes

- Línea base de seguridad web.
- El script aparece escapado y no como etiqueta ejecutable.
- El servidor la rechaza con 403.
- Incluye HttpOnly y SameSite (y Secure cuando aplica).
- El servidor responde 413.
- El servidor cierra la conexión.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Línea base de seguridad web".

## Impact

- Origen: BMAD Story 5.4 — Epic 5: Aplicación web
- Requisitos de esta story: NFR-004
- Capability: `aplicacion-web`
