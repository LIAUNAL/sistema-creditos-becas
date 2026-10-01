# reportes-para-direccion-academica Specification

## Purpose
TBD - created by archiving change e4s1-reporte-consolidado-de-creditos-y-becas-por-peri. Update Purpose after archive.

## Requirements

### Requirement: Reporte consolidado de créditos y becas por periodo
El sistema SHALL soportar reporte consolidado de créditos y becas por periodo.

#### Scenario: Dirección académica consulta el reporte de ese periodo
- **GIVEN** un periodo académico con solicitudes de crédito aprobadas y becas otorgadas
- **WHEN** dirección académica consulta el reporte de ese periodo
- **THEN** el sistema muestra el total de créditos aprobados, el total de becas otorgadas y el monto total desembolsado

#### Scenario: Dirección académica consulta el reporte de ese periodo (2)
- **GIVEN** un periodo académico sin ninguna solicitud registrada
- **WHEN** dirección académica consulta el reporte de ese periodo
- **THEN** el sistema muestra el reporte con todos los totales en cero, sin error

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
