## ADDED Requirements

### Requirement: Identidad: usuarios, sesiones y guardia de roles
The system SHALL support identidad: usuarios, sesiones y guardia de roles.

#### Scenario: Envía credenciales correctas
- **GIVEN** un usuario sembrado con contraseña hasheada
- **WHEN** envía credenciales correctas
- **THEN** el sistema crea una sesión en SQLite y el identificador de sesión es distinto del anterior al login (rotación)

#### Scenario: Envía otro intento
- **GIVEN** credenciales incorrectas repetidas más allá del límite
- **WHEN** envía otro intento
- **THEN** el sistema responde 429

#### Scenario: Solicita una ruta restringida al rol `asesor_financiero`
- **GIVEN** un usuario con rol `estudiante`
- **WHEN** solicita una ruta restringida al rol `asesor_financiero`
- **THEN** el sistema responde 403

#### Scenario: Solicita una ruta protegida
- **GIVEN** un usuario sin sesión
- **WHEN** solicita una ruta protegida
- **THEN** el sistema responde 401 o redirige al login

#### Scenario: El usuario cierra sesión
- **GIVEN** una sesión activa
- **WHEN** el usuario cierra sesión
- **THEN** la sesión se elimina y el mismo identificador deja de ser válido
