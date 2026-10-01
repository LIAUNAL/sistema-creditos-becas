## ADDED Requirements

### Requirement: Bandeja de notificaciones
The system SHALL support bandeja de notificaciones.

#### Scenario: Un usuario abre su bandeja
- **GIVEN** notificaciones entregadas para varios usuarios
- **WHEN** un usuario abre su bandeja
- **THEN** ve solo las propias

#### Scenario: El usuario la marca como leída
- **GIVEN** una notificación no leída
- **WHEN** el usuario la marca como leída
- **THEN** queda marcada y no cambia el estado de negocio asociado

#### Scenario: Abre la bandeja
- **GIVEN** un usuario sin notificaciones
- **WHEN** abre la bandeja
- **THEN** ve una lista vacía sin error
