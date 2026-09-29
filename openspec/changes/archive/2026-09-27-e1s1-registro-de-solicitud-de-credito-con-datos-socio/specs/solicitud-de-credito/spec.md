## ADDED Requirements

### Requirement: Registro de solicitud de crédito con datos socioeconómicos
El sistema SHALL soportar registro de solicitud de crédito con datos socioeconómicos.

#### Scenario: Completa el formulario con ingresos del hogar, número de dependientes, e
- **GIVEN** un estudiante autenticado sin solicitud activa
- **WHEN** completa el formulario con ingresos del hogar, número de dependientes, estrato y ocupación del acudiente y lo envía
- **THEN** el sistema crea la solicitud con estado `borrador`, le asigna un identificador único y la asocia al estudiante

#### Scenario: Intenta crear una segunda solicitud para el mismo periodo académico
- **GIVEN** un estudiante que ya tiene una solicitud activa en curso
- **WHEN** intenta crear una segunda solicitud para el mismo periodo académico
- **THEN** el sistema rechaza la creación y muestra el estado de la solicitud existente

#### Scenario: El estudiante intenta enviar la solicitud
- **GIVEN** un formulario con campos socioeconómicos obligatorios vacíos
- **WHEN** el estudiante intenta enviar la solicitud
- **THEN** el sistema bloquea el envío y resalta los campos faltantes
