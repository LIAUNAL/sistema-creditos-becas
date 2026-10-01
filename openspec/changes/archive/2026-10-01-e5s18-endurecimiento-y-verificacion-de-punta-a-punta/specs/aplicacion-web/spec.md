## ADDED Requirements

### Requirement: Endurecimiento y verificación de punta a punta
The system SHALL support endurecimiento y verificación de punta a punta.

#### Scenario: Se genera el reporte consolidado
- **GIVEN** 10.000 registros en el periodo
- **WHEN** se genera el reporte consolidado
- **THEN** tarda menos de 5 s

#### Scenario: Corre el barrido de visibilidad
- **GIVEN** los cuatro roles y datos de varios estudiantes
- **WHEN** corre el barrido de visibilidad
- **THEN** ningún rol accede a recursos que no le corresponden

#### Scenario: Corre la prueba de humo de punta a punta
- **GIVEN** una base limpia
- **WHEN** corre la prueba de humo de punta a punta
- **THEN** un crédito pasa de solicitud a desembolso `ejecutado`

#### Scenario: Un desarrollador sigue la guía de ejecución
- **GIVEN** el README
- **WHEN** un desarrollador sigue la guía de ejecución
- **THEN** logra iniciar la aplicación con `npm start`
