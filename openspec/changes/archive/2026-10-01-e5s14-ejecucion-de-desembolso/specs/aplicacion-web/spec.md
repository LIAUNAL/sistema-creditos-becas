## ADDED Requirements

### Requirement: Ejecución de desembolso
The system SHALL support ejecución de desembolso.

#### Scenario: El actor autorizado lo ejecuta
- **GIVEN** un desembolso `programado`
- **WHEN** el actor autorizado lo ejecuta
- **THEN** el estado pasa a `ejecutado`, se recarga igual desde SQLite y se guarda un aviso en el outbox

#### Scenario: El caso de uso termina
- **GIVEN** un módulo de ejecución que muta el estado y luego lanza una excepción (STUB que lanza)
- **WHEN** el caso de uso termina
- **THEN** el estado `ejecutado` queda persistido

#### Scenario: Una de las escrituras de estado u outbox falla
- **GIVEN** la ejecución con el notificador colector
- **WHEN** una de las escrituras de estado u outbox falla
- **THEN** ninguna se confirma (todo o nada)

#### Scenario: Intenta ejecutar un desembolso
- **GIVEN** un estudiante
- **WHEN** intenta ejecutar un desembolso
- **THEN** el sistema responde 403; y un estudiante solo ve sus propios desembolsos
