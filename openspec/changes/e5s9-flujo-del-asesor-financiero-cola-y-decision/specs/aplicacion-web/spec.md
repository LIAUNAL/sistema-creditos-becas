## ADDED Requirements

### Requirement: Flujo del asesor financiero: cola y decisión
The system SHALL support flujo del asesor financiero: cola y decisión.

#### Scenario: Un asesor reclama una
- **GIVEN** solicitudes `pendiente_revision` sin asignar
- **WHEN** un asesor reclama una
- **THEN** queda asignada a él y se registra la asignación en `assignments` y `audit_log`

#### Scenario: La rechaza sin motivo
- **GIVEN** una solicitud asignada al asesor
- **WHEN** la rechaza sin motivo
- **THEN** el sistema bloquea la acción y exige el motivo

#### Scenario: La rechaza con motivo
- **GIVEN** una solicitud asignada al asesor
- **WHEN** la rechaza con motivo
- **THEN** el estado pasa a `rechazada` y `audit_log` registra asesor, rol, acción y fecha

#### Scenario: Este asesor intenta decidirla
- **GIVEN** una solicitud asignada a otro asesor
- **WHEN** este asesor intenta decidirla
- **THEN** el sistema responde 403

#### Scenario: Abre una solicitud
- **GIVEN** un usuario de dirección académica
- **WHEN** abre una solicitud
- **THEN** no ve campos socioeconómicos
