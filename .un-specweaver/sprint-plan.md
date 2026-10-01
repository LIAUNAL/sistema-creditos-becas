# Plan de sprint — Epics y Stories — Sistema de Créditos y Becas

Derivado de 5 epic(s) y 29 story/ies.

Stories del mismo epic van en secuencia (comparten capability). Epics distintos van en paralelo.

## Ola 1 — 5 change(s) en paralelo

- **Story 1.1** — Registro de solicitud de crédito con datos socioeconómicos
  - change: `openspec/changes/e1s1-registro-de-solicitud-de-credito-con-datos-socio/`
  - capability: `solicitud-de-credito`
- **Story 2.1** — Cálculo de puntaje de elegibilidad de beca
  - change: `openspec/changes/e2s1-calculo-de-puntaje-de-elegibilidad-de-beca/`
  - capability: `evaluacion-de-elegibilidad-para-becas`
- **Story 3.1** — Calendario de desembolso para crédito aprobado
  - change: `openspec/changes/e3s1-calendario-de-desembolso-para-credito-aprobado/`
  - capability: `desembolso-y-seguimiento`
- **Story 4.1** — Reporte consolidado de créditos y becas por periodo
  - change: `openspec/changes/e4s1-reporte-consolidado-de-creditos-y-becas-por-peri/`
  - capability: `reportes-para-direccion-academica`
- **Story 5.1** — Fundación del servidor HTTP
  - change: `openspec/changes/e5s1-fundacion-del-servidor-http/`
  - capability: `aplicacion-web`

## Ola 2 — 5 change(s) en paralelo

- **Story 1.2** — Validación de documentos requeridos antes de enviar a revisión
  - change: `openspec/changes/e1s2-validacion-de-documentos-requeridos-antes-de-env/`
  - capability: `solicitud-de-credito`
  - depende de: 1.1 (secuencia dentro del epic (misma capability))
- **Story 2.2** — Revisión de casos limítrofes por el comité de becas
  - change: `openspec/changes/e2s2-revision-de-casos-limitrofes-por-el-comite-de-be/`
  - capability: `evaluacion-de-elegibilidad-para-becas`
  - depende de: 2.1 (secuencia dentro del epic (misma capability))
- **Story 3.2** — Notificación de desembolso al estudiante
  - change: `openspec/changes/e3s2-notificacion-de-desembolso-al-estudiante/`
  - capability: `desembolso-y-seguimiento`
  - depende de: 3.1 (secuencia dentro del epic (misma capability))
- **Story 4.2** — Alerta de tasa de mora sobre el umbral definido
  - change: `openspec/changes/e4s2-alerta-de-tasa-de-mora-sobre-el-umbral-definido/`
  - capability: `reportes-para-direccion-academica`
  - depende de: 4.1 (secuencia dentro del epic (misma capability))
- **Story 5.2** — Base de datos, migraciones y registro de auditoría
  - change: `openspec/changes/e5s2-base-de-datos-migraciones-y-registro-de-auditori/`
  - capability: `aplicacion-web`
  - depende de: 5.1 (secuencia dentro del epic (misma capability))

## Ola 3 — 4 change(s) en paralelo

- **Story 1.3** — Revisión y decisión del asesor financiero
  - change: `openspec/changes/e1s3-revision-y-decision-del-asesor-financiero/`
  - capability: `solicitud-de-credito`
  - depende de: 1.2 (secuencia dentro del epic (misma capability))
- **Story 2.3** — Consulta del estado de evaluación por el estudiante
  - change: `openspec/changes/e2s3-consulta-del-estado-de-evaluacion-por-el-estudia/`
  - capability: `evaluacion-de-elegibilidad-para-becas`
  - depende de: 2.2 (secuencia dentro del epic (misma capability))
- **Story 3.3** — Marcado de desembolso vencido
  - change: `openspec/changes/e3s3-marcado-de-desembolso-vencido/`
  - capability: `desembolso-y-seguimiento`
  - depende de: 3.2 (secuencia dentro del epic (misma capability))
- **Story 5.3** — Identidad: usuarios, sesiones y guardia de roles
  - change: `openspec/changes/e5s3-identidad-usuarios-sesiones-y-guardia-de-roles/`
  - capability: `aplicacion-web`
  - depende de: 5.2 (secuencia dentro del epic (misma capability))

## Ola 4 — 1 change(s) en paralelo

- **Story 5.4** — Línea base de seguridad web
  - change: `openspec/changes/e5s4-linea-base-de-seguridad-web/`
  - capability: `aplicacion-web`
  - depende de: 5.3 (secuencia dentro del epic (misma capability))

## Ola 5 — 1 change(s) en paralelo

- **Story 5.5** — Visibilidad y asignación de casos
  - change: `openspec/changes/e5s5-visibilidad-y-asignacion-de-casos/`
  - capability: `aplicacion-web`
  - depende de: 5.4 (secuencia dentro del epic (misma capability))

## Ola 6 — 1 change(s) en paralelo

- **Story 5.6** — Notificador colector y bandeja de salida (outbox)
  - change: `openspec/changes/e5s6-notificador-colector-y-bandeja-de-salida-outbox/`
  - capability: `aplicacion-web`
  - depende de: 5.5 (secuencia dentro del epic (misma capability))

## Ola 7 — 1 change(s) en paralelo

- **Story 5.7** — Persistencia de los módulos de solicitud de crédito
  - change: `openspec/changes/e5s7-persistencia-de-los-modulos-de-solicitud-de-cred/`
  - capability: `aplicacion-web`
  - depende de: 5.6 (secuencia dentro del epic (misma capability))

## Ola 8 — 1 change(s) en paralelo

- **Story 5.8** — Flujo del estudiante: solicitud de crédito
  - change: `openspec/changes/e5s8-flujo-del-estudiante-solicitud-de-credito/`
  - capability: `aplicacion-web`
  - depende de: 5.7 (secuencia dentro del epic (misma capability))

## Ola 9 — 1 change(s) en paralelo

- **Story 5.9** — Flujo del asesor financiero: cola y decisión
  - change: `openspec/changes/e5s9-flujo-del-asesor-financiero-cola-y-decision/`
  - capability: `aplicacion-web`
  - depende de: 5.8 (secuencia dentro del epic (misma capability))

## Ola 10 — 1 change(s) en paralelo

- **Story 5.10** — Condiciones del crédito y calendario de desembolso
  - change: `openspec/changes/e5s10-condiciones-del-credito-y-calendario-de-desembol/`
  - capability: `aplicacion-web`
  - depende de: 5.9 (secuencia dentro del epic (misma capability))

## Ola 11 — 1 change(s) en paralelo

- **Story 5.11** — Becas, backend 1: solicitud y elegibilidad automática
  - change: `openspec/changes/e5s11-becas-backend-1-solicitud-y-elegibilidad-automat/`
  - capability: `aplicacion-web`
  - depende de: 5.10 (secuencia dentro del epic (misma capability))

## Ola 12 — 1 change(s) en paralelo

- **Story 5.12** — Becas, backend 2: comité y otorgamiento
  - change: `openspec/changes/e5s12-becas-backend-2-comite-y-otorgamiento/`
  - capability: `aplicacion-web`
  - depende de: 5.11 (secuencia dentro del epic (misma capability))

## Ola 13 — 1 change(s) en paralelo

- **Story 5.13** — Interfaz de becas y estado del estudiante
  - change: `openspec/changes/e5s13-interfaz-de-becas-y-estado-del-estudiante/`
  - capability: `aplicacion-web`
  - depende de: 5.12 (secuencia dentro del epic (misma capability))

## Ola 14 — 1 change(s) en paralelo

- **Story 5.14** — Ejecución de desembolso
  - change: `openspec/changes/e5s14-ejecucion-de-desembolso/`
  - capability: `aplicacion-web`
  - depende de: 5.13 (secuencia dentro del epic (misma capability))

## Ola 15 — 1 change(s) en paralelo

- **Story 5.15** — Revisión de vencidos
  - change: `openspec/changes/e5s15-revision-de-vencidos/`
  - capability: `aplicacion-web`
  - depende de: 5.14 (secuencia dentro del epic (misma capability))

## Ola 16 — 1 change(s) en paralelo

- **Story 5.16** — Bandeja de notificaciones
  - change: `openspec/changes/e5s16-bandeja-de-notificaciones/`
  - capability: `aplicacion-web`
  - depende de: 5.15 (secuencia dentro del epic (misma capability))

## Ola 17 — 1 change(s) en paralelo

- **Story 5.17** — Reportes y umbral de mora
  - change: `openspec/changes/e5s17-reportes-y-umbral-de-mora/`
  - capability: `aplicacion-web`
  - depende de: 5.16 (secuencia dentro del epic (misma capability))

## Ola 18 — 1 change(s) en paralelo

- **Story 5.18** — Endurecimiento y verificación de punta a punta
  - change: `openspec/changes/e5s18-endurecimiento-y-verificacion-de-punta-a-punta/`
  - capability: `aplicacion-web`
  - depende de: 5.17 (secuencia dentro del epic (misma capability))

## Limite conocido

Una dependencia entre epics que no este escrita en el texto de la story NO se detecta aqui.
Este plan asume que los epics son independientes salvo que la story diga lo contrario.

