## ADDED Requirements

### Requirement: Alerta de tasa de mora sobre el umbral definido
El sistema SHALL soportar alerta de tasa de mora sobre el umbral definido.

#### Scenario: El sistema recalcula la tasa de mora del periodo
- **GIVEN** un periodo con una tasa de desembolsos vencidos que supera el umbral configurado
- **WHEN** el sistema recalcula la tasa de mora del periodo
- **THEN** genera una alerta indicando el periodo, la tasa calculada y el umbral configurado

#### Scenario: El sistema recalcula la tasa de mora del periodo (2)
- **GIVEN** un periodo con tasa de mora por debajo del umbral configurado
- **WHEN** el sistema recalcula la tasa de mora del periodo
- **THEN** no genera ninguna alerta para ese periodo
