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
- [x] T2 (P2) DB: sqlite connection, migrations runner, clock, `audit_log`
- [x] T3 (P3) Identity: seeded users, async scrypt, sessions, login/logout, session rotation, login throttling
- [x] T4 (P4) Web security baseline: escaping, CSRF, cookie flags, body size limit, request timeout
- [x] T5 (P5) Visibility and ownership: assignments, default rule for Q5, policy functions, NFR-003 tests
- [x] T6 (P6) Collecting notifier + outbox + transaction helper (C2 design), two atomicity tests
- [x] T7 (P7) Persistence for solicitud-credito modules, write-back per D2 (size:exception candidate)
- [x] T8 (P8) Student credit flow (1.1, 1.2)
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

- T1 commit f110bfd: assess medium, 417 lines, `review_due` = `slice_budget_reached`; consent v3 relayed, user chose "Skip this time" (`declined_this_candidate`, target sha256:78e07717...), decline run once and validated. Outcome: declined.
- RDD: the user asked to stop review prompts ("desactiva las revisiones"); ran `gentle-ai review mode disable --scope clone --cwd .` -> `off (decided by clone_local)` (global stays on). From T2 on there is no `assess`/review step; functional checks and parent spot checks remain. Re-enable with `gentle-ai review mode enable --scope clone --cwd .`.
- T2 (delegated writer, branch `feat/e5s2-base-de-datos`): RED observed (`Cannot find module './baseDeDatos'`), GREEN 127/127 via `npm test` (112 + 15 new); `openspec validate e5s2 --strict` valid. Parent verified: migrations apply `[1]` then `[]` (idempotent); DELETE and UPDATE on `audit_log` blocked by SQLite triggers (append-only). `node:sqlite` loads unflagged on v26.8.1 without warning; `engines` raised to `>=22.13` (unverified from docs, conservative); `data/` added to .gitignore.
  - Decisions: migrations live in `src/infra/versiones/` (a `./migraciones` dir would clash with `migraciones.js`); each migration in its own BEGIN/COMMIT with ROLLBACK; `abrirBaseDeDatos({ruta, entorno})` path order ruta > DB_PATH > `data/app.db`, foreign_keys always, WAL only for files; `aplicada_en` uses the real clock, not the injected one.

- T2 commit 1ec9310. RDD is off for this clone, so no review assessment from T2 on.
- T3 (delegated writer, branch `feat/e5s3-identidad`): RED observed (3 failures: `Cannot find module './contrasenas'` / `'./sembrado'`), GREEN 148/148 via `npm test` (127 + 21 new); `openspec validate e5s3 --strict` valid. Parent real run on a temp DB: login 200 with `HttpOnly; SameSite=Lax` cookie, `/me` 200 with cookie and 401 without, two logins give different session ids (rotation), 6th failed attempt -> 429 and the lockout also blocks the correct password, no plaintext password in the DB file, SIGTERM exit 0.
  - Decisions: migration 002 (`usuarios` with CHECK on the 4 roles, `sesiones.id` = SHA-256 of the token); async scrypt + `timingSafeEqual`; seed has no default passwords (`SEED_PASSWORD_*` or random printed once); guards `requerirSesion` / `requerirRol(...)` wrap router handlers; errors carry `.codigo` + `.estadoHttp` so P1 `mapearError` maps 401/403/429/413/400; throttling per `usuario|IP`, in-memory, sliding window, checked BEFORE verifying the password; unknown user verified against a cached dummy hash; audit `login_exitoso` / `login_fallido` / `logout`.
  - Hand-off to P4 (security baseline): replace the 16 KiB body reader local to `autenticacion.js` with the shared one; cap/sanitise the attacker-controlled username stored by `login_fallido`; harden cookie flags (Secure when applicable); CSRF; escaping; request timeout.

- T3 commit 206deb8.
- T4 (delegated writer, branch `feat/e5s4-seguridad-web`): RED observed (`Cannot find module './csrf'` / `'./html'`), GREEN 170/170 via `npm test` (148 + 22 new; first GREEN run had 1 failure `403 !== 404` because CSRF ran before route resolution, fixed by checking CSRF after resolving the route); `openspec validate e5s4 --strict` valid. Parent real run: security headers 4/4 on `/health`; 200 KB body -> 413; malformed JSON -> 400; cross-site `Sec-Fetch-Site` login -> 403; logout without token -> 403, with wrong token -> 403, with the right token -> 200, `/me` afterwards -> 401; SIGTERM exit 0.
  - Decisions: escaping helper `html` (escapes by default, explicit marker for trusted raw); CSRF = HMAC-SHA256 of the session id with `CSRF_SECRET` (>=16 chars, else a random per-process secret, single-instance, warned in the log), token in header `x-csrf-token` or form field `_csrf`, exposed in the login response body and `GET /csrf`; `/login` exempt from CSRF but protected by an Origin/Sec-Fetch-Site same-origin check (no headers = accepted, non-browser clients); shared body reader (64 KiB, cached per request, `Connection: close` on 413); timeouts injectable (headers 15 s, request 30 s, keep-alive 5 s, socket 60 s, handler 20 s -> 408/503); cookie helper (HttpOnly, SameSite=Lax, Secure with HTTPS, `X-Forwarded-Proto` only if `TRUST_PROXY=1`, or `COOKIE_SECURE=1`); `login_fallido` username sanitised and capped at 64 chars.
  - Behavior change from P3: `POST /logout` without a session is now 403 (was 200) because all state-changing requests need session + CSRF.
  - Process deviation: the writer edited some files with Python scripts instead of Edit/Write; results verified by the parent (tests, validation, live run).
  - Hand-off to P18 (README): document `CSRF_SECRET`, `TRUST_PROXY`, `COOKIE_SECURE`, `DB_PATH`, `PORT`, `SEED_PASSWORD_*`.

- T4 commit 792771b.
- T5 (delegated writer, branch `feat/e5s5-visibilidad`): RED observed (`Cannot find module './asignaciones'`), GREEN 220/220 via `npm test` (170 + 50 new); `openspec validate e5s5 --strict` valid; business modules untouched. Parent check of the projection with the real factory `crearPoliticas({asignaciones})`: for a request with all 5 socioeconomic fields (plus a nested snake_case one), `estudiante` and `asesor_financiero` see them, `comite_becas`, `direccion_academica` and an unknown role see none; the input is not mutated.
  - Decisions: migration 003 `asignaciones` (UNIQUE tipo_recurso+recurso_id+usuario_id); `crearAsignaciones` with `asignar`, `reclamar` (advisor only, 409 `SOLICITUD_YA_ASIGNADA` if held by another), `asignarComiteACaso` (Q5 default: all active committee users, idempotent; committee users created later are not assigned to existing cases), `estaAsignado`, `listarPorRecurso`; audit entry `asignar` only for new assignments; policies are a factory `crearPoliticas` (puedeVerSolicitud / puedeVerCasoComite / puedeVerEstadoEvaluacion / puedeVerReportes / proyectarSolicitud / proyectarEvaluacion); fail-closed projection (unknown roles and direccion_academica never get socioeconomic fields, nested and lists included, snake_case and case variants); denied == not found (404 `RECURSO_NO_ENCONTRADO`, identical bodies), role mismatch on a route stays 403 (put `requerirRol` first); guard `requerirAccesoARecurso(cargar, {permitir, proyectar})`; student mapping: `usuario.estudianteId` if present else the user id as a string (users have no estudianteId yet).
  - Size: ~900 added lines, mostly tests (NFR-003 table test = 20 cases) -> `size:exception` candidate at PR time.

- T5 commit 3198b3c.
- T6 (delegated writer, branch `feat/e5s6-notificador-outbox`): RED observed (`Cannot find module './notificadorColector'` / `'./transaccion'`), GREEN 240/240 via `npm test` (220 + 20 new; first GREEN pass had 1 failure because the wrapper discarded the promise returned by an async `persistir`, fixed with an explicit thenable check); `openspec validate e5s6 --strict` valid; business modules untouched. Parent independent check with the REAL `crearEjecucionDesembolso` + collector + `ejecutarCasoDeUso`: state and outbox row commit together (`ejecutado`, `desembolso/solicitud/s1`); module throws after mutating -> state still persisted and the error propagates; `persistir` fails -> nothing committed (state stays `programado`, 0 outbox rows added); notifier outside a use case throws `NOTIFICADOR_SIN_CONTEXTO`.
  - Design (resolves Judgment Day C2 and residual items 1 and 2): collecting notifier implements all 4 port methods and only records payloads in memory; per-use-case isolation with `AsyncLocalStorage` (modules built once, no per-call construction, no payload mixing across awaits); `enTransaccion(db, fn)` is synchronous (async `fn` or async `persistir` rejected with `TRANSACCION_ASINCRONA`); `ejecutarCasoDeUso({db, colector, reloj, operacion, persistir})` persists state + outbox in ONE synchronous transaction even if the operation threw; both failing -> persistence error thrown with the original in `error.errorOperacion`; `entregarPendientes` delivers outside any transaction, failure increments `intentos` / `ultimo_error` and never reverts state; migration 004 `notifications` (recipient rules: envio/decision -> estudiante, caso_limitrofe -> rol comite_becas, desembolso -> solicitud id, resolved to the student by the inbox slice).

- T6 commit b32f9f6.
- T7 (delegated writer, branch `feat/e5s7-persistencia-solicitudes`): RED observed (3 test files failing with `Cannot find module '../unidadDeTrabajo'`), GREEN 276/276 via `npm test` (240 + 36 new); `openspec validate e5s7 --strict` valid; no existing test file modified (parent checked `git status`: only new test files). Parent independent check with the REAL modules + SQLite repos + unit of work + `ejecutarCasoDeUso`: after submit `pendiente_revision` (2 `envio` outbox rows), after decisions `aprobada` / `rechazada`; reloading from SQLite in a fresh unit of work gives the same state, the rejection history `{asesor, motivo}` and the decision `fecha` as a `Date`; `listarPorEstado` and `listarPorEstudiante` work; outbox has `decision:2, envio:2`.
  - Design: optional `repositorio` constructor option on the three modules, default = in-memory ports reproducing today's behavior (same Maps, same live objects); unit of work with identity map + dirty checking (`src/infra/unidadDeTrabajo.js`) flushed by `ejecutarCasoDeUso` (new optional `unidadDeTrabajo`) inside the same single synchronous transaction as `persistir` and the outbox inserts, parents before children; per-use-case isolation via AsyncLocalStorage (`UNIDAD_DE_TRABAJO_SIN_CONTEXTO` outside a use case); SQLite read-your-writes (list queries merge DB rows with the unit's pending state); migration 005 (`solicitudes`, `documentos_solicitud` with autoincrement id for insertion order, `decisiones_solicitud`); contract suite runs against in-memory AND SQLite repos.
  - Limitations: SQLite repos need `creadaEn` as an ISO string; no optimistic concurrency (last flush wins, documented); in-memory returns shared live objects, SQLite fresh objects per unit of work.
  - Flaky test found by the parent (not by the writer): P4's `seguridad.test.js` "token ... alterado" failed ~1 in 16 runs because it replaced the last hex char of the CSRF token with `0` (identical when the token already ended in `0`). Test bug, not a CSRF hole. Fixed (always pick a different character), verified 40 consecutive runs + 3 full-suite runs, committed separately.
  - Size: far above 400 lines (mostly tests) -> declared `size:exception` candidate (plan forecast ~440).

- T7 commits e5f5a95 (flaky test fix) + be1502e.
- T8 (delegated writer, branch `feat/e5s8-flujo-estudiante`): RED observed (`Cannot find module './contextoApp'` / `'./aplicacionWeb'`), GREEN 299/299 on two consecutive full runs (276 + 23 new); `openspec validate e5s8 --strict` valid. Only ONE existing test changed: `autenticacion.test.js` form-login test 200 -> 303 + `Location: /solicitudes` (required by the P8 redirect; all JSON login tests untouched). Parent independent real run with curl + cookie jars on a temp DB: anonymous `/solicitudes` -> 303 to `/login`; `/login` 200; form login 303; create -> 303 to detail; 3 document attaches 303; `<script>alert(1)</script>` in the occupation field rendered escaped (no raw tag); submit 303; list shows `pendiente_revision`; resubmit 409; POST without `_csrf` 403; advisor on `/solicitudes` and on the student's detail 403; CSP + X-Frame-Options + nosniff present on HTML; outbox has one `envio` row for `estudiante`; SIGTERM exit 0.
  - Design: `src/app/` (`contextoApp.js` builds collector + SQLite repos + the 3 real modules + asignaciones + politicas once; `servicioSolicitudes.js` use cases each in `ejecutarCasoDeUso` with its own unit of work), `src/web/` pages (`vistas.js`, `paginas.js`, `aplicacionWeb.js`, `estilos.css` served by an explicit route `GET /estilos.css`, no generic static server), `GET /login` page, `GET /` redirect, form login redirects 303 (JSON login keeps 200). Statuses: duplicate request 409; validation/missing docs/invalid format 400; resend on an already sent request 409; other student's request 404; no session -> redirect to `/login`; CSRF failure stays the JSON 403.
  - Field rules chosen (spec silent): estrato integer 1-6, dependents 0-30, income non-negative, file names without path separators/control chars; the login form carries no CSRF token by design (P4: origin check on `/login`).
  - Known smell: `src/app` imports `crearPoliticas` from `src/web` (layering: politicas should live in `src/app`); `HEAD /estilos.css` -> 404 (router only registers GET).
  - Size ~1,350 lines (views, tests, CSS) -> `size:exception` for the PR slice (forecast was ~380).

## Next step
T9 (P9, change `e5s9-...`) advisor flow (1.3): queue, claim, decide, via delegated writer on a new branch stacked on `feat/e5s8-flujo-estudiante`.
