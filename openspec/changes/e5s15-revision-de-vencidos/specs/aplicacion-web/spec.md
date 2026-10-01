## ADDED Requirements

### Requirement: Revisión de vencidos
The system SHALL support revisión de vencidos.

#### Scenario: Corre la revisión
- **GIVEN** un desembolso `programado` cuya fecha más el plazo ya pasó
- **WHEN** corre la revisión
- **THEN** pasa a `vencido` y el estado persiste al recargar desde SQLite

#### Scenario: Corre la revisión (2)
- **GIVEN** un desembolso confirmado dentro del plazo
- **WHEN** corre la revisión
- **THEN** permanece `ejecutado`

#### Scenario: El caso de uso termina
- **GIVEN** una revisión que genera avisos
- **WHEN** el caso de uso termina
- **THEN** estado y filas de outbox se confirman juntos o no se confirman

#### Scenario: Invoca el endpoint manual
- **GIVEN** un usuario de dirección académica o asesor
- **WHEN** invoca el endpoint manual
- **THEN** corre la revisión y un estudiante recibe 403

#### Scenario: Termina el proceso de pruebas
- **GIVEN** el servidor detenido en una prueba
- **WHEN** termina el proceso de pruebas
- **THEN** el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado)
