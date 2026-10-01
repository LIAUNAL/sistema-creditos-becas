## ADDED Requirements

### Requirement: Base de datos, migraciones y registro de auditoría
The system SHALL support base de datos, migraciones y registro de auditoría.

#### Scenario: Se ejecuta el ejecutor de migraciones dos veces
- **GIVEN** una base de datos nueva
- **WHEN** se ejecuta el ejecutor de migraciones dos veces
- **THEN** las tablas existen y la segunda ejecución no cambia el esquema ni falla

#### Scenario: Se escribe una entrada en `audit_log`
- **GIVEN** un reloj inyectado con una fecha fija
- **WHEN** se escribe una entrada en `audit_log`
- **THEN** la entrada guarda actor, rol, acción, objetivo y la fecha ISO del reloj

#### Scenario: Se leen las entradas de `audit_log`
- **GIVEN** el servidor reiniciado con el mismo archivo de base de datos
- **WHEN** se leen las entradas de `audit_log`
- **THEN** las entradas previas siguen presentes
