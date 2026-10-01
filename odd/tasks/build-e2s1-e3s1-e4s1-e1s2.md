# Feature: build-e2s1-e3s1-e4s1-e1s2

## Objective
Implement four OpenSpec changes via `/sw:build`, one at a time, each with a test per spec scenario.

## Scope (authorized)
- `e2s1-calculo-de-puntaje-de-elegibilidad-de-beca` (capability: evaluacion-de-elegibilidad-para-becas)
- `e3s1-calendario-de-desembolso-para-credito-aprobado` (capability: desembolso-y-seguimiento)
- `e4s1-reporte-consolidado-de-creditos-y-becas-por-peri` (capability: reportes-para-direccion-academica)
- `e1s2-validacion-de-documentos-requeridos-antes-de-env` (capability: solicitud-de-credito; depends on 1.1, archived)
- Out of scope: any other change; spec edits (those go through /sw:change).

## Constraints
- Specs in `openspec/changes/<id>/specs/**/spec.md` are the contract; each `#### Scenario:` needs a test.
- Source under `src/<capability>/`, matching style of `src/solicitud-credito/registroSolicitudCredito.js`.
- Code, comments, identifiers in English-or-existing-project-language per existing code; no persona voice in artifacts.
- No AI attribution in commits beyond what the harness mandates; Conventional Commits.

## Resolved config
- TDD: enabled (source: session config), runner: `npm test` (`node --test src/`)
- Delivery strategy: ask-on-risk; forecast well under ~400 changed lines per change.
- Route: delegated direct, one writer per change (trigger: writer trigger, 2+ non-trivial files per change).

## Tasks
- [x] T1 e2s1 — implement + tests (spec tasks 1.1, 1.2, 2.1, 2.2) — commit eab985a
- [x] T2 e3s1 — implement + tests (spec tasks 1.1, 1.2, 2.1, 2.2)
- [x] T3 e4s1 — implement + tests (spec tasks 1.1, 1.2, 2.1, 2.2)
- [x] T4 e1s2 — implement + tests (spec tasks 1.1-1.3, 2.1-2.3)
- [~] T5 validate: `npx @fission-ai/openspec validate --all --strict` — 10/11 pass; only `spec/solicitud-de-credito` fails (pre-existing placeholder Purpose warning in the main spec from Story 1.1, outside this scope)
- [x] T6 close each story: `npx un-specweaver close --done` — 4 archived, 0 failures (deltas merged into `openspec/specs/`)

## Acceptance
- `npm test` green; openspec validate strict passes; tasks.md checkboxes match reality.

## Progress / evidence
- T1 (delegated writer): RED observed (test module missing), GREEN 20/20 via `npm test`; `openspec validate e2s1 --strict` valid. Commit eab985a.
  - Spec gaps the writer resolved by assumption (need product confirmation): score formula (weights/scales/thresholds as config inputs), lower estrato/ingresos = higher need, score == threshold goes to higher category, missing estrato/ingresos also = `datos_incompletos`, return shape `{puntaje, clasificacion, decisionAutomatica, camposFaltantes}`, invalid config throws `ErrorConfiguracionInvalida`.

- T2 (delegated writer): RED observed (`Cannot find module './calendarioDesembolso'`), GREEN 34/34 via `npm test`; `openspec validate e3s1 --strict` valid.
  - Assumptions to confirm (spec silent): first installment date is an input (`fechaPrimeraCuota`), monthly with month-end clamp; amounts split in cents, remainder on last installment; error "registry" = in-memory `errores` list + thrown `ErrorGeneracionCalendario`; also rejects non-`aprobada` state, invalid `numeroCuotas`/date; idempotent per `solicitud.id` (from story technical note); in-memory Map storage, `randomUUID()` ids.
  - Writer used `sed -i` for checkboxes (project rule says sd); harmless.

- T3 (delegated writer): RED observed (`Cannot find module './reporteConsolidado'`), GREEN 38/38 via `npm test`; `openspec validate e4s1 --strict` valid.
  - Assumptions to confirm (spec silent): input shapes `solicitudes {id, periodoAcademico, estado}`, `becas {periodoAcademico, estado}`, `desembolsos {solicitudId, monto, estado}`; credits = `aprobada`, becas = `otorgada` (counts); disbursed amount sums only state `desembolsado`, which no story emits yet (3.1 only emits `programado`), so the total will read 0 until a disbursement story defines it; desembolso period comes from its solicitud; centavo-exact sums; no input validation; unknown period/empty arrays give zeros.

- T4 (delegated writer): RED observed (`MODULE_NOT_FOUND` for `./envioSolicitud`), GREEN 47/47 via `npm test`; `openspec validate e1s2 --strict` valid. Extends `src/solicitud-credito/`; one additive edit to `registroSolicitudCredito.js` (`pendiente_revision` added to `ESTADOS_ACTIVOS`; graphify showed no other consumers).
  - Assumptions to confirm (spec silent): required docs `identificacion`, `certificado_ingresos`, `certificado_matricula` (configurable); formats `pdf/jpg/jpeg/png` (configurable, by extension); notification port `notificador.notificarEnvio({estudianteId, solicitudId, estado})`; upload is a separate step from submit; same doc type re-upload replaces; non-`borrador` state throws `ErrorEstadoInvalido`; no file content/size check.

## Delivery
- Strategy: `stacked-to-main` (chosen by user). One PR per change, stacked in order.
- Slices / branches: S1 `feat/e2s1-puntaje-elegibilidad` (e2s1, ~372 changed lines, medium, under budget); S2 `feat/e3s1-calendario-desembolso` (on top of S1); S3 e4s1; S4 e1s2.
- Review assessment: T1 medium / under_budget (assessed with `--untracked-scope=exclude`; untracked files are init/graphify artifacts, not part of the candidate).

- T4 commit e656e61 (356 lines, medium, under budget); close commit on S4 branch `feat/e1s2-validacion-documentos`. Per-slice commits: S1 eab985a/6b0e6c0, S2 eed8614, S3 19322e8, S4 e656e61 + close.
- Native review: not due for any slice (all medium/under_budget); the 4 slices are stacked, none pushed.

## Next step
User decisions: push + open stacked PRs (S1 -> S2 -> S3 -> S4); confirm the writers' spec assumptions with product; fix the placeholder Purpose in `openspec/specs/solicitud-de-credito/spec.md` (the only `validate --all --strict` failure).
