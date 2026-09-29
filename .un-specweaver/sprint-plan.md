# Plan de sprint — Epics y Stories — Sistema de Créditos y Becas

Derivado de 4 epic(s) y 11 story/ies.

Stories del mismo epic van en secuencia (comparten capability). Epics distintos van en paralelo.

## Ola 1 — 4 change(s) en paralelo

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

## Ola 2 — 4 change(s) en paralelo

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

## Ola 3 — 3 change(s) en paralelo

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

## Limite conocido

Una dependencia entre epics que no este escrita en el texto de la story NO se detecta aqui.
Este plan asume que los epics son independientes salvo que la story diga lo contrario.

