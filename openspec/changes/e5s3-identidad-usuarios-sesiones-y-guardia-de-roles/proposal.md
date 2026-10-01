## Why

Entrega la Story 5.3 del Epic 5: Aplicación web.

## What Changes

- Identidad: usuarios, sesiones y guardia de roles.
- El sistema crea una sesión en SQLite y el identificador de sesión es distinto del anterior al login (rotación).
- El sistema responde 429.
- El sistema responde 403.
- El sistema responde 401 o redirige al login.
- La sesión se elimina y el mismo identificador deja de ser válido.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Identidad: usuarios, sesiones y guardia de roles".

## Impact

- Origen: BMAD Story 5.3 — Epic 5: Aplicación web
- Requisitos de esta story: FR-040, NFR-004
- Capability: `aplicacion-web`
