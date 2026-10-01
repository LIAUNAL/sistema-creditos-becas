## ADDED Requirements

### Requirement: Notificador colector y bandeja de salida (outbox)
The system SHALL support notificador colector y bandeja de salida (outbox).

#### Scenario: Un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLi
- **GIVEN** un notificador colector
- **WHEN** un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLimitrofe` y `notificarDesembolso`
- **THEN** cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos

#### Scenario: El caso de uso lo invoca con el ayudante transaccional
- **GIVEN** un módulo stub que muta el estado y luego lanza una excepción
- **WHEN** el caso de uso lo invoca con el ayudante transaccional
- **THEN** el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga

#### Scenario: Una de las dos escrituras falla
- **GIVEN** una transacción síncrona que guarda estado y filas del outbox
- **WHEN** una de las dos escrituras falla
- **THEN** ninguna de las dos queda confirmada (todo o nada)

#### Scenario: Corre el paso de entrega posterior al commit
- **GIVEN** filas de outbox confirmadas
- **WHEN** corre el paso de entrega posterior al commit
- **THEN** las filas pasan a la tabla `notifications` y la entrega no revierte el estado

#### Scenario: Corre la prueba de contrato
- **GIVEN** el contrato del puerto de notificación
- **WHEN** corre la prueba de contrato
- **THEN** el colector implementa los cuatro métodos con la firma que cada módulo espera
