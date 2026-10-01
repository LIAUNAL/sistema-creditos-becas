## ADDED Requirements

### Requirement: Consulta del estado de evaluación por el estudiante
El sistema SHALL soportar consulta del estado de evaluación por el estudiante.

#### Scenario: Consulta su estado
- **GIVEN** un estudiante con una evaluación de beca en curso
- **WHEN** consulta su estado
- **THEN** el sistema muestra la clasificación actual (`elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos`)

#### Scenario: El estudiante consulta su estado
- **GIVEN** una evaluación marcada como `datos_incompletos`
- **WHEN** el estudiante consulta su estado
- **THEN** el sistema indica cuáles datos académicos o socioeconómicos faltan por registrar
