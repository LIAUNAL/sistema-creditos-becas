# desembolso-y-seguimiento Specification

## Purpose
Programar un calendario de desembolso para todo crédito aprobado, notificar al estudiante cuando un desembolso ocurre, y marcar como vencido un desembolso no confirmado tras el plazo definido.

## Requirements

### Requirement: Calendario de desembolso para crédito aprobado
El sistema SHALL soportar calendario de desembolso para crédito aprobado.

#### Scenario: El sistema genera el calendario
- **GIVEN** una solicitud de crédito en estado `aprobada` con monto y número de cuotas definidos
- **WHEN** el sistema genera el calendario
- **THEN** crea un desembolso programado por cuota, cada uno con fecha y monto, en estado `programado`

#### Scenario: El sistema intenta generar el calendario
- **GIVEN** un crédito aprobado con monto igual a cero o inválido
- **WHEN** el sistema intenta generar el calendario
- **THEN** rechaza la generación y registra el error sin crear desembolsos parciales

### Requirement: Notificación de desembolso al estudiante
El sistema SHALL soportar notificación de desembolso al estudiante.

#### Scenario: El sistema procesa la ejecución
- **GIVEN** un desembolso programado cuya fecha se ejecuta
- **WHEN** el sistema procesa la ejecución
- **THEN** cambia el estado del desembolso a `ejecutado` y notifica al estudiante con fecha y monto

#### Scenario: El estudiante consulta su historial de desembolsos
- **GIVEN** un desembolso ya marcado como `ejecutado`
- **WHEN** el estudiante consulta su historial de desembolsos
- **THEN** el sistema muestra el desembolso con su fecha de ejecución y estado

### Requirement: Marcado de desembolso vencido
El sistema SHALL soportar marcado de desembolso vencido.

#### Scenario: El sistema ejecuta la revisión periódica de vencimientos
- **GIVEN** un desembolso en estado `programado` cuya fecha programada más el plazo de confirmación ya pasó sin confirmación
- **WHEN** el sistema ejecuta la revisión periódica de vencimientos
- **THEN** cambia el estado del desembolso a `vencido` y lo incluye en el conteo de mora del periodo

#### Scenario: El sistema ejecuta la revisión periódica de vencimientos (2)
- **GIVEN** un desembolso confirmado dentro del plazo
- **WHEN** el sistema ejecuta la revisión periódica de vencimientos
- **THEN** el desembolso permanece en `ejecutado` y no se marca como `vencido`
