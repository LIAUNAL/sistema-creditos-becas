## Purpose

**Objetivo:** ofrecer una aplicación web, ejecutable con `npm start`, que permita a los cuatro roles (estudiante, asesor financiero, comité de becas y dirección académica) completar los flujos de los Epics 1-4 con identidad y roles, persistencia, notificaciones dentro de la aplicación, visibilidad restringida de datos socioeconómicos (NFR-003) y trazabilidad de decisiones (NFR-001), sin cambiar las reglas de negocio de los módulos existentes. **Incluye:** servidor HTTP, base de datos SQLite con migraciones, autenticación y roles, línea base de seguridad web, asignación de casos, notificador colector con bandeja de salida, persistencia de los módulos con escritura explícita, pantallas de los flujos de crédito, beca, desembolso y reportes, bandeja de notificaciones y verificación de punta a punta. **Depende de:** Epic 1, Epic 2, Epic 3 y Epic 4 (envuelve sus módulos). **Bloquea a:** nada.

## ADDED Requirements

### Requirement: Fundación del servidor HTTP
The system SHALL support fundación del servidor HTTP.

#### Scenario: Se ejecuta `npm start`
- **GIVEN** el proyecto instalado
- **WHEN** se ejecuta `npm start`
- **THEN** el servidor escucha y `GET /health` responde 200

#### Scenario: Se atiende la petición
- **GIVEN** un manejador que lanza un error de módulo con `.codigo`
- **WHEN** se atiende la petición
- **THEN** el servidor responde con el estado HTTP mapeado a ese código y no expone la traza

#### Scenario: Se la solicita
- **GIVEN** una ruta inexistente
- **WHEN** se la solicita
- **THEN** el servidor responde 404

#### Scenario: Termina la prueba
- **GIVEN** la prueba de humo que levanta el servidor en un puerto efímero
- **WHEN** termina la prueba
- **THEN** el servidor se cierra en `after` y `node --test src/` no queda colgado
