## ADDED Requirements

### Requirement: Reportes y umbral de mora
The system SHALL support reportes y umbral de mora.

#### Scenario: Dirección académica abre el reporte
- **GIVEN** un periodo con créditos aprobados, becas `elegible` automáticas y `otorgada` por el comité
- **WHEN** dirección académica abre el reporte
- **THEN** el total de becas cuenta ambos orígenes leyendo `scholarship_awards`

#### Scenario: Se abre el reporte
- **GIVEN** un periodo sin registros
- **WHEN** se abre el reporte
- **THEN** muestra todos los totales en cero, sin error

#### Scenario: Se recalcula la tasa
- **GIVEN** un umbral configurado por periodo y una tasa de mora superior
- **WHEN** se recalcula la tasa
- **THEN** se muestra la alerta con periodo, tasa y umbral

#### Scenario: Se recalcula
- **GIVEN** una tasa por debajo del umbral
- **WHEN** se recalcula
- **THEN** no se muestra alerta

#### Scenario: Solicita el reporte
- **GIVEN** un usuario que no es de dirección académica
- **WHEN** solicita el reporte
- **THEN** el sistema responde 403
