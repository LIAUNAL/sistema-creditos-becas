## ADDED Requirements

### Requirement: Visibilidad y asignación de casos
The system SHALL support visibilidad y asignación de casos.

#### Scenario: La política evalúa el acceso a un recurso de otro estudiante
- **GIVEN** un estudiante autenticado
- **WHEN** la política evalúa el acceso a un recurso de otro estudiante
- **THEN** deniega el acceso

#### Scenario: La política evalúa el acceso a esa solicitud
- **GIVEN** un asesor financiero asignado a una solicitud
- **WHEN** la política evalúa el acceso a esa solicitud
- **THEN** lo permite; para una solicitud no asignada a él, lo deniega

#### Scenario: La política evalúa el acceso a ese caso
- **GIVEN** un integrante del comité asignado a un caso
- **WHEN** la política evalúa el acceso a ese caso
- **THEN** lo permite; sin asignación, lo deniega

#### Scenario: La política proyecta una solicitud
- **GIVEN** un integrante de dirección académica
- **WHEN** la política proyecta una solicitud
- **THEN** el resultado no incluye campos socioeconómicos
