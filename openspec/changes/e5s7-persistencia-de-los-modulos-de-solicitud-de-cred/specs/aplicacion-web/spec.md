## ADDED Requirements

### Requirement: Persistencia de los módulos de solicitud de crédito
The system SHALL support persistencia de los módulos de solicitud de crédito.

#### Scenario: Corre la misma suite de contrato
- **GIVEN** los repositorios en memoria y SQLite
- **WHEN** corre la misma suite de contrato
- **THEN** ambas implementaciones se comportan igual (guardar, obtener, listar por estudiante y por estado)

#### Scenario: Se recarga desde SQLite
- **GIVEN** una solicitud que pasa a `pendiente_revision`, `aprobada` o `rechazada` mediante el caso de uso
- **WHEN** se recarga desde SQLite
- **THEN** se observa el mismo estado en cada una de las tres transiciones

#### Scenario: El caso de uso termina
- **GIVEN** la confirmación de envío o la decisión del asesor con el notificador colector
- **WHEN** el caso de uso termina
- **THEN** estado y filas de outbox se confirman juntos o no se confirman

#### Scenario: Corre `npm test`
- **GIVEN** el conjunto de pruebas existente
- **WHEN** corre `npm test`
- **THEN** las 94 pruebas previas siguen verdes con los puertos aditivos (no-op en memoria por defecto)
