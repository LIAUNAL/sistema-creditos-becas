# Feature: web-app (Epic 5, web application)

## Objective
Deliver a web application on top of the existing business-logic modules so students, financial advisors, committee members and academic direction can use the credits and scholarships system end to end.

## Source of truth
- Plan approved by Judgment Day: `docs/web-app-plan.md` (19 slices P0-P18, decisions D1-D7, risks R1-R7, open questions Q1-Q5, residual items in its appendix).
- Scope control: `/sw:change` classified this as a NEW EPIC (user confirmed). Order: `bmad-correct-course` (PRD + epics.md) -> `npx un-specweaver bridge --only 5.N --force` -> `openspec validate --all --strict` -> build.

## Constraints
- Delivery: `stacked-to-main`, linear stack on top of `docs/spec-purposes` (PR #13). Each slice <= 400 changed lines unless flagged `size:exception` (P7 ~440, P10 ~420).
- TDD enabled (session config), runner `npm test` (`node --test src/`); existing 94 tests must stay green after every slice.
- No Co-Authored-By/AI attribution; Conventional Commits; push and PR creation need explicit user authorization per batch.
- Artifacts in Spanish for BMAD documents (config `document_output_language: Spanish`); code identifiers follow existing Spanish style.

## Open product questions (defaults are in the plan)
Q1 stack, Q2 who executes disbursements, Q3 uploads (bytes vs metadata), Q4 scholarship application start / `promedioAcumulado`, Q5 advisor/committee assignment.

## Tasks (stable IDs map 1:1 to plan slices)
- [x] T0 (P0) Scope and docs: `bmad-correct-course` -> sprint change proposal, PRD + epics.md Epic 5, fill `docs/architecture-base.md`; bridge generated 18 changes `e5s1`..`e5s18` (capability `aplicacion-web`)
- [x] T1 (P1) HTTP server + router, error mapping, `/health`, `npm start`, `engines`, server teardown rule
- [ ] T2 (P2) DB: sqlite connection, migrations runner, clock, `audit_log`
- [ ] T3 (P3) Identity: seeded users, async scrypt, sessions, login/logout, session rotation, login throttling
- [ ] T4 (P4) Web security baseline: escaping, CSRF, cookie flags, body size limit, request timeout
- [ ] T5 (P5) Visibility and ownership: assignments, default rule for Q5, policy functions, NFR-003 tests
- [ ] T6 (P6) Collecting notifier + outbox + transaction helper (C2 design), two atomicity tests
- [ ] T7 (P7) Persistence for solicitud-credito modules, write-back per D2 (size:exception candidate)
- [ ] T8 (P8) Student credit flow (1.1, 1.2)
- [ ] T9 (P9) Advisor flow (1.3)
- [ ] T10 (P10) Loan terms + calendar generation (3.1) (size:exception candidate)
- [ ] T11 (P11) Scholarship part 1 (2.1): applications, eligibility run, `scholarship_awards`
- [ ] T12 (P12) Scholarship part 2 (2.2): committee queue, member id in audit_log
- [ ] T13 (P13) Scholarship UI + student status page (2.3)
- [ ] T14 (P14) Disbursement execution (3.2)
- [ ] T15 (P15) Overdue job + manual trigger (3.3)
- [ ] T16 (P16) Notifications inbox UI
- [ ] T17 (P17) Reports (4.1, 4.2) + per-period threshold config
- [ ] T18 (P18) Hardening: NFR-002 perf test (10,000 records), cross-role visibility sweep, README, end-to-end smoke

## Route declaration
- T0: delegated direct (writer drafts the change proposal and edits; trigger: preparation + 2+ non-trivial docs).
- T1-T18: delegated direct, one writer per slice (to be recorded per task as built).

## Review (RDD)
Native review assessed per work-unit commit; the user's consent per candidate is theirs. Record tier and outcome per task below.

## Progress / evidence
- Plan approved (Judgment Day, 2 rounds) and committed: `dd873a0` on `docs/web-app-plan`.
- `/sw:change` scope check done: new epic, confirmed by the user. Review mode for `bmad-correct-course`: Batch.

- T0 done (delegated writers: proposal drafter, then applier). User approved the proposal ("build everything") with the plan's defaults for Q1-Q5 (assumed, not answered). Evidence: `npm test` 94/94; `openspec validate --all --strict` 22/22 (18 new changes + 4 specs); `src/` unchanged; epics.md now has 29 stories (18 new); bridge accepted NFR ids in `**FRs:**` (warnings "no narrativa As a/I want" are a bridge language limitation shared by Epics 1-4); `trace.json` global requirement arrays still empty (finding in the proposal 4.d, per-change requirements are filled).
- Review: planning docs are passive/documentation; openspec change folders are the executable-looking part, assessed at commit time per work unit.
- Commits on `docs/web-app-plan`: proposal, PRD+epics, architecture-base, bridge output (see git log).
- Assumed defaults (user did not answer): Q1 Node built-ins + node:sqlite + server-rendered HTML; Q2 advisor executes disbursements; Q3 metadata-only documents; Q4 student starts the scholarship application and enters `promedioAcumulado`; Q5 default assignment rule from the plan.

- T0 review: `assess` medium, 3,544 changed lines (docs + generated changes), `review_due` = `slice_budget_reached`; consent v3 relayed to the user, who chose "Skip this time" (`declined_this_candidate`, target sha256:beb81d77...); decline invocation run once and validated. Outcome: declined.
- T1 (delegated writer, branch `feat/e5s1-servidor-http`): RED observed (`Cannot find module './errores'`), GREEN 112/112 via `npm test` (94 old + 18 new, no hang); `openspec validate e5s1 --strict` valid; parent verified a real server: `/health` 200, unknown path 404, exit 0 on SIGTERM. `npm start` and `engines >=22.5` added.
  - Decisions: error mapping table keyed by module `.codigo` (400/403/404/409; `CONFIGURACION_INVALIDA` and unknown -> 500 `ERROR_INTERNO`, never leaks message/stack); `ESTADO_INVALIDO` mapped to 409 with a note (persistence slice should throw `estadoHttp: 404` for not found); `.estadoHttp` override honoured; unregistered method on a known path -> 404 (not 405); teardown closes idle and all connections.

## Next step
T2 (P2, change `e5s2-...`) via delegated writer on a new branch stacked on `feat/e5s1-servidor-http`.
