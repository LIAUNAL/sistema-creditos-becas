# desembolso-y-seguimiento Specification

## Purpose
TBD - created by archiving change e3s1-calendario-de-desembolso-para-credito-aprobado. Update Purpose after archive.

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
