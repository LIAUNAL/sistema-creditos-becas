## ADDED Requirements

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
