## ADDED Requirements

### Requirement: Marcado de desembolso vencido
El sistema SHALL soportar marcado de desembolso vencido.

#### Scenario: El sistema ejecuta la revisión periódica de vencimientos
- **GIVEN** un desembolso en estado `programado` cuya fecha programada más el plazo de confirmación ya pasó sin confirmación
- **WHEN** el sistema ejecuta la revisión periódica de vencimientos
- **THEN** cambia el estado del desembolso a `vencido` y lo incluye en el conteo de mora del periodo

#### Scenario: El sistema ejecuta la revisión periódica de vencimientos (2)
- **GIVEN** un desembolso confirmado dentro del plazo
- **WHEN** el sistema ejecuta la revisión periódica de vencimientos
- **THEN** el desembolso permanece en `ejecutado` y no se marca como `vencido`
