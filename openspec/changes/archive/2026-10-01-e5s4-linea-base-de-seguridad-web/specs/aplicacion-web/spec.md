## ADDED Requirements

### Requirement: Línea base de seguridad web
The system SHALL support línea base de seguridad web.

#### Scenario: Se genera el HTML
- **GIVEN** una plantilla que renderiza un valor de usuario con `<script>`
- **WHEN** se genera el HTML
- **THEN** el script aparece escapado y no como etiqueta ejecutable

#### Scenario: Llega al servidor
- **GIVEN** una petición POST sin token CSRF válido
- **WHEN** llega al servidor
- **THEN** el servidor la rechaza con 403

#### Scenario: Se inspecciona `Set-Cookie`
- **GIVEN** una respuesta que establece la cookie de sesión
- **WHEN** se inspecciona `Set-Cookie`
- **THEN** incluye HttpOnly y SameSite (y Secure cuando aplica)

#### Scenario: Llega al servidor (4)
- **GIVEN** un cuerpo de petición mayor al límite configurado
- **WHEN** llega al servidor
- **THEN** el servidor responde 413

#### Scenario: Vence el tiempo límite
- **GIVEN** una petición que se detiene sin completar el cuerpo
- **WHEN** vence el tiempo límite
- **THEN** el servidor cierra la conexión
