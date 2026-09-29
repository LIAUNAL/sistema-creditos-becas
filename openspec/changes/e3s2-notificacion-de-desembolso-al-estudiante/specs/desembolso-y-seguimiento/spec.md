## ADDED Requirements

### Requirement: Notificación de desembolso al estudiante
El sistema SHALL soportar notificación de desembolso al estudiante.

#### Scenario: El sistema procesa la ejecución
- **GIVEN** un desembolso programado cuya fecha se ejecuta
- **WHEN** el sistema procesa la ejecución
- **THEN** cambia el estado del desembolso a `ejecutado` y notifica al estudiante con fecha y monto

#### Scenario: El estudiante consulta su historial de desembolsos
- **GIVEN** un desembolso ya marcado como `ejecutado`
- **WHEN** el estudiante consulta su historial de desembolsos
- **THEN** el sistema muestra el desembolso con su fecha de ejecución y estado
