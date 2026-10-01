## ADDED Requirements

### Requirement: Becas, backend 1: solicitud y elegibilidad automática
The system SHALL support becas, backend 1: solicitud y elegibilidad automática.

#### Scenario: Envía una solicitud de beca con datos académicos y socioeconómicos, incl
- **GIVEN** un estudiante autenticado
- **WHEN** envía una solicitud de beca con datos académicos y socioeconómicos, incluido `promedioAcumulado`
- **THEN** se guarda en `scholarship_applications` y se ejecuta el cálculo de elegibilidad

#### Scenario: Termina el cálculo
- **GIVEN** un resultado `elegible`
- **WHEN** termina el cálculo
- **THEN** se registra una fila en `scholarship_awards` con el periodo de la solicitud

#### Scenario: Se ejecuta el cálculo
- **GIVEN** una solicitud sin `promedioAcumulado`
- **WHEN** se ejecuta el cálculo
- **THEN** el caso queda `datos_incompletos` y no se genera decisión automática

#### Scenario: Uno consulta la solicitud de beca del otro
- **GIVEN** dos estudiantes
- **WHEN** uno consulta la solicitud de beca del otro
- **THEN** el sistema responde 403 o 404
