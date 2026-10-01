## ADDED Requirements

### Requirement: Becas, backend 2: comité y otorgamiento
The system SHALL support becas, backend 2: comité y otorgamiento.

#### Scenario: Se ejecuta la evaluación
- **GIVEN** un caso clasificado `limitrofe`
- **WHEN** se ejecuta la evaluación
- **THEN** aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox

#### Scenario: Un integrante registra `otorgada` o `denegada` con comentario
- **GIVEN** un caso en la cola
- **WHEN** un integrante registra `otorgada` o `denegada` con comentario
- **THEN** se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud

#### Scenario: Intenta abrirlo
- **GIVEN** un usuario del comité no asignado al caso
- **WHEN** intenta abrirlo
- **THEN** el sistema responde 403

#### Scenario: Se recarga desde SQLite
- **GIVEN** una decisión registrada
- **WHEN** se recarga desde SQLite
- **THEN** el estado y el comentario persisten
