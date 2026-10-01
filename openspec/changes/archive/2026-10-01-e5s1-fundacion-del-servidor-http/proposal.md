## Why

Entrega la Story 5.1 del Epic 5: Aplicación web.

## What Changes

- Fundación del servidor HTTP.
- El servidor escucha y `GET /health` responde 200.
- El servidor responde con el estado HTTP mapeado a ese código y no expone la traza.
- El servidor responde 404.
- El servidor se cierra en `after` y `node --test src/` no queda colgado.

## Capabilities

### New Capabilities

- `aplicacion-web`: **Objetivo:** ofrecer una aplicación web, ejecutable con `npm start`, que permita a los cuatro roles (estudiante, asesor financiero, comité de becas y dirección académica) completar los flujos de los Epics 1-4 con identidad y roles, persistencia, notificaciones dentro de la aplicación, visibilidad restringida de datos socioeconómicos (NFR-003) y trazabilidad de decisiones (NFR-001), sin cambiar las reglas de negocio de los módulos existentes. **Incluye:** servidor HTTP, base de datos SQLite con migraciones, autenticación y roles, línea base de seguridad web, asignación de casos, notificador colector con bandeja de salida, persistencia de los módulos con escritura explícita, pantallas de los flujos de crédito, beca, desembolso y reportes, bandeja de notificaciones y verificación de punta a punta. **Depende de:** Epic 1, Epic 2, Epic 3 y Epic 4 (envuelve sus módulos). **Bloquea a:** nada.

### Modified Capabilities

## Impact

- Origen: BMAD Story 5.1 — Epic 5: Aplicación web
- Requisitos de esta story: FR-052, NFR-006
- Capability: `aplicacion-web`
