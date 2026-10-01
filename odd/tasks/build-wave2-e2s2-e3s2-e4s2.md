# Feature: build-wave2-e2s2-e3s2-e4s2

## Objective
Implement wave 2 OpenSpec changes via `/sw:build`, one at a time, each with a test per spec scenario.

## Scope (authorized)
- `e2s2-revision-de-casos-limitrofes-por-el-comite-de-be` (evaluacion-de-elegibilidad-para-becas; depends on 2.1, archived)
- `e3s2-notificacion-de-desembolso-al-estudiante` (desembolso-y-seguimiento; depends on 3.1, archived)
- `e4s2-alerta-de-tasa-de-mora-sobre-el-umbral-definido` (reportes-para-direccion-academica; depends on 4.1, archived)
- Scope extended by user ("continue with the rest of the olas"): wave 3 after wave 2, same rules:
  - `e1s3-revision-y-decision-del-asesor-financiero` (solicitud-de-credito; depends on 1.2)
  - `e2s3-consulta-del-estado-de-evaluacion-por-el-estudia` (evaluacion-de-elegibilidad-para-becas; depends on 2.2)
  - `e3s3-marcado-de-desembolso-vencido` (desembolso-y-seguimiento; depends on 3.2)
- Out of scope: spec edits (go through /sw:change), editing already-archived modules beyond additive minimal changes.

## Constraints
- Specs under `openspec/changes/<id>/specs/**/spec.md` are the contract; every `#### Scenario:` needs a test.
- CommonJS, `node:test`, Spanish identifiers, no new dependencies, matching existing `src/` style.
- Conventional Commits, no AI attribution (user CLAUDE.md).

## Resolved config
- TDD: enabled (session config), runner: `npm test` (`node --test src/`)
- Delivery: `stacked-to-main` (user choice, carried from build-e2s1-e3s1-e4s1-e1s2); one slice per change, stacked on `feat/e1s2-validacion-documentos`.
- Route: delegated direct, one writer per change.

## Tasks
- [x] T1 e2s2 — slice S5 `feat/e2s2-revision-casos-limitrofes` (spec 1.1-1.3, 2.1-2.3)
- [x] T2 e3s2 — slice S6 (spec 1.1-1.2, 2.1-2.2)
- [x] T3 e4s2 — slice S7 (spec 1.1-1.2, 2.1-2.2)
- [x] T4 close wave 2: `npx un-specweaver close --done` — 3 archived, 0 failures. `validate --all --strict`: 6/10 pass; the 4 main specs (`solicitud-de-credito`, `desembolso-y-seguimiento`, `evaluacion-de-elegibilidad-para-becas`, `reportes-para-direccion-academica`) each fail only on the `[WARNING] Purpose section is still a placeholder` created by `archive`. Fix = write a real `## Purpose` in each `openspec/specs/*/spec.md` (product wording, pending).
- [x] T5 e1s3 — slice S8 (wave 3)
- [x] T6 e2s3 — slice S9 (wave 3)
- [x] T7 e3s3 — slice S10 (wave 3)
- [x] T8 close wave 3: `npx un-specweaver close --done` — 3 archived, 0 failures; `openspec/changes/` has no open changes left (all 11 stories done). `validate --all --strict`: 0/4 main specs pass, all only on the `Purpose` placeholder warning (see T4).

## Resolved: 4.1 `desembolsado` vs 3.2 `ejecutado` (via /sw:bug)
- Classified as a defect (spec correct: report must show "monto total desembolsado"; `desembolsado` is defined by no spec/story, `ejecutado` is). Fixed on branch `fix/reporte-monto-desembolsado-ejecutado`, commit 17f411d (88 changed lines, medium, under budget) with a real-module integration test (calendar -> execute -> report; `programado`/`vencido` excluded; RED `actual 0, expected 500.01`). Change archived as `2026-10-01-fix-reporte-monto-desembolsado-ejecutado` with `.openspec.yaml` `schema: spec-driven` + `skip_specs: true` (OpenSpec requires it for a change with no spec delta). npm test 94/94.

## Known cross-change risk (historical, now resolved above)
- e3s2 introduces disbursement state `ejecutado`; e4s1 (archived) sums only state `desembolsado`, so the report total would stay 0. Do NOT edit e4s1 here; report it as a gap for the user (needs /sw:change or /sw:bug).

## Acceptance
- `npm test` green; strict validate passes per change; tasks.md boxes match reality.

## Progress / evidence
- T1 e2s2 (delegated writer): RED observed (`Cannot find module './revisionComite'`), GREEN 56/56 via `npm test`; `openspec validate e2s2 --strict` valid. New files only; `calculoElegibilidad.js` untouched.
  - Assumptions to confirm (spec silent): in-memory queue; notifier port `notificarCasoLimitrofe({idCaso, puntaje})` (async); states `en_revision_comite` -> `otorgada`/`denegada`; history entries `ingreso_cola_comite` and `decision_comite`; decision requires non-empty comment; duplicate processing neither re-queues nor re-notifies; `datos_incompletos` is neither queued nor decided; no committee member identity.

- T1 commit 8ecde7b: assessed medium, 402 lines, `review_due` = `slice_budget_reached`. Consent v3 relayed to the user; user chose "Skip this time" (declined_this_candidate, target sha256:b9d0be45...). Decline invocation executed once and validated; no review lineage created. Outcome: declined.

- T2 e3s2 (delegated writer): RED observed (`Cannot find module './ejecucionDesembolso'`), GREEN 60/60 via `npm test`; `openspec validate e3s2 --strict` valid. New files in `src/desembolso/`; `calendarioDesembolso.js` untouched.
  - Assumptions to confirm (spec silent): execution date from injected `reloj` (ISO date, `fechaEjecucion`); caller triggers `ejecutar`; only `programado` can be executed (else `ErrorEjecucionDesembolso('DESEMBOLSO_NO_PROGRAMADO')`, no notification); notifier port `notificarDesembolso({solicitudId, desembolsoId, numeroCuota, fecha, monto})`; view `consultarHistorial` returns all passed disbursements with `fechaEjecucion` null while programmed; state set to `ejecutado` before notifying and NOT rolled back if the notifier throws.
  - CONFIRMED GAP (user decision needed): `src/reportes/reporteConsolidado.js` sums only `desembolsado`, e3s2 emits `ejecutado` -> executed disbursements are missing from report totals. Not touched.

- T3 e4s2 (delegated writer): RED observed (`Cannot find module './alertaTasaMora'`), GREEN 67/67 via `npm test`; `openspec validate e4s2 --strict` valid. New files in `src/reportes/` only.
  - Assumptions to confirm (spec silent): rate = `vencido` / (`programado`+`ejecutado`+`vencido`) per period (from epics.md 4.2 technical note); alert only when rate strictly > threshold; zero denominator -> rate 0, no alert; threshold is a fraction 0..1, non-numeric throws `TypeError`; alert shape `{periodoAcademico, tasaMora, umbral}` or `null`; disbursement carries `periodoAcademico` directly; no delivery port.
  - Third state name in play: 4.1 sums `desembolsado`, 3.2 emits `ejecutado`, 4.2 uses `ejecutado`/`vencido`. Only 4.1 is inconsistent (already flagged).

- Wave 2 closed: archive commit c21c6e1 on `feat/e4s2-alerta-tasa-mora`; slices S5 8ecde7b (review declined), S6 8d1129f, S7 9f0c997 (S6/S7 medium, under budget).
- T5 e1s3 (delegated writer): RED observed (`Cannot find module './decisionAsesor'`), GREEN 73/73 via `npm test`; `openspec validate e1s3 --strict` valid. New files in `src/solicitud-credito/`; no existing source edited.
  - Assumptions to confirm (spec silent): rejected state `rechazada`; only `pendiente_revision` can be decided (else `ErrorSolicitudNoEnRevision`); decision date from injected `reloj`; caller passes `asesorId` (required); notifier port `notificarDecision({estudianteId, solicitudId, estado})` fires on approve AND reject (reject notification is the writer's addition); rejection reason non-blank string; `consultarHistorial(id)` returns `{solicitudId, estado, decision:{tipo, asesorId, fecha, motivo?}}` or undefined; decision log in memory, not tied to the registry.

- T5 commit e33fabf: first `assess` read returned risk=high, changed_lines=0 (reason code unavailable in output); re-run with identical flags returned medium, 263 lines, under_budget. Treated the re-run as authoritative; cause of the inconsistent first read not determined. No review due.

- T6 e2s3 (delegated writer): RED observed (`MODULE_NOT_FOUND` for `./consultaEstadoEvaluacion`), GREEN 85/85 via `npm test`; `openspec validate e2s3 --strict` valid. New files only. Branch note: writer started while the working tree was on the e1s3 branch (my branch-creation slip); switched to the e2s3 branch (same commit e33fabf) with only uncommitted changes, nothing mixed.
  - Writer skipped the `graphify query` orientation step (project rule); read-only view over existing outputs, low impact.
  - Assumptions to confirm (spec silent): input `{idEstudiante, evaluacion:{idEstudiante, resultado, caso?}}`; `limitrofe` without a committee case or `en_revision_comite` shows `limitrofe en revisión`; after a committee decision `clasificacion` shows `otorgada`/`denegada` plus `decisionComite`/`comentarioComite`; `datosFaltantes: [{campo, categoria}]` (`academico`/`socioeconomico`) only when `datos_incompletos`; mismatched student throws `ErrorEvaluacionAjena`, missing evaluation `ErrorEvaluacionNoDisponible`; numeric score never exposed (epics note); inputs not mutated.

- T6 commit 854ac0c (290 lines, medium, under budget).
- T7 e3s3 (delegated writer): graphify oriented (22 nodes); RED observed (`Cannot find module './vencimientoDesembolso'`), GREEN 93/93 via `npm test`; `openspec validate e3s3 --strict` valid. New files in `src/desembolso/`; nothing existing edited, `src/reportes/` untouched.
  - Assumptions to confirm (spec silent): overdue = `programado` and today strictly after `fecha + plazoConfirmacionDias` (default 15 from the story technical note; per-`tipoCredito` override, which 3.1 output lacks); only `programado` -> `vencido`; idempotent; invalid `fecha` skipped; today from injected `reloj` (UTC); mora count per period `{periodo: n}` plus `contarMoraPorPeriodo`; period read from `desembolso.periodoAcademico` or set from `opciones.periodoAcademico`; mutates in place; "confirmado" assumed = `ejecutado`; no scheduler (trigger not defined by spec).
  - Integration gaps: 3.1 disbursements carry no `periodoAcademico`; 4.1 still sums only `desembolsado`, so `vencido` counts in 4.2 but 4.1 ignores both `ejecutado` and `vencido`.

## Next step
Assess S10, validate, close wave 3, final report. Pending user decisions: reconcile 4.1 `desembolsado` vs 3.2 `ejecutado`; real `## Purpose` in 4 main specs; confirm writers' spec assumptions; push + stacked PRs.
