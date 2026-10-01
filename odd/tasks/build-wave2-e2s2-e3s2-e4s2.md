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
- [ ] T5 e1s3 — slice S8 (wave 3)
- [ ] T6 e2s3 — slice S9 (wave 3)
- [ ] T7 e3s3 — slice S10 (wave 3)
- [ ] T8 `npx @fission-ai/openspec validate --all --strict` + close wave 3: `npx un-specweaver close --done`

## Known cross-change risk
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

## Next step
Close wave 2, then wave 3 (e1s3, e2s3, e3s3) on stacked branches.
