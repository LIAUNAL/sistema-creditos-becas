## ADDED Requirements

### Requirement: Interfaz de becas y estado del estudiante
The system SHALL support interfaz de becas y estado del estudiante.

#### Scenario: El estudiante abre su página de estado
- **GIVEN** una evaluación en curso
- **WHEN** el estudiante abre su página de estado
- **THEN** ve `elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos` y no el puntaje numérico

#### Scenario: El estudiante abre su estado
- **GIVEN** una evaluación `datos_incompletos`
- **WHEN** el estudiante abre su estado
- **THEN** la página indica qué datos faltan

#### Scenario: Abre la pantalla de la cola
- **GIVEN** un integrante del comité
- **WHEN** abre la pantalla de la cola
- **THEN** ve solo los casos asignados

#### Scenario: Abre la página de estado
- **GIVEN** un estudiante sin solicitud de beca
- **WHEN** abre la página de estado
- **THEN** ve un mensaje de que no hay evaluación, sin error
