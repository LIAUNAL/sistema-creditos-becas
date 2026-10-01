# solicitud-de-credito Specification

## Purpose
Permitir que un estudiante registre una solicitud de crédito con sus datos socioeconómicos, que el sistema valide los documentos requeridos antes de enviarla a revisión, y que un asesor financiero la apruebe o rechace.

## Requirements

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

### Requirement: Validación de documentos requeridos antes de enviar a revisión
El sistema SHALL soportar validación de documentos requeridos antes de enviar a revisión.

#### Scenario: El estudiante confirma el envío a revisión
- **GIVEN** una solicitud en estado `borrador` con identificación, certificado de ingresos y certificado de matrícula adjuntos
- **WHEN** el estudiante confirma el envío a revisión
- **THEN** el sistema cambia el estado a `pendiente_revision` y notifica al estudiante la confirmación de envío

#### Scenario: El estudiante intenta confirmar el envío a revisión
- **GIVEN** una solicitud en estado `borrador` a la que le falta el certificado de ingresos
- **WHEN** el estudiante intenta confirmar el envío a revisión
- **THEN** el sistema rechaza el envío, indica el documento faltante y la solicitud permanece en `borrador`

#### Scenario: El estudiante lo carga
- **GIVEN** un documento adjunto en un formato no soportado
- **WHEN** el estudiante lo carga
- **THEN** el sistema rechaza el archivo y solicita un formato válido sin descartar los documentos ya cargados

### Requirement: Revisión y decisión del asesor financiero
El sistema SHALL soportar revisión y decisión del asesor financiero.

#### Scenario: El asesor financiero la aprueba
- **GIVEN** una solicitud en estado `pendiente_revision` con todos los documentos validados
- **WHEN** el asesor financiero la aprueba
- **THEN** el sistema cambia el estado a `aprobada`, registra el asesor y la fecha, y notifica al estudiante

#### Scenario: El asesor financiero la rechaza sin registrar un motivo
- **GIVEN** una solicitud en estado `pendiente_revision`
- **WHEN** el asesor financiero la rechaza sin registrar un motivo
- **THEN** el sistema bloquea la acción y exige un motivo de rechazo

#### Scenario: Se consulta su historial
- **GIVEN** una solicitud rechazada con motivo registrado
- **WHEN** se consulta su historial
- **THEN** el sistema muestra el asesor, la fecha y el motivo del rechazo
