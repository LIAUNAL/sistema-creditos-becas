## ADDED Requirements

### Requirement: Flujo del estudiante: solicitud de crédito
The system SHALL support flujo del estudiante: solicitud de crédito.

#### Scenario: Completa y envía el formulario de solicitud
- **GIVEN** un estudiante autenticado
- **WHEN** completa y envía el formulario de solicitud
- **THEN** se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista

#### Scenario: El estudiante confirma el envío
- **GIVEN** una solicitud `borrador` con los tres documentos adjuntos (metadatos)
- **WHEN** el estudiante confirma el envío
- **THEN** el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox

#### Scenario: El estudiante confirma el envío (3)
- **GIVEN** una solicitud `borrador` sin certificado de ingresos
- **WHEN** el estudiante confirma el envío
- **THEN** el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`

#### Scenario: El primero solicita la solicitud del segundo por URL
- **GIVEN** dos estudiantes con solicitudes distintas
- **WHEN** el primero solicita la solicitud del segundo por URL
- **THEN** el sistema responde 403 o 404 (visibilidad NFR-003)
