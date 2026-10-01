# evaluacion-de-elegibilidad-para-becas Specification

## Purpose
Calcular un puntaje objetivo de elegibilidad de beca a partir de criterios socioeconómicos y académicos, escalar al comité los casos que el sistema no puede autodecidir, y permitir que el estudiante consulte el estado de su evaluación.

## Requirements

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

### Requirement: Revisión de casos limítrofes por el comité de becas
El sistema SHALL soportar revisión de casos limítrofes por el comité de becas.

#### Scenario: Se ejecuta el cálculo de elegibilidad
- **GIVEN** un caso clasificado como `limitrofe` por el motor de puntaje
- **WHEN** se ejecuta el cálculo de elegibilidad
- **THEN** el sistema lo agrega a la cola de revisión del comité de becas y notifica al comité

#### Scenario: El comité registra su decisión final (`otorgada` o `denegada`) con un co
- **GIVEN** un caso `limitrofe` en la cola del comité
- **WHEN** el comité registra su decisión final (`otorgada` o `denegada`) con un comentario
- **THEN** el sistema actualiza el estado del caso y conserva el comentario del comité en el historial

#### Scenario: Se ejecuta el cálculo de elegibilidad (3)
- **GIVEN** un caso clasificado como `elegible` o `no_elegible` (no limítrofe)
- **WHEN** se ejecuta el cálculo de elegibilidad
- **THEN** el sistema no lo agrega a la cola del comité; la decisión queda automática

### Requirement: Consulta del estado de evaluación por el estudiante
El sistema SHALL soportar consulta del estado de evaluación por el estudiante.

#### Scenario: Consulta su estado
- **GIVEN** un estudiante con una evaluación de beca en curso
- **WHEN** consulta su estado
- **THEN** el sistema muestra la clasificación actual (`elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos`)

#### Scenario: El estudiante consulta su estado
- **GIVEN** una evaluación marcada como `datos_incompletos`
- **WHEN** el estudiante consulta su estado
- **THEN** el sistema indica cuáles datos académicos o socioeconómicos faltan por registrar
