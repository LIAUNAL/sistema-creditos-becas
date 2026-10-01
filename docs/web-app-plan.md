# Plan: web app for the credits and scholarships system

Status: approved by Judgment Day after 2 correction rounds (see the appendix at the end for the outcome and the known residual items). Nothing in this plan has been implemented yet.

State of the repo when this plan was written: 11 business-logic modules in `src/` (CommonJS, all state in memory, no HTTP, no UI, no persistence, no auth), 94 passing tests (`npm test` = `node --test src/`), zero dependencies, Node v26.8.1 (`node:sqlite` loads).
Binding project artifacts that exist: `_bmad-output/planning-artifacts/prd.md` (draft), `_bmad-output/planning-artifacts/epics.md`, `openspec/specs/*` (4 capabilities). Artifacts that do NOT exist: architecture spine, UX design/experience. `docs/architecture-base.md` is an empty template (stack, persistence, auth, layering all undecided).

## 1. Goal
A user can run `npm start`, open a browser and use the credits and scholarships system through four roles: student, financial advisor, scholarship committee member, academic direction member. The existing modules stay the source of business rules; the web app adds transport, persistence, identity and screens around them.

## 2. Verified facts that shape the design (from a read-only mapping of the code)
F1. State lives in private in-memory structures: `RegistroSolicitudCredito._solicitudes` (Map), `EnvioSolicitudCredito._documentos`, `DecisionAsesorFinanciero._decisiones`, `CalendarioDesembolso._desembolsos`, committee cases in a closure Map inside `crearRevisionComite`. `calcularElegibilidad`, `consultarEstadoEvaluacion`, `generarReporteConsolidado`, `calcularTasaMora`/`generarAlertaTasaMora` are pure functions.
F2. Several modules return LIVE references and other modules mutate them (`confirmarEnvio`, `ejecutar`, `revisar` mutate the stored objects). The committee module returns copies.
F3. Notification ports are four different methods: `notificarEnvio`, `notificarDecision` (not validated in the envio constructor), `notificarCasoLimitrofe`, `notificarDesembolso`.
F4. Data gaps between modules: a solicitud has no `monto`, `numeroCuotas`, `tipoCredito`, `promedioAcumulado`; `CalendarioDesembolso.generar` needs `monto`, `numeroCuotas` and an external `fechaPrimeraCuota`; desembolsos produced by `generar` carry no `periodoAcademico` (needed by `calcularTasaMora` and set by `revisar` only when given in options); `vencimientoDesembolso` reads `tipoCredito` from the desembolso and no module copies it there; `generarReporteConsolidado` expects `becas: {periodoAcademico, estado:'otorgada'}` records that nothing produces; the committee case stores `estudiante: caso.estudiante` as passed (unvalidated, a different field name, no period) and `registrarDecision` takes no member id; `calcularElegibilidad` needs `promedioAcumulado`, which no module captures; student id is named `estudianteId`, `idEstudiante` and `estudiante` in different modules.
F5. Dates are mixed: `Date` objects (decisions, committee history), ISO timestamps (`creadaEn`), `YYYY-MM-DD` strings (desembolsos).
F6. Stories 2.1 and 3.3 are system actions with no defined trigger; story 3.1 defines one (generate the calendar when a credit is approved, epics.md:178) but not the inputs (see F4). Epic 1 blocks Epic 3 (only approved credits get disbursements). The scholarship flow (Epic 2) has no "scholarship application" entity or creation story.
F7. PRD requirements that bind the web layer: NFR-001 every approval/rejection/escalation recorded with author and date (Must); NFR-002 consolidated report < 5 s with up to 10,000 records (Should); NFR-003 socioeconomic data visible only to the financial advisor and committee assigned to the case (Must); out of scope: payment/bank integration, e-signature, guarantor portal.
F8. `EnvioSolicitudCredito` stores only the file name of a document, no bytes.

## 3. Decisions (proposed defaults; the user has not chosen a stack)
D1 Stack: Node built-ins only (`node:http`, `node:sqlite`, `node:crypto`, `node:test`), server-rendered HTML from template functions, no build step, no dependencies; `package.json` gets an `engines` field for `node:sqlite` (P1). Tradeoff vs Express + React: no ecosystem and a hand-rolled router, but it matches the zero-dependency CommonJS repo and keeps every slice small.
D2 Persistence with explicit write-back: SQLite file via `node:sqlite`. Because of F1/F2 a repository port alone is NOT enough: modules mutate live objects returned by `registro.obtener()` (`confirmarEnvio`, `_decidir`) and stateless `ejecutar`/`revisar` mutate the desembolsos passed in, so with SQLite those changes would be silently lost. Rules:
- Every mutation site persists in the same `src/app/` use case through an explicit `save`/`actualizar` call on the repository port, inside a `try/finally` so the mutated state is saved even when the module call throws after mutating. Modules that own a repository may call it additively (no-op in the default in-memory implementation, so existing tests stay green); the app use case, not the module, owns the persistence step for stateless `ejecutar`/`revisar` and for the async paths `confirmarEnvio`, `_decidir` and `procesarResultado`.
- Collecting notifier (per use case): the module receives a notifier that only records the notification payload in memory (synchronous, never throws, never touches the DB). After the module call (success or throw), the use case persists in `finally` and, in ONE synchronous transaction that does not span an `await`, saves the mutated state AND inserts the collected payloads as outbox rows. The notifier adapter never inserts into the DB from inside the module call, so an outbox row can never exist for state that was not saved, or the reverse.
- Notifier-failure policy: once a module has set a state it is final and is never rolled back by notification delivery or by a notifier error. Delivery of outbox rows is a separate step after commit (see R6). Today `ejecutar` sets state before awaiting the notifier (src/desembolso/ejecucionDesembolso.js:61-72); the collecting notifier plus `try/finally` persistence makes that ordering safe.
- Regression gate = the 94 existing tests PLUS per-transition "mutation persists" tests (state saved, reloaded from SQLite, same state observed) for `pendiente_revision`, `aprobada`, `rechazada`, `ejecutado`, `vencido`, PLUS two atomicity tests: "state persists when the module call throws after mutating" (for `ejecutar`) and "state and outbox row commit together or not at all".
- Rejected alternative: hydrate-per-request (rebuild modules from rows each request) because the modules expose no seeding API.
D3 Auth: seeded users table, scrypt password hashes, HttpOnly + SameSite cookie sessions stored in SQLite, role guard middleware for the four roles. Not a production identity provider.
D4 UX: no UX artifacts exist. v1 uses minimal accessible server-rendered pages. If product wants a designed UI, run the BMAD UX step first (this plan does not block on it but flags it).
D5 System-action triggers: 2.1 runs when a scholarship application is submitted; 3.1 runs when the advisor approves a credit and supplies amount, installments and first installment date; 3.3 runs from an in-process daily timer plus a manual endpoint for direction/advisor.
D6 Notifications: a per-use-case collecting notifier implementing all four port methods; each method only records its payload in memory (synchronous, never throws, no DB access). The app use case writes the collected payloads as rows of a `notifications` outbox table inside the single synchronous transaction that also saves the mutated state (D2), shown as an in-app inbox. Delivery/marking-as-read is a separate step after commit. Built before the first module that needs a notifier (P6). No email.
D7 Scope control: this is new scope. Before coding, run `/sw:change` to add an "Epic 5: Web application" with stories to the PRD/epics and bridge them to OpenSpec changes; fill `docs/architecture-base.md` with D1-D3 so they become binding.

## 4. Architecture
Layers (dependency direction web -> app -> existing modules; infra implements ports; existing modules never import app/infra/web):
- `src/<capability>/` existing modules (additive repository ports with explicit write-back per D2, plus list/query read methods).
- `src/app/` use cases that orchestrate modules, persist in `try/finally` (state + collected outbox rows in one synchronous transaction), and own the cross-module bridges below.
- `src/infra/` sqlite connection + migrations, repositories, collecting notifier and outbox writer/delivery, clock, scheduler.
- `src/web/` router, auth, handlers, view templates, error mapping (module error `.codigo` -> HTTP status).
Cross-module bridges owned by `src/app/` (not by changing module semantics): canonical `studentId` mapped to each module's field name; loan terms stored in an app-level table and merged into the solicitud passed to `generar`; `periodoAcademico` and `tipoCredito` copied onto each desembolso at generation (the confirmation window is per credit type); a `scholarship_applications` table (student, period, academic and socioeconomic inputs, `promedioAcumulado`) feeding `calcularElegibilidad`; a `scholarship_awards` projection recording BOTH automatic `elegible` outcomes and committee `otorgada` decisions (with the application period), read by the consolidated report so automatic grants are counted (epics.md:142); an `audit_log` table recording actor, role, action, target, timestamp (satisfies NFR-001 because the modules do not record the committee member); date normalization to ISO strings at the JSON/HTML boundary.
Read models (ports get list/query methods; today only get-by-id exists): requests by student and by status (advisor queue, student's own requests), committee queue, desembolsos by period and by state (report and overdue inputs). The calendar's in-memory `errores` log gets a persisted `calendar_errors` table.
Visibility and ownership (NFR-003, designed in P5, tested in every slice that exposes data): a student sees only own resources; an advisor sees requests assigned to them; committee members see cases assigned to them; academic direction sees reports and no socioeconomic fields. Assignment is stored in an `assignments` table (default rule in Q5).

## 5. Slices (stacked PRs to main, tests with code, TDD RED first, `npm test` green before each commit)
Budget: 400 changed lines (additions + deletions, tests included). The forecast column is an estimate; a slice above 400 is a `size:exception` candidate (one honest slicing pass done; no further splitting without breaking cohesion). Order rule: collecting notifier + outbox (P6) precedes every module that needs a notifier; visibility rules (P5) precede the first slice that exposes data (P8).

| Slice | Content | Forecast (lines) |
|-------|---------|------------------|
| P0 | Docs/scope: `/sw:change` Epic 5 + stories, fill `docs/architecture-base.md` (docs only) | ~150 |
| P1 | Foundation: http server + router, error mapping, `/health`, `npm start`, `engines` field, server teardown rule (ephemeral port, closed in `after`), smoke test | ~300 |
| P2 | DB: sqlite connection, migrations runner, clock, `audit_log` table | ~250 |
| P3 | Identity: seeded users, async scrypt hashing, sessions in SQLite, login/logout, session rotation on login, login throttling, role guard | ~380 |
| P4 | Web security baseline: HTML escaping in templates, CSRF on POST, cookie flags (HttpOnly, SameSite, Secure when applicable), body size limit, request timeout | ~300 |
| P5 | Visibility and ownership: `assignments` table, default assignment rule (Q5), policy functions for the four roles, unit tests for NFR-003 (student own resources, assigned advisor/committee, direction without socioeconomic fields) | ~300 |
| P6 | Collecting notifier + outbox: per-use-case notifier recording all four port methods in memory (never throws, no DB), `notifications` table, one synchronous transaction helper that saves state and inserts collected rows (`try/finally`), post-commit delivery step; tests: "state persists when the module call throws after mutating" (generic, with a throwing module stub) and "state and outbox row commit together or not at all", plus contract test | ~340 |
| P7 | Persistence for solicitud-credito modules (registro, envio, decision): repositories, list/query ports, write-back per D2 (use cases persist in `try/finally` with the collecting notifier for `confirmarEnvio` and `_decidir`; state + outbox rows in one transaction), contract tests on in-memory and sqlite, "mutation persists" tests for `pendiente_revision`, `aprobada`, `rechazada`, and "state and outbox row commit together or not at all" for those transitions | ~440 (size:exception candidate) |
| P8 | Student credit flow (1.1, 1.2): create request, attach documents (metadata), submit; pages + routes; visibility tests (student sees only own requests) | ~380 |
| P9 | Advisor flow (1.3): queue, decide; visibility tests (assigned advisor only; no socioeconomic fields to direction) | ~350 |
| P10 | Loan terms + calendar generation (3.1) on approval: terms table, `periodoAcademico`/`tipoCredito` copied onto desembolsos, calendar repository with write-back, persisted `calendar_errors` | ~420 (size:exception candidate) |
| P11 | Scholarship backend part 1 (2.1): `scholarship_applications`, eligibility run, `scholarship_awards` for automatic `elegible`; visibility tests | ~380 |
| P12 | Scholarship backend part 2 (2.2): committee case repository with write-back, queue, member id in `audit_log`, `otorgada` into `scholarship_awards`; visibility tests (assigned committee only) | ~380 |
| P13 | Scholarship UI + student status page (2.3) | ~300 |
| P14 | Disbursement execution (3.2): use case persists in `try/finally` after stateless `ejecutar` with the collecting notifier (state + outbox row in one transaction); tests: "mutation persists" for `ejecutado`, "state persists when the module call throws after mutating" (`ejecutar` with a throwing notifier), "state and outbox row commit together or not at all"; visibility tests | ~360 |
| P15 | Overdue (3.3): use case persists in `try/finally` after `revisar` (state + any collected outbox rows in one transaction; "state and outbox row commit together or not at all" where `revisar` notifies), "mutation persists" test for `vencido`, in-process daily timer (`unref()` or injected teardown) + manual endpoint | ~330 |
| P16 | Notifications inbox UI (own notifications only) | ~200 |
| P17 | Reports (4.1 consolidated reading `scholarship_awards`, 4.2 mora alert) + per-period threshold configuration | ~380 |
| P18 | Hardening: NFR-002 performance test with 10,000 records, cross-role visibility sweep, README run guide, end-to-end smoke test of one credit from request to executed disbursement | ~300 |

## 6. Testing strategy
`node:test`, colocated `*.test.js`; SQLite repositories tested on `:memory:`; HTTP tests against a real server on an ephemeral port using built-in `fetch`; contract tests shared by in-memory and sqlite repositories; the existing 94 tests plus the per-transition "mutation persists" tests (D2) and the two atomicity tests ("state persists when the module call throws after mutating" for `ejecutar`, and "state and outbox row commit together or not at all") must stay green after every slice (introduced in P6/P7/P14/P15); visibility tests (NFR-003) run in every slice that exposes data; timers and servers started by tests must be `unref()`'d or torn down so `node --test src/` never hangs.

## 7. Risks
R1 Retrofitting repository ports into modules that mutate live references (F2) may change behavior or silently lose state; mitigated by explicit write-back (D2), the 94-test regression gate and the per-transition "mutation persists" tests.
R2 `node:sqlite` stability/experimental warnings on the target Node versions; `engines` field in P1.
R3 Hand-rolled HTTP security, each item owned by a slice with an acceptance test: HTML escaping (P4: a script payload renders escaped), CSRF on POST (P4: POST without token is rejected), cookie flags (P4: Set-Cookie carries HttpOnly and SameSite), request body size limit (P4: oversized body gets 413), request timeout (P4: stalled request is closed), session rotation on login (P3: session id changes after login), login throttling (P3: repeated failures get 429), async scrypt (P3: hashing uses `crypto.scrypt` callback/promise, not `scryptSync`).
R4 Authorization correctness for NFR-003 ("assigned" advisor/committee) because no assignment concept exists in the modules or specs.
R5 In-process scheduler (3.3) is not multi-instance safe and depends on the server running.
R6 Concurrency and atomicity: SQLite via synchronous `node:sqlite` on one connection. No transaction spans an `await`: the module receives a collecting notifier that only records payloads in memory (never throws, no DB access); the use case then persists in `try/finally` and, in ONE synchronous transaction, saves the mutated state and inserts the collected outbox rows, so they commit together or not at all and state is saved even if the module call throws after mutating. Delivery is a separate step after commit (relevant to `revisionComite`, `ejecutar`, `confirmarEnvio`, `_decidir` and `procesarResultado`, which await the notifier). Covered by the two atomicity tests in the regression gate.
R7 Open product questions below can invalidate slices P9-P15.

## 8. Open questions for the user
Q1 Stack: accept D1-D3 or choose another (Express/React/Postgres)?
Q2 Who executes a disbursement (story 3.2 has no actor)? Default proposed: the financial advisor role.
Q3 Document upload: modules store only file names (F8). Store file bytes on disk in v1, or metadata only?
Q4 How is a scholarship application started and who enters `promedioAcumulado`?
Q5 How are advisors/committee members "assigned" to a case (NFR-003)? Default assignment rule until answered: an advisor claims an unassigned credit request (recorded in `assignments` and `audit_log`); every committee member is assigned to every committee case.

## 9. Out of scope
Payment/bank integration, e-signature, guarantor portal (PRD), email delivery, production identity provider, native/mobile apps.

## 10. Done when
`npm start` serves the app; the four roles can complete their stories end to end; all PRD Must NFRs have tests; `npm test` green; PRs stacked and each <= 400 changed lines, except slices with an accepted `size:exception` (P7 at ~440 and P10 at ~420 are candidates).

## Appendix: Judgment Day outcome

Verdict: APPROVED after 2 correction rounds (two blind judges, no refuter).

- Round 1 confirmed 1 severe issue (C1: the persistence ports are not "additive", because modules mutate live objects and the state changes would be lost with SQLite) and 1 severity contradiction (automatic scholarship grants were missing from the report projection), plus 7 warnings both judges agreed on. All were corrected in v2.
- Round 2 found a residual of C1 (C2: if the notifier throws, the app layer never saves the state; the outbox row was not atomic with the state). It was corrected in v3 with a per-use-case collecting notifier, `try/finally` persistence and one synchronous transaction.
- The final re-judgment by both judges found no CRITICAL issue.

Known residual items (informational, not corrected because the correction budget was exhausted; fix them when this plan becomes OpenSpec changes):

1. P14's test says "throwing notifier", but the collecting notifier never throws; the throw must come from a throwing module stub, as P6 says.
2. The plan does not say how the per-use-case collecting notifier reaches the modules; every module receives its notifier once at construction (`envioSolicitud.js`, `decisionAsesor.js`, `revisionComite.js`, `ejecucionDesembolso.js`). State that the module is built per call, or that the collector is passed or reset per call.
3. The committee path (P12), and P10/P11 if they notify, do not yet carry the collecting-notifier and `try/finally` treatment.
4. R6 says `confirmarEnvio` and `_decidir` await the notifier; they call it synchronously (only `ejecutar` and `procesarResultado` await). D2 also names the file `ejecutarDesembolso.js`; the real file is `src/desembolso/ejecucionDesembolso.js`.

Single-judge round 1 items kept as notes: account provisioning for real users, the NFR-001 actor and audit entry for system escalations, how the NFR-002 performance test is designed, ambiguous module error codes (`ESTADO_INVALIDO` for "not found" and "wrong state"), approval being committed before the loan terms are validated, storage of the eligibility configuration and the re-run flow for incomplete data, and a per-slice OpenSpec change.
