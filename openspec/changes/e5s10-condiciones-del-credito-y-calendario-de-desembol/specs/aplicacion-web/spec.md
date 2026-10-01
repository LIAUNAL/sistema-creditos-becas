## ADDED Requirements

### Requirement: Condiciones del crédito y calendario de desembolso
The system SHALL support condiciones del crédito y calendario de desembolso.

#### Scenario: La aprueba con monto, número de cuotas y fecha de primera cuota válidos
- **GIVEN** una solicitud `pendiente_revision` asignada al asesor
- **WHEN** la aprueba con monto, número de cuotas y fecha de primera cuota válidos
- **THEN** se guardan los términos y se genera un desembolso `programado` por cuota con `periodoAcademico` y `tipoCredito` copiados

#### Scenario: Se intenta generar el calendario
- **GIVEN** una aprobación con monto cero o inválido
- **WHEN** se intenta generar el calendario
- **THEN** se rechaza, se registra el error en `calendar_errors` y no se crean desembolsos parciales

#### Scenario: Se repite la aprobación
- **GIVEN** un crédito aprobado con calendario ya generado
- **WHEN** se repite la aprobación
- **THEN** no se duplican desembolsos

#### Scenario: Se recarga desde SQLite
- **GIVEN** el calendario generado
- **WHEN** se recarga desde SQLite
- **THEN** los desembolsos conservan fecha, monto, periodo y tipo de crédito
