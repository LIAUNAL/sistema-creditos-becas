## ADDED Requirements

### Requirement: Cálculo de puntaje de elegibilidad de beca
El sistema SHALL soportar cálculo de puntaje de elegibilidad de beca.

#### Scenario: Se ejecuta el cálculo de elegibilidad
- **GIVEN** un estudiante con promedio acumulado, estrato e ingresos del hogar registrados
- **WHEN** se ejecuta el cálculo de elegibilidad
- **THEN** el sistema produce un puntaje numérico y clasifica el caso como `elegible`, `no_elegible` o `limitrofe` según los umbrales configurados

#### Scenario: Se ejecuta el cálculo de elegibilidad (2)
- **GIVEN** un estudiante sin promedio académico registrado
- **WHEN** se ejecuta el cálculo de elegibilidad
- **THEN** el sistema marca el caso como `datos_incompletos` sin producir una decisión automática
