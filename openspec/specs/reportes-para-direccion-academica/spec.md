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
