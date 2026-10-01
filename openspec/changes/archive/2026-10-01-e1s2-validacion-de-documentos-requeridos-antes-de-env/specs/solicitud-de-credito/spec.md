## ADDED Requirements

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
