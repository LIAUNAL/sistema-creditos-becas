---
title: "Sistema de Créditos y Becas — Sprint Change Proposal 2026-10-01"
status: draft-pending-approval
created: 2026-10-01
project: sistema-creditos-becas
workflow: bmad-correct-course
mode: Batch
scope: Major
input_plan: docs/web-app-plan.md
document_output_language: Spanish
---

# Sprint Change Proposal — Epic 5: Aplicación web

> Este documento SOLO propone cambios. Ningún artefacto (`prd.md`, `epics.md`, `docs/architecture-base.md`, código) se modifica hasta que el usuario lo apruebe. Las ediciones de la sección 4 se aplican después de la aprobación.

## 1. Issue Summary

**Disparador.** Requerimiento nuevo de stakeholders confirmado por el usuario vía `/sw:change`: agregar un **Epic 5: Aplicación web**. No lo reveló una story concreta; surge de que el sistema hoy no es utilizable por ninguno de sus cuatro roles.

**Categoría (checklist 1.2).** Nuevo requerimiento emergente de stakeholders.

**Problema.** El repositorio contiene 11 módulos de lógica de negocio (`src/`, CommonJS, estado 100% en memoria) con 94 pruebas verdes y cero dependencias, pero no tiene servidor HTTP, persistencia, identidad ni pantallas. Ni el estudiante, ni el asesor financiero, ni el comité de becas, ni dirección académica pueden usar los flujos de los Epics 1-4.

**Evidencia** (de `docs/web-app-plan.md`, aprobado por Judgment Day tras 2 rondas de corrección):

- F1/F2: el estado vive en estructuras privadas en memoria (`Map` en `RegistroSolicitudCredito`, `_documentos`, `_decisiones`, `_desembolsos`, closure en `crearRevisionComite`) y varios módulos devuelven referencias VIVAS que otros mutan (`confirmarEnvio`, `ejecutar`, `revisar`).
- F4: hay brechas de datos entre módulos (la solicitud no tiene `monto`, `numeroCuotas`, `tipoCredito`, `promedioAcumulado`; los desembolsos no llevan `periodoAcademico`; el id del estudiante se llama `estudianteId`, `idEstudiante` y `estudiante`).
- F6: las stories 2.1 y 3.3 son acciones de sistema sin disparador definido; no existe entidad "solicitud de beca".
- F7: el PRD tiene NFR-001, NFR-002 y NFR-003 que atan a la capa web, pero ningún FR de aplicación web, autenticación o roles, ni NFR de seguridad web.
- `package.json` solo define `"test": "node --test src/"`; no hay `npm start`.

**Estado del repo verificado al redactar:** `epics.md` = 4 epics y 11 stories; `docs/architecture-base.md` es la plantilla vacía; no existen artefactos de arquitectura ni de UX; no existe `sprint-status.yaml`; `.un-specweaver/trace.json` tiene los arreglos `requirements` de nivel raíz vacíos (ver 4.d).

## 2. Impact Analysis

### 2.1 Epic Impact

| Epic | Impacto |
|------|---------|
| Epics 1-4 (completos, 11 stories, specs archivadas) | Sin cambios de alcance ni de criterios. Se vuelven la fuente de las reglas de negocio que el Epic 5 envuelve. Sus módulos reciben únicamente puertos de repositorio **aditivos** (no-op en la implementación en memoria por defecto). |
| Epic 5 (nuevo) | 18 stories (5.1-5.18), una por slice P1-P18 del plan. **Depende de:** Epics 1-4. **Bloquea a:** nada. |
| Orden/prioridad | Epic 5 va al final; las stories 5.x son una cadena apilada (stacked PRs). |

Ningún epic queda obsoleto. No se elimina ni se renumera nada.

### 2.2 Story Impact

- Stories 1.1-4.2 existentes: **sin edición**. Las stories 5.x referencian su comportamiento por ID.
- Stories nuevas: 5.1-5.18. P0 del plan (este cambio documental) no es story: es el propio `/sw:change` + relleno de `docs/architecture-base.md`.
- Brechas que las stories 5.x cierran sin cambiar la semántica de los módulos (plan F4/F6, sección 4 del plan): puentes en `src/app/` (id canónico del estudiante, términos del crédito, `periodoAcademico`/`tipoCredito` copiados al desembolso, `scholarship_applications`, `scholarship_awards`, `audit_log`, normalización de fechas).

### 2.3 Artifact Conflicts

| Artefacto | Conflicto / acción |
|-----------|--------------------|
| `prd.md` | No tiene FR de web/UI/autenticación/roles, ni NFR de seguridad web, ni integridad de datos persistidos. Las secciones 3.3 y 7 no aclaran qué queda fuera (correo, proveedor de identidad productivo). Se proponen FR-040..FR-052, NFR-004..NFR-006, OBJ-05 y filas nuevas de fuera de alcance (4.a). No hay conflicto con los objetivos OBJ-01..OBJ-04: el MVP no se reduce, se completa. |
| `epics.md` | Agregar Epic 5, actualizar diagrama de dependencias, tabla Traza FR → Story y el pie (4 epics/11 stories pasa a 5 epics/29 stories) (4.b). |
| Arquitectura | No existe documento de arquitectura. `docs/architecture-base.md` es plantilla vacía y "manda sobre lo que el agente asuma por defecto" (su propio encabezado). Se propone llenarla con D1-D3 y la arquitectura del plan (4.c). |
| UX | No existe artefacto de UX. El plan (D4) usa páginas mínimas accesibles renderizadas en servidor y no bloquea por UX; se marca como acción pendiente (checklist 3.3). |
| Otros | `package.json` (`engines`, `start`) se toca en P1/5.1. No hay CI/CD ni IaC en el repo (verificado: sin pipeline detectable). `trace.json` y `sprint-plan.md` se regeneran con el bridge tras aprobar (4.d). |

### 2.4 Technical Impact

- Aditivo: nuevas carpetas `src/app/`, `src/infra/`, `src/web/`; migraciones SQLite; `package.json` con `engines` y `scripts.start`.
- Los 11 módulos existentes solo ganan puertos de repositorio aditivos con write-back explícito (D2); el comportamiento por defecto en memoria no cambia. **Las 94 pruebas existentes DEBEN seguir verdes tras cada slice** (compuerta de regresión), más pruebas nuevas "mutation persists" por transición y dos de atomicidad.
- Cero dependencias externas (`node:http`, `node:sqlite`, `node:crypto`, `node:test`); Node v26.8.1 verificado por el plan.
- Riesgos del plan: R1 (retrofit de puertos sobre referencias vivas), R2 (`node:sqlite` experimental), R3 (seguridad HTTP artesanal), R4 (correctitud de autorización "asignado"), R5 (planificador en proceso no multi-instancia), R6 (atomicidad sin transacción a través de `await`), R7 (preguntas abiertas pueden invalidar P9-P15).

## 3. Recommended Approach

**Camino elegido (checklist 4.4): Opción 1 — Direct Adjustment.** Agregar un epic nuevo sin tocar el plan existente.

| Opción | Estado | Esfuerzo | Riesgo | Nota |
|--------|--------|----------|--------|------|
| 1. Direct Adjustment (nuevo Epic 5) | Viable, **recomendada** | Alto | Medio | Aditivo; no reabre trabajo cerrado. |
| 2. Potential Rollback | No viable | n/a | n/a | No hay nada que revertir; Epics 1-4 siguen siendo válidos y son la base de reglas. |
| 3. MVP Review | No viable | n/a | n/a | El MVP no se reduce: la web app es el medio de entrega de lo ya definido. Recortar solo aplicaría si el usuario decide no construir la web. |

**Justificación.** El plan fue aprobado por dos jueces ciegos; preserva los módulos como fuente de reglas, mantiene cero dependencias y cada slice cabe en ~400 líneas. Descartado en el plan: Express/React/Postgres (Q1, sigue abierta) y hidratar por petición (los módulos no exponen API de siembra).

**Esfuerzo.** 18 slices (P1-P18) más P0 documental. Pronóstico del plan: ~6.090 líneas cambiadas en P1-P18 (suma de las estimaciones) más ~150 de P0, es decir ~6.240 en total. Dos slices por encima de 400: P7 (~440) y P10 (~420), candidatos `size:exception`.

**Riesgo.** Medio, concentrado en R1/R6 (persistencia con referencias vivas y atomicidad) y R3 (seguridad HTTP artesanal). Mitigación: write-back explícito, notificador colector, transacción síncrona única, compuerta de 94 pruebas, y una prueba de aceptación por cada ítem de seguridad.

**Impacto en cronograma.** Ninguno sobre Epics 1-4 (cerrados). El Epic 5 es secuencial (cadena apilada con dependencias P1→P18, con P6 antes de todo módulo que notifica y P5 antes del primer slice que expone datos). El plan no estima duración en tiempo; **no se inventa un cronograma** (supuesto: se mide en slices/PRs). Las preguntas abiertas Q2-Q5 pueden invalidar P9-P15 (R7), por lo que conviene resolverlas antes de comenzar P9.

**Impacto en MVP.** El PRD v0.1.0 describía el flujo digital completo pero sin canal de uso; el cambio lo habilita. Se afecta el MVP en el sentido de ampliarlo con un canal de entrega, no de reducirlo.

## 4. Detailed Change Proposals

### 4.a PRD — `_bmad-output/planning-artifacts/prd.md`

**Edición PRD-1 — Frontmatter**

OLD:
```
updated: 2026-09-27
...
version: 0.1.0
```
NEW:
```
updated: 2026-10-01
...
version: 0.2.0
```
Rationale: el requerimiento nuevo cambia el alcance; sube versión menor.

**Edición PRD-2 — Sección 1 Resumen ejecutivo (agregar al final del párrafo)**

OLD (última oración): `... y reportería consolidada para la dirección académica.`

NEW: `... y reportería consolidada para la dirección académica. Estos flujos se ofrecen mediante una aplicación web con identidad y roles (estudiante, asesor financiero, comité de becas y dirección académica), persistencia y notificaciones dentro de la aplicación.`

Rationale: el resumen no menciona ningún canal de uso.

**Edición PRD-3 — Sección 3.2 Objetivos específicos (fila nueva)**

OLD: la tabla termina en
`| OBJ-04 | Reportería consolidada y alertas de mora para dirección académica | Reporte por periodo disponible en <5 s |`

NEW: se agrega debajo
`| OBJ-05 | Aplicación web con identidad y roles para los flujos de las Capacidades 1-4 | Los cuatro roles completan sus flujos de punta a punta desde el navegador con `npm start` |`

Rationale: da objetivo medible al Epic 5. La métrica proviene de "Done when" del plan.

**Edición PRD-4 — Sección 3.3 No-objetivos**

OLD:
`Pasarela de pagos externa, integración bancaria en tiempo real, firma electrónica de contratos, portal de terceros (avalistas) en esta versión.`

NEW:
`Pasarela de pagos externa, integración bancaria en tiempo real, firma electrónica de contratos, portal de terceros (avalistas), envío de correo electrónico, proveedor de identidad productivo (SSO/OAuth) y aplicaciones nativas o móviles en esta versión.`

Rationale: el plan (sección 9) los excluye explícitamente; sin esta aclaración el agente los propone repetidamente.

**Edición PRD-5 — Sección 5: nueva "Capacidad 5 — Aplicación web" (insertar después de la Capacidad 4 y antes de la sección 6)**

OLD (cierre actual de la Capacidad 4):
```
| **FR-031** | El sistema DEBE emitir una alerta cuando la tasa de mora o vencimiento de un periodo supera el umbral definido por dirección académica. | Must | Epic 4, Story 4.2 |
```

NEW (se conserva la fila anterior y se agrega):
```
### Capacidad 5 — Aplicación web

| ID | Requisito | Prioridad | Traza |
|----|-----------|-----------|-------|
| **FR-040** | El sistema DEBE autenticar usuarios con credenciales propias y mantener sesiones, con un rol único entre estudiante, asesor financiero, comité de becas y dirección académica, con cierre de sesión. | Must | Epic 5, Story 5.3 |
| **FR-041** | El sistema DEBE restringir cada pantalla y operación al rol autorizado y a los casos asignados o propios, y DEBE mantener la asignación de asesores y comité a cada caso. | Must | Epic 5, Stories 5.5, 5.9, 5.12 |
| **FR-042** | El sistema DEBE permitir que un estudiante cree, complete, adjunte documentos y envíe a revisión su solicitud de crédito desde el navegador. | Must | Epic 5, Story 5.8 |
| **FR-043** | El sistema DEBE permitir que un asesor financiero consulte su cola de solicitudes y las apruebe o rechace con motivo desde el navegador. | Must | Epic 5, Story 5.9 |
| **FR-044** | El sistema DEBE capturar monto, número de cuotas y fecha de la primera cuota al aprobar un crédito y generar el calendario de desembolsos con periodo académico y tipo de crédito. | Must | Epic 5, Story 5.10 |
| **FR-045** | El sistema DEBE permitir registrar una solicitud de beca con datos socioeconómicos y académicos y ejecutar la evaluación de elegibilidad al enviarla. | Must | Epic 5, Story 5.11 |
| **FR-046** | El sistema DEBE ofrecer a cada integrante del comité de becas su cola de casos asignados y permitir registrar la decisión final con comentario. | Must | Epic 5, Story 5.12 |
| **FR-047** | El sistema DEBE ofrecer al estudiante una pantalla con el estado de su evaluación de beca. | Must | Epic 5, Story 5.13 |
| **FR-048** | El sistema DEBE permitir ejecutar un desembolso programado a un actor autorizado (por defecto, el asesor financiero) y notificar al estudiante. | Must | Epic 5, Story 5.14 |
| **FR-049** | El sistema DEBE ejecutar la revisión de desembolsos vencidos de forma periódica y bajo demanda manual para dirección académica o asesor financiero. | Must | Epic 5, Story 5.15 |
| **FR-050** | El sistema DEBERÍA ofrecer a cada usuario una bandeja de notificaciones dentro de la aplicación, con acceso solo a las propias. | Should | Epic 5, Stories 5.6, 5.16 |
| **FR-051** | El sistema DEBE ofrecer a dirección académica el reporte consolidado y la alerta de mora en pantalla, con umbral configurable por periodo. | Must | Epic 5, Story 5.17 |
| **FR-052** | El sistema DEBE iniciarse con `npm start` y conservar su estado entre reinicios en una base de datos local. | Must | Epic 5, Stories 5.1, 5.2, 5.7 |
```
Rationale: continúa la numeración existente por capacidad (FR-001/010/020/030 y ahora 040). Cada FR cubre una slice o grupo; ninguno agrega comportamiento más allá del plan. Supuestos marcados: FR-045 (quién ingresa `promedioAcumulado`, Q4), FR-048 (actor, Q2), FR-041 (regla de asignación, Q5).

**Edición PRD-6 — Sección 6 Requisitos no funcionales (filas nuevas)**

OLD: la tabla termina en
`| **NFR-003** | Privacidad de datos socioeconómicos | Los datos socioeconómicos del estudiante solo son visibles para el asesor financiero y el comité de becas asignados al caso. | Must |`

NEW: se agregan
```
| **NFR-004** | Seguridad web | Toda salida HTML escapa contenido de usuario; toda solicitud POST exige token CSRF; las cookies de sesión llevan HttpOnly y SameSite; el cuerpo de petición tiene límite (413); las peticiones detenidas se cierran por timeout; la sesión rota al iniciar sesión; los fallos repetidos de login se limitan (429); las contraseñas se almacenan con scrypt asíncrono. | Must |
| **NFR-005** | Integridad y persistencia | El estado de cada transición y sus notificaciones se confirman juntos o no se confirman (una transacción síncrona); el estado se conserva aunque el módulo falle tras mutar; los datos sobreviven un reinicio. | Must |
| **NFR-006** | Compatibilidad de regresión | Las pruebas existentes de los módulos (94 al 2026-10-01) DEBEN permanecer verdes en cada PR; `npm test` no se bloquea por servidores o temporizadores abiertos. | Must |
```
Rationale: NFR-004 y NFR-005 derivan de R3 y R6/D2; NFR-006 de la compuerta de regresión del plan.
**No se propone NFR de disponibilidad** (SLO/uptime): el plan no define ninguno. El plan reconoce el planificador en proceso como no multi-instancia (R5); queda como supuesto de despliegue de instancia única. Si el usuario requiere disponibilidad, es una decisión de producto nueva.

**Edición PRD-7 — Sección 7 Fuera de alcance (filas nuevas)**

OLD: la tabla termina en
`| Portal para avalistas o terceros | No forma parte del alcance del piloto |`

NEW: se agregan
```
| Envío de correo electrónico | Las notificaciones se muestran dentro de la aplicación (bandeja); no hay entrega por correo en esta versión |
| Proveedor de identidad productivo (SSO/OAuth/LDAP) | La autenticación v1 usa usuarios sembrados con contraseñas hasheadas; no es un proveedor de identidad productivo |
| Aplicaciones nativas o móviles | La entrega v1 es web renderizada en servidor |
| Alta de usuarios reales (aprovisionamiento de cuentas) | El plan lo registra como nota sin resolver; v1 usa usuarios sembrados |
```
Se mantienen las tres filas existentes (pasarela de pagos, firma electrónica, portal de avalistas). Rationale: la sección 9 del plan; la última fila sale de "account provisioning for real users" (notas de un solo juez), que el plan no resuelve (ver gaps).

### 4.b Epics — `_bmad-output/planning-artifacts/epics.md`

**Edición EP-1 — Frontmatter:** `updated: 2026-09-27` a `updated: 2026-10-01`.

**Edición EP-2 — Insertar Epic 5 completo** después del final de la Story 4.2 y antes de `## Dependencias entre stories` (texto exacto abajo, formato idéntico a los Epics 1-4).

**Edición EP-3 — Sección "Dependencias entre stories"**

OLD (último ítem de la lista):
`- **Epic 4** depende de Epic 1, 2 y 3 (consolida créditos, becas y desembolsos vencidos por periodo).`

NEW: se agrega debajo
`- **Epic 5** depende de Epic 1, 2, 3 y 4 (envuelve sus módulos en una aplicación web); sus stories forman una cadena apilada 5.1 a 5.18, con 5.6 antes de toda story que notifica y 5.5 antes de la primera que expone datos (5.8).`

Y el diagrama (se añade debajo del existente):
```
4.2 ─→ 5.1 ─→ 5.2 ─→ 5.3 ─→ 5.4 ─→ 5.5 ─→ 5.6 ─→ 5.7 ─→ 5.8 ─→ 5.9 ─→ 5.10
5.10 ─→ 5.11 ─→ 5.12 ─→ 5.13 ─→ 5.14 ─→ 5.15 ─→ 5.16 ─→ 5.17 ─→ 5.18
```

**Edición EP-4 — Tabla Traza FR → Story (filas nuevas)**

OLD: la tabla termina en `| FR-031 | 4.2 |`

NEW: se agregan
```
| FR-040 | 5.3 |
| FR-041 | 5.5, 5.9, 5.12 |
| FR-042 | 5.8 |
| FR-043 | 5.9 |
| FR-044 | 5.10 |
| FR-045 | 5.11 |
| FR-046 | 5.12 |
| FR-047 | 5.13 |
| FR-048 | 5.14 |
| FR-049 | 5.15 |
| FR-050 | 5.6, 5.16 |
| FR-051 | 5.17 |
| FR-052 | 5.1, 5.2, 5.7 |
```
Nota: NFR-004, NFR-005 y NFR-006 se citan en el campo `**FRs:**` de las stories técnicas 5.1-5.7 y 5.18. El formato existente solo cita FR-XXX; no se verificó si el bridge acepta NFR-XXX en ese campo (checklist [!]).

**Edición EP-5 — Criterios de listo (DoD)** (agregar viñeta)

NEW: `- Para el Epic 5: `npm test` verde (las 94 pruebas previas más las nuevas), prueba de visibilidad (NFR-003) en cada story que expone datos, y PR de aproximadamente 400 líneas cambiadas o menos.`

**Edición EP-6 — Pie**

OLD: `*Epics derivados del PRD `prd.md` — 4 epics, 11 stories.*`
NEW: `*Epics derivados del PRD `prd.md` — 5 epics, 29 stories.*`

**Texto exacto del Epic 5 (EP-2):**

````markdown
## Epic 5: Aplicación web

**Objetivo:** ofrecer una aplicación web, ejecutable con `npm start`, que permita a los cuatro roles (estudiante, asesor financiero, comité de becas y dirección académica) completar los flujos de los Epics 1-4 con identidad y roles, persistencia, notificaciones dentro de la aplicación, visibilidad restringida de datos socioeconómicos (NFR-003) y trazabilidad de decisiones (NFR-001), sin cambiar las reglas de negocio de los módulos existentes.

**Incluye:** servidor HTTP, base de datos SQLite con migraciones, autenticación y roles, línea base de seguridad web, asignación de casos, notificador colector con bandeja de salida, persistencia de los módulos con escritura explícita, pantallas de los flujos de crédito, beca, desembolso y reportes, bandeja de notificaciones y verificación de punta a punta.

**Depende de:** Epic 1, Epic 2, Epic 3 y Epic 4 (envuelve sus módulos). **Bloquea a:** nada.

### Story 5.1: Fundación del servidor HTTP

**Description:** Como equipo de desarrollo, quiero un servidor HTTP con enrutador, mapeo de errores, endpoint de salud y comando de arranque, para tener la base sobre la que se construyen las pantallas.

**FRs:** FR-052, NFR-006

**Acceptance Criteria:**

- **Given** el proyecto instalado
  **When** se ejecuta `npm start`
  **Then** el servidor escucha y `GET /health` responde 200.

- **Given** un manejador que lanza un error de módulo con `.codigo`
  **When** se atiende la petición
  **Then** el servidor responde con el estado HTTP mapeado a ese código y no expone la traza.

- **Given** una ruta inexistente
  **When** se la solicita
  **Then** el servidor responde 404.

- **Given** la prueba de humo que levanta el servidor en un puerto efímero
  **When** termina la prueba
  **Then** el servidor se cierra en `after` y `node --test src/` no queda colgado.

**Notas técnicas:** plan P1, D1 (solo built-ins de Node, sin dependencias, sin paso de build). `package.json` gana `engines` para `node:sqlite` (R2) y `scripts.start`. Regla de cierre de servidor y puerto efímero (sección 6 del plan). Las 94 pruebas existentes deben seguir verdes.

---

### Story 5.2: Base de datos, migraciones y registro de auditoría

**Description:** Como sistema, quiero una conexión SQLite con ejecutor de migraciones, reloj inyectable y tabla `audit_log`, para persistir datos y registrar autor y fecha de cada decisión.

**FRs:** FR-052, NFR-001, NFR-005

**Acceptance Criteria:**

- **Given** una base de datos nueva
  **When** se ejecuta el ejecutor de migraciones dos veces
  **Then** las tablas existen y la segunda ejecución no cambia el esquema ni falla.

- **Given** un reloj inyectado con una fecha fija
  **When** se escribe una entrada en `audit_log`
  **Then** la entrada guarda actor, rol, acción, objetivo y la fecha ISO del reloj.

- **Given** el servidor reiniciado con el mismo archivo de base de datos
  **When** se leen las entradas de `audit_log`
  **Then** las entradas previas siguen presentes.

**Notas técnicas:** plan P2, D1, D2, sección 4 (`audit_log` satisface NFR-001 porque los módulos no registran al miembro del comité). Pruebas sobre `:memory:`. Fechas normalizadas a ISO en el borde (plan F5).

---

### Story 5.3: Identidad: usuarios, sesiones y guardia de roles

**Description:** Como usuario del sistema, quiero iniciar y cerrar sesión con mi rol, para acceder solo a lo que me corresponde.

**FRs:** FR-040, NFR-004

**Acceptance Criteria:**

- **Given** un usuario sembrado con contraseña hasheada
  **When** envía credenciales correctas
  **Then** el sistema crea una sesión en SQLite y el identificador de sesión es distinto del anterior al login (rotación).

- **Given** credenciales incorrectas repetidas más allá del límite
  **When** envía otro intento
  **Then** el sistema responde 429.

- **Given** un usuario con rol `estudiante`
  **When** solicita una ruta restringida al rol `asesor_financiero`
  **Then** el sistema responde 403.

- **Given** un usuario sin sesión
  **When** solicita una ruta protegida
  **Then** el sistema responde 401 o redirige al login.

- **Given** una sesión activa
  **When** el usuario cierra sesión
  **Then** la sesión se elimina y el mismo identificador deja de ser válido.

**Notas técnicas:** plan P3, D3 (usuarios sembrados, scrypt, cookies HttpOnly + SameSite con sesión en SQLite; no es un proveedor de identidad productivo), R3. La prueba de scrypt verifica el uso de la variante asíncrona (callback o promesa), no `scryptSync`. Aprovisionamiento de cuentas reales no está resuelto por el plan (ver gaps del proposal).

---

### Story 5.4: Línea base de seguridad web

**Description:** Como equipo de desarrollo, quiero un conjunto de protecciones web básicas, para que ninguna pantalla posterior nazca vulnerable.

**FRs:** NFR-004

**Acceptance Criteria:**

- **Given** una plantilla que renderiza un valor de usuario con `<script>`
  **When** se genera el HTML
  **Then** el script aparece escapado y no como etiqueta ejecutable.

- **Given** una petición POST sin token CSRF válido
  **When** llega al servidor
  **Then** el servidor la rechaza con 403.

- **Given** una respuesta que establece la cookie de sesión
  **When** se inspecciona `Set-Cookie`
  **Then** incluye HttpOnly y SameSite (y Secure cuando aplica).

- **Given** un cuerpo de petición mayor al límite configurado
  **When** llega al servidor
  **Then** el servidor responde 413.

- **Given** una petición que se detiene sin completar el cuerpo
  **When** vence el tiempo límite
  **Then** el servidor cierra la conexión.

**Notas técnicas:** plan P4, R3 (cada ítem tiene su prueba de aceptación). Depende de 5.3 por la cookie de sesión.

---

### Story 5.5: Visibilidad y asignación de casos

**Description:** Como sistema, quiero una tabla de asignaciones y funciones de política por rol, para que los datos socioeconómicos solo los vean los asignados al caso.

**FRs:** FR-041, NFR-003

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** la política evalúa el acceso a un recurso de otro estudiante
  **Then** deniega el acceso.

- **Given** un asesor financiero asignado a una solicitud
  **When** la política evalúa el acceso a esa solicitud
  **Then** lo permite; para una solicitud no asignada a él, lo deniega.

- **Given** un integrante del comité asignado a un caso
  **When** la política evalúa el acceso a ese caso
  **Then** lo permite; sin asignación, lo deniega.

- **Given** un integrante de dirección académica
  **When** la política proyecta una solicitud
  **Then** el resultado no incluye campos socioeconómicos.

**Notas técnicas:** plan P5, R4, Q5. Regla de asignación por defecto, pendiente de confirmar (Q5): un asesor reclama una solicitud sin asignar (registrado en `assignments` y `audit_log`); todo integrante del comité queda asignado a todo caso del comité. Debe quedar terminada antes del primer slice que expone datos (5.8).

---

### Story 5.6: Notificador colector y bandeja de salida (outbox)

**Description:** Como sistema, quiero un notificador por caso de uso que registre los avisos en memoria y una transacción única que guarde estado y avisos, para que nunca exista un aviso sin su estado ni al revés.

**FRs:** FR-050, NFR-005

**Acceptance Criteria:**

- **Given** un notificador colector
  **When** un módulo invoca `notificarEnvio`, `notificarDecision`, `notificarCasoLimitrofe` y `notificarDesembolso`
  **Then** cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos.

- **Given** un módulo stub que muta el estado y luego lanza una excepción
  **When** el caso de uso lo invoca con el ayudante transaccional
  **Then** el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga.

- **Given** una transacción síncrona que guarda estado y filas del outbox
  **When** una de las dos escrituras falla
  **Then** ninguna de las dos queda confirmada (todo o nada).

- **Given** filas de outbox confirmadas
  **When** corre el paso de entrega posterior al commit
  **Then** las filas pasan a la tabla `notifications` y la entrega no revierte el estado.

- **Given** el contrato del puerto de notificación
  **When** corre la prueba de contrato
  **Then** el colector implementa los cuatro métodos con la firma que cada módulo espera.

**Notas técnicas:** plan P6, D2, D6, R6. Prueba genérica "el estado persiste cuando el módulo lanza tras mutar" con un STUB de módulo que lanza (el colector nunca lanza). Residual de Judgment Day #2: esta story DEBE definir cómo llega el colector a los módulos (los módulos reciben el notificador una vez en el constructor), por ejemplo construyendo el módulo por llamada o pasando/reiniciando el colector por llamada; el plan no lo decide. Ninguna transacción abarca un `await`.

---

### Story 5.7: Persistencia de los módulos de solicitud de crédito

**Description:** Como sistema, quiero repositorios SQLite para registro, envío y decisión de solicitudes con escritura explícita, para que las transiciones de estado sobrevivan al reinicio.

**FRs:** FR-052, NFR-005, NFR-006

**Acceptance Criteria:**

- **Given** los repositorios en memoria y SQLite
  **When** corre la misma suite de contrato
  **Then** ambas implementaciones se comportan igual (guardar, obtener, listar por estudiante y por estado).

- **Given** una solicitud que pasa a `pendiente_revision`, `aprobada` o `rechazada` mediante el caso de uso
  **When** se recarga desde SQLite
  **Then** se observa el mismo estado en cada una de las tres transiciones.

- **Given** la confirmación de envío o la decisión del asesor con el notificador colector
  **When** el caso de uso termina
  **Then** estado y filas de outbox se confirman juntos o no se confirman.

- **Given** el conjunto de pruebas existente
  **When** corre `npm test`
  **Then** las 94 pruebas previas siguen verdes con los puertos aditivos (no-op en memoria por defecto).

**Notas técnicas:** plan P7, D2 (el caso de uso, no el módulo, posee el paso de persistencia en `try/finally`; los módulos devuelven referencias vivas, plan F2), R1. Candidata `size:exception`: pronóstico ~440 líneas (por encima del presupuesto de ~400; el plan hizo una pasada de partición honesta y no se divide más sin romper cohesión). Residual #4: `confirmarEnvio` y `_decidir` llaman al notificador de forma síncrona (solo `ejecutar` y `procesarResultado` hacen `await`).

---

### Story 5.8: Flujo del estudiante: solicitud de crédito

**Description:** Como estudiante, quiero crear mi solicitud de crédito, adjuntar documentos y enviarla a revisión desde el navegador, para iniciar el proceso de evaluación financiera.

**FRs:** FR-042, FR-001, FR-002

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** completa y envía el formulario de solicitud
  **Then** se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista.

- **Given** una solicitud `borrador` con los tres documentos adjuntos (metadatos)
  **When** el estudiante confirma el envío
  **Then** el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox.

- **Given** una solicitud `borrador` sin certificado de ingresos
  **When** el estudiante confirma el envío
  **Then** el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`.

- **Given** dos estudiantes con solicitudes distintas
  **When** el primero solicita la solicitud del segundo por URL
  **Then** el sistema responde 403 o 404 (visibilidad NFR-003).

**Notas técnicas:** plan P8, D2, D4 (páginas mínimas accesibles renderizadas en servidor), F8. Los documentos se guardan solo como metadatos (nombre de archivo): pendiente de confirmar (Q3) si se guardan los bytes en disco. El id del estudiante se mapea al campo de cada módulo (`estudianteId`, `idEstudiante`, `estudiante`) en `src/app/`.

---

### Story 5.9: Flujo del asesor financiero: cola y decisión

**Description:** Como asesor financiero, quiero ver mi cola de solicitudes y aprobarlas o rechazarlas con un motivo desde el navegador, para decidir el acceso al crédito.

**FRs:** FR-043, FR-041, FR-003, FR-004

**Acceptance Criteria:**

- **Given** solicitudes `pendiente_revision` sin asignar
  **When** un asesor reclama una
  **Then** queda asignada a él y se registra la asignación en `assignments` y `audit_log`.

- **Given** una solicitud asignada al asesor
  **When** la rechaza sin motivo
  **Then** el sistema bloquea la acción y exige el motivo.

- **Given** una solicitud asignada al asesor
  **When** la rechaza con motivo
  **Then** el estado pasa a `rechazada` y `audit_log` registra asesor, rol, acción y fecha.

- **Given** una solicitud asignada a otro asesor
  **When** este asesor intenta decidirla
  **Then** el sistema responde 403.

- **Given** un usuario de dirección académica
  **When** abre una solicitud
  **Then** no ve campos socioeconómicos.

**Notas técnicas:** plan P9, R4, Q5 (regla de asignación pendiente de confirmar). Reutiliza el colector y la persistencia con `try/finally` de 5.6 y 5.7. R7: una respuesta distinta a Q5 puede invalidar esta story.

---

### Story 5.10: Condiciones del crédito y calendario de desembolso

**Description:** Como asesor financiero, quiero registrar monto, cuotas y fecha de la primera cuota al aprobar un crédito, para que el sistema genere el calendario de desembolsos.

**FRs:** FR-044, FR-020

**Acceptance Criteria:**

- **Given** una solicitud `pendiente_revision` asignada al asesor
  **When** la aprueba con monto, número de cuotas y fecha de primera cuota válidos
  **Then** se guardan los términos y se genera un desembolso `programado` por cuota con `periodoAcademico` y `tipoCredito` copiados.

- **Given** una aprobación con monto cero o inválido
  **When** se intenta generar el calendario
  **Then** se rechaza, se registra el error en `calendar_errors` y no se crean desembolsos parciales.

- **Given** un crédito aprobado con calendario ya generado
  **When** se repite la aprobación
  **Then** no se duplican desembolsos.

- **Given** el calendario generado
  **When** se recarga desde SQLite
  **Then** los desembolsos conservan fecha, monto, periodo y tipo de crédito.

**Notas técnicas:** plan P10, D5 (3.1 se dispara al aprobar el asesor), F4. Plan sin resolver: la aprobación se confirma antes de validar los términos del crédito (nota de un solo juez); la story debe decidir el orden o declarar el supuesto. Candidata `size:exception`: ~420 líneas. Si este caso de uso notifica, debe llevar el notificador colector y la persistencia en `try/finally` (residual #3).

---

### Story 5.11: Becas, backend 1: solicitud y elegibilidad automática

**Description:** Como estudiante, quiero registrar una solicitud de beca y que el sistema calcule mi elegibilidad, para saber si accedo a la beca.

**FRs:** FR-045, FR-010

**Acceptance Criteria:**

- **Given** un estudiante autenticado
  **When** envía una solicitud de beca con datos académicos y socioeconómicos, incluido `promedioAcumulado`
  **Then** se guarda en `scholarship_applications` y se ejecuta el cálculo de elegibilidad.

- **Given** un resultado `elegible`
  **When** termina el cálculo
  **Then** se registra una fila en `scholarship_awards` con el periodo de la solicitud.

- **Given** una solicitud sin `promedioAcumulado`
  **When** se ejecuta el cálculo
  **Then** el caso queda `datos_incompletos` y no se genera decisión automática.

- **Given** dos estudiantes
  **When** uno consulta la solicitud de beca del otro
  **Then** el sistema responde 403 o 404.

**Notas técnicas:** plan P11, D5, F4, Q4 (cómo se inicia la solicitud de beca y quién ingresa `promedioAcumulado`: el plan no define el origen; esta story asume, SUPUESTO, que el estudiante lo ingresa; pendiente de confirmar (Q4)). La proyección `scholarship_awards` registra TAMBIÉN las `elegible` automáticas para que el reporte 4.1 las cuente (epics.md, Story 2.2 / reporte). Si notifica, lleva el tratamiento del colector (residual #3). El plan no define el flujo de reejecución para datos incompletos ni dónde se guarda la configuración de umbrales (notas de un solo juez).

---

### Story 5.12: Becas, backend 2: comité y otorgamiento

**Description:** Como integrante del comité de becas, quiero ver mis casos limítrofes y registrar la decisión con comentario, para decidir con criterio humano.

**FRs:** FR-046, FR-041, FR-011

**Acceptance Criteria:**

- **Given** un caso clasificado `limitrofe`
  **When** se ejecuta la evaluación
  **Then** aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox.

- **Given** un caso en la cola
  **When** un integrante registra `otorgada` o `denegada` con comentario
  **Then** se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud.

- **Given** un usuario del comité no asignado al caso
  **When** intenta abrirlo
  **Then** el sistema responde 403.

- **Given** una decisión registrada
  **When** se recarga desde SQLite
  **Then** el estado y el comentario persisten.

**Notas técnicas:** plan P12, R4, Q5 (por defecto, todo integrante del comité está asignado a todo caso; pendiente de confirmar). `registrarDecision` no recibe id de integrante, por eso el autor se registra en `audit_log` (NFR-001). El módulo guarda `estudiante: caso.estudiante` sin validar, con otro nombre de campo y sin periodo (plan F4): el puente en `src/app/` lo normaliza. Residual #3: esta story DEBE llevar el tratamiento de notificador colector y persistencia en `try/finally` con estado y outbox en una transacción (`revisionComite` espera al notificador). El módulo devuelve copias (plan F2). Sin trigger de sistema definido para escalamientos: el actor de `audit_log` para escalamientos del sistema no está resuelto en el plan.

---

### Story 5.13: Interfaz de becas y estado del estudiante

**Description:** Como estudiante, quiero ver el estado de mi evaluación de beca en pantalla, para saber si necesito aportar más información.

**FRs:** FR-047, FR-012

**Acceptance Criteria:**

- **Given** una evaluación en curso
  **When** el estudiante abre su página de estado
  **Then** ve `elegible`, `no_elegible`, `limitrofe en revisión` o `datos_incompletos` y no el puntaje numérico.

- **Given** una evaluación `datos_incompletos`
  **When** el estudiante abre su estado
  **Then** la página indica qué datos faltan.

- **Given** un integrante del comité
  **When** abre la pantalla de la cola
  **Then** ve solo los casos asignados.

- **Given** un estudiante sin solicitud de beca
  **When** abre la página de estado
  **Then** ve un mensaje de que no hay evaluación, sin error.

**Notas técnicas:** plan P13, D4, R3 (escape de HTML en toda plantilla). La consulta es de solo lectura (Story 2.3).

---

### Story 5.14: Ejecución de desembolso

**Description:** Como asesor financiero, quiero ejecutar un desembolso programado y que el estudiante sea notificado, para confirmar que el dinero fue liberado.

**FRs:** FR-048, FR-021

**Acceptance Criteria:**

- **Given** un desembolso `programado`
  **When** el actor autorizado lo ejecuta
  **Then** el estado pasa a `ejecutado`, se recarga igual desde SQLite y se guarda un aviso en el outbox.

- **Given** un módulo de ejecución que muta el estado y luego lanza una excepción (STUB que lanza)
  **When** el caso de uso termina
  **Then** el estado `ejecutado` queda persistido.

- **Given** la ejecución con el notificador colector
  **When** una de las escrituras de estado u outbox falla
  **Then** ninguna se confirma (todo o nada).

- **Given** un estudiante
  **When** intenta ejecutar un desembolso
  **Then** el sistema responde 403; y un estudiante solo ve sus propios desembolsos.

**Notas técnicas:** plan P14, D2, D6, R6, Q2 (actor de ejecución, por defecto el asesor financiero; pendiente de confirmar (Q2)). Residual #1: el plan dice "notificador que lanza", pero el colector nunca lanza; la excepción DEBE provenir de un STUB de módulo que lanza, como en 5.6. `ejecutar` es sin estado y establece el estado antes de `await` al notificador (`src/desembolso/ejecucionDesembolso.js`, línea del plan 61-72); la persistencia en `try/finally` más el colector lo hace seguro. El archivo real es `ejecucionDesembolso.js` (no `ejecutarDesembolso.js`).

---

### Story 5.15: Revisión de vencidos

**Description:** Como sistema, quiero marcar como vencidos los desembolsos no confirmados mediante un temporizador diario y un endpoint manual, para dar seguimiento a la mora.

**FRs:** FR-049, FR-022

**Acceptance Criteria:**

- **Given** un desembolso `programado` cuya fecha más el plazo ya pasó
  **When** corre la revisión
  **Then** pasa a `vencido` y el estado persiste al recargar desde SQLite.

- **Given** un desembolso confirmado dentro del plazo
  **When** corre la revisión
  **Then** permanece `ejecutado`.

- **Given** una revisión que genera avisos
  **When** el caso de uso termina
  **Then** estado y filas de outbox se confirman juntos o no se confirman.

- **Given** un usuario de dirección académica o asesor
  **When** invoca el endpoint manual
  **Then** corre la revisión y un estudiante recibe 403.

- **Given** el servidor detenido en una prueba
  **When** termina el proceso de pruebas
  **Then** el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado).

**Notas técnicas:** plan P15, D5 (temporizador en proceso más endpoint manual), R5 (no es seguro con múltiples instancias y depende de que el servidor esté en marcha). El caso de uso persiste en `try/finally` después de `revisar` (módulo sin estado que muta los desembolsos recibidos). Residual #3: si `revisar` notifica, lleva el tratamiento del colector. El plazo de confirmación es configurable por tipo de crédito (Story 3.3).

---

### Story 5.16: Bandeja de notificaciones

**Description:** Como usuario, quiero ver mis notificaciones dentro de la aplicación, para enterarme de decisiones y desembolsos sin correo.

**FRs:** FR-050

**Acceptance Criteria:**

- **Given** notificaciones entregadas para varios usuarios
  **When** un usuario abre su bandeja
  **Then** ve solo las propias.

- **Given** una notificación no leída
  **When** el usuario la marca como leída
  **Then** queda marcada y no cambia el estado de negocio asociado.

- **Given** un usuario sin notificaciones
  **When** abre la bandeja
  **Then** ve una lista vacía sin error.

**Notas técnicas:** plan P16, D6 (sin correo; entrega y marcado de leída son un paso posterior al commit). Ver la prueba de visibilidad NFR-003.

---

### Story 5.17: Reportes y umbral de mora

**Description:** Como integrante de dirección académica, quiero ver el reporte consolidado y la alerta de mora por periodo con un umbral configurable, para dar seguimiento al programa.

**FRs:** FR-051, FR-030, FR-031

**Acceptance Criteria:**

- **Given** un periodo con créditos aprobados, becas `elegible` automáticas y `otorgada` por el comité
  **When** dirección académica abre el reporte
  **Then** el total de becas cuenta ambos orígenes leyendo `scholarship_awards`.

- **Given** un periodo sin registros
  **When** se abre el reporte
  **Then** muestra todos los totales en cero, sin error.

- **Given** un umbral configurado por periodo y una tasa de mora superior
  **When** se recalcula la tasa
  **Then** se muestra la alerta con periodo, tasa y umbral.

- **Given** una tasa por debajo del umbral
  **When** se recalcula
  **Then** no se muestra alerta.

- **Given** un usuario que no es de dirección académica
  **When** solicita el reporte
  **Then** el sistema responde 403.

**Notas técnicas:** plan P17, sección 4 (el reporte lee la proyección `scholarship_awards`, de modo que las otorgadas automáticas se cuentan, consistente con la Story 4.1). Los desembolsos deben tener `periodoAcademico` (copiado en 5.10). Umbral por periodo: el plan no dice dónde se guarda (nota abierta).

---

### Story 5.18: Endurecimiento y verificación de punta a punta

**Description:** Como equipo de desarrollo, quiero pruebas de rendimiento, barrido de visibilidad entre roles y una prueba de punta a punta, para cerrar el epic con evidencia.

**FRs:** NFR-002, NFR-003, FR-052

**Acceptance Criteria:**

- **Given** 10.000 registros en el periodo
  **When** se genera el reporte consolidado
  **Then** tarda menos de 5 s.

- **Given** los cuatro roles y datos de varios estudiantes
  **When** corre el barrido de visibilidad
  **Then** ningún rol accede a recursos que no le corresponden.

- **Given** una base limpia
  **When** corre la prueba de humo de punta a punta
  **Then** un crédito pasa de solicitud a desembolso `ejecutado`.

- **Given** el README
  **When** un desarrollador sigue la guía de ejecución
  **Then** logra iniciar la aplicación con `npm start`.

**Notas técnicas:** plan P18, sección 10 ("Done when"). Diseño de la prueba de rendimiento NFR-002: el plan lo registra como nota sin resolver; la story debe definirlo (supuesto: base `:memory:` sembrada con 10.000 registros). Cierra la compuerta: 94 pruebas más las de transición y atomicidad verdes.

---
````

### 4.c Arquitectura — `docs/architecture-base.md`

Actualmente el archivo es la plantilla vacía (solo comentarios HTML bajo cada encabezado). Edición: reemplazar cada comentario por el siguiente contenido, derivado SOLO de `docs/web-app-plan.md`. El texto de introducción de la plantilla (la nota "Plantilla generada por `un-specweaver init`") puede conservarse.

Rationale: el propio archivo dice que "lo que este aqui manda sobre lo que el agente asuma por defecto"; sin esta edición el agente asume stack, persistencia y autenticación. D7 del plan exige llenarlo antes de codificar.

**Contenido propuesto:**

```markdown
## Stack por defecto

Decisión D1 — pendiente de confirmar (Q1); default del plan: aceptar D1-D3.

- Node v26.8.1 (versión verificada por el plan; el `package.json` declara `engines` para `node:sqlite`, se agrega en la story 5.1).
- Solo built-ins de Node: `node:http`, `node:sqlite`, `node:crypto`, `node:test`.
- CommonJS, cero dependencias externas, sin paso de build.
- HTML renderizado en servidor desde funciones de plantilla.
- Alternativa evaluada y no elegida por defecto: Express + React + Postgres (se decide en Q1).

## Estructura de proyecto

- `src/<capacidad>/`: módulos de negocio existentes (11). Reciben puertos de repositorio aditivos con escritura explícita y métodos de lista/consulta de solo lectura.
- `src/app/`: casos de uso que orquestran módulos, persisten en `try/finally` y poseen los puentes entre módulos.
- `src/infra/`: conexión SQLite y migraciones, repositorios, notificador colector y escritor/entrega del outbox, reloj, planificador.
- `src/web/`: enrutador, autenticación, manejadores, plantillas de vista y mapeo de errores (`.codigo` del módulo a estado HTTP).
- Pruebas `*.test.js` junto al código; `npm test` = `node --test src/`.

## Fronteras y capas

- Dirección de dependencia: web -> app -> módulos existentes; infra implementa los puertos.
- Los módulos existentes NUNCA importan `app`, `infra` ni `web`.
- Los puentes entre módulos viven en `src/app/` y no cambian la semántica de los módulos: id canónico `studentId` mapeado al campo de cada módulo (`estudianteId`, `idEstudiante`, `estudiante`); términos del crédito en una tabla de la aplicación mezclados en la solicitud que recibe `generar`; `periodoAcademico` y `tipoCredito` copiados a cada desembolso al generarlo; tabla `scholarship_applications` (incluye `promedioAcumulado`) que alimenta el cálculo de elegibilidad; proyección `scholarship_awards` que registra las `elegible` automáticas y las `otorgada` del comité; `audit_log`; normalización de fechas a ISO en el borde JSON/HTML.
- Ningún módulo se reescribe con otra semántica; sus pruebas existentes (94) son la compuerta de regresión.

## Persistencia

Decisión D2 — pendiente de confirmar (Q1); default del plan: SQLite con `node:sqlite`.

- Archivo SQLite con escritura explícita: un puerto de repositorio solo NO basta porque los módulos mutan referencias vivas (`confirmarEnvio`, `_decidir`) y los módulos sin estado (`ejecutar`, `revisar`) mutan los desembolsos recibidos.
- Cada punto de mutación persiste en el mismo caso de uso de `src/app/` con `save`/`actualizar` explícito dentro de `try/finally`, de modo que el estado se guarda aunque el módulo lance tras mutar.
- Notificador colector por caso de uso: solo registra el payload en memoria (síncrono, nunca lanza, no toca la base). Tras la llamada, el caso de uso guarda el estado y las filas del outbox en UNA transacción síncrona que no cruza un `await` (todo o nada).
- Política de fallos del notificador: un estado ya fijado nunca se revierte por la entrega ni por un error del notificador; la entrega del outbox es un paso posterior al commit.
- Migraciones con ejecutor propio; pruebas sobre `:memory:`.
- Tablas del plan: usuarios, sesiones, `audit_log`, `assignments`, `notifications` (outbox), `scholarship_applications`, `scholarship_awards`, términos del crédito, `calendar_errors`.
- Alternativa rechazada: hidratar por petición (los módulos no exponen API de siembra).
- Almacenamiento de archivos de documentos — pendiente de confirmar (Q3); default: solo metadatos (nombre de archivo), porque los módulos guardan solo el nombre.

## Autenticación y autorización

Decisión D3 — pendiente de confirmar (Q1).

- Tabla de usuarios sembrados, hash con scrypt asíncrono (nunca `scryptSync`), sesiones con cookie HttpOnly + SameSite guardadas en SQLite, rotación de sesión al iniciar sesión, limitación de intentos de login (429), middleware de guardia por rol para los cuatro roles (estudiante, asesor financiero, comité de becas, dirección académica).
- NO es un proveedor de identidad productivo.
- Autorización por caso (NFR-003): el estudiante solo ve sus recursos; el asesor ve solicitudes asignadas; el comité ve casos asignados; dirección académica ve reportes y ningún campo socioeconómico. Asignación en tabla `assignments` — pendiente de confirmar (Q5); default: un asesor reclama una solicitud sin asignar (registrado en `assignments` y `audit_log`) y todo integrante del comité está asignado a todo caso del comité.
- Aprovisionamiento de cuentas reales: el plan no lo resuelve (ver Fuera de alcance).

## Manejo de errores y observabilidad

- Los errores de módulo exponen `.codigo`; la capa web los mapea a estado HTTP sin exponer trazas.
- Hay códigos ambiguos en los módulos (`ESTADO_INVALIDO` cubre "no encontrado" y "estado incorrecto"); el plan lo anota como pendiente de resolver.
- `GET /health`.
- `audit_log` registra actor, rol, acción, objetivo y fecha por decisión (NFR-001); el comité no registra al integrante en el módulo, por eso el registro es de la aplicación.
- `calendar_errors` persiste el log de errores de generación de calendario (hoy en memoria).
- Formato de logs, correlation ids e instrumentación: el plan no los define (SUPUESTO: se deciden en la story 5.1 o se omiten en v1).

## Testing

- `node:test`, pruebas junto al código, TDD con RED primero, `npm test` verde antes de cada commit.
- Repositorios SQLite sobre `:memory:`; pruebas HTTP contra un servidor real en puerto efímero con `fetch` incorporado; pruebas de contrato compartidas entre repositorios en memoria y SQLite.
- Compuerta de regresión: las 94 pruebas existentes más pruebas "mutation persists" por transición (`pendiente_revision`, `aprobada`, `rechazada`, `ejecutado`, `vencido`) más dos pruebas de atomicidad: "el estado persiste cuando el módulo lanza tras mutar" (con un stub de módulo que lanza) y "estado y fila de outbox se confirman juntos o no se confirman".
- Pruebas de visibilidad (NFR-003) en cada slice que expone datos.
- Servidores y temporizadores de prueba con `unref()` o teardown para que `node --test src/` no se cuelgue.
- Presupuesto de PR: ~400 líneas cambiadas (adiciones más eliminaciones, pruebas incluidas); dos candidatas `size:exception` (5.7 y 5.10).

## Seguridad

Cada ítem tiene un dueño y una prueba de aceptación (R3): escape de HTML en plantillas (5.4), CSRF en POST (5.4), flags de cookie (5.4), límite de cuerpo 413 (5.4), timeout de petición (5.4), rotación de sesión (5.3), limitación de login 429 (5.3), scrypt asíncrono (5.3). Sin dependencias externas; secretos: el plan no define manejo de secretos (SUPUESTO: pendiente de decidir en la story 5.3).

## Decisiones cerradas

Formato: decisión — por qué — cuándo se tomaría de nuevo.

- Módulos de negocio como fuente de reglas; la web solo agrega transporte, persistencia, identidad y pantallas — evita reescribir lógica ya probada — si cambian las reglas de negocio del PRD.
- Persistencia con escritura explícita en el caso de uso, no en el módulo — los módulos mutan referencias vivas (R1) — si los módulos se rediseñan para no devolver referencias vivas.
- Notificador colector más outbox en una transacción síncrona — atomicidad sin transacción a través de `await` (R6) — si se pasa a una base con transacciones distribuidas o a una cola externa.
- Disparadores de acciones de sistema (D5): 2.1 al enviar la solicitud de beca; 3.1 cuando el asesor aprueba y entrega monto, cuotas y fecha de primera cuota; 3.3 por temporizador diario en proceso más endpoint manual — si hay despliegue multi-instancia (R5).
- Notificaciones solo dentro de la aplicación, sin correo (D6).
- UX: sin artefactos de UX; páginas mínimas accesibles (D4). Si el producto quiere una UI diseñada, correr primero el paso de UX de BMAD (el plan no bloquea por esto).
- Stack, persistencia y autenticación (D1-D3): pendiente de confirmar (Q1). Ejecutor del desembolso: pendiente de confirmar (Q2); default: asesor financiero. Almacenamiento de bytes de documentos: pendiente de confirmar (Q3). Origen de la solicitud de beca y de `promedioAcumulado`: pendiente de confirmar (Q4). Regla de asignación: pendiente de confirmar (Q5).

## Fuera de alcance

- Pasarela de pagos / integración bancaria, firma electrónica y portal de avalistas (PRD).
- Envío de correo electrónico.
- Proveedor de identidad productivo (SSO/OAuth/LDAP).
- Aplicaciones nativas o móviles.
- Ejecución multi-instancia del planificador (R5): el temporizador diario en proceso no es seguro con varias instancias.
- Express, React y Postgres no se usan por defecto (solo si Q1 los elige).
```

### 4.d `.un-specweaver/trace.json` — hallazgo y recomendación (no se edita)

**Hallazgo (verificado).** En `.un-specweaver/trace.json` los arreglos de nivel raíz `requirements.functional`, `requirements.nonFunctional`, `requirements.additional` y `requirements.ux` están vacíos. En cambio cada `changes[]` sí trae `requirements` poblado (p. ej. `["FR-001"]`, `["FR-002","FR-004"]`) y `requirementsFrom.story`, que el bridge extrae del campo `**FRs:**` de cada story. Por tanto la traza por change funciona, pero no hay inventario global de requisitos, ni `nonFunctional` con NFR-001..003. La traza FR a cobertura global que consume el dashboard no puede calcular cobertura de FR/NFR.

**Causa probable (suposición, no verificada: el bridge no está instalado localmente en el repo).** `epics.md` no tiene una sección de inventario de requisitos (el bridge de BMAD suele leerla de un bloque "Requirements Inventory"/FR Coverage que este `epics.md` no tiene).

**Recomendación para Epic 5.**
1. Tras aprobar, aplicar las ediciones de 4.a/4.b y correr `npx un-specweaver bridge`; verificar que las stories 5.1-5.18 aparezcan en `changes[]` con `requirements` poblado desde `**FRs:**`.
2. Verificar si el bridge acepta `NFR-xxx` en `**FRs:**`. Si no, alternativas: (a) citar solo FR en las stories técnicas y llevar NFR en **Notas técnicas**; o (b) agregar un FR técnico (p. ej. FR-053) para seguridad/regresión.
3. Para poblar el inventario global, agregar al `epics.md` una sección de inventario de requisitos (FR-001..FR-052 y NFR-001..NFR-006) en el formato que el bridge espere, o poblar manualmente `requirements.functional/nonFunctional` si el bridge lo permite. Decisión del usuario.
4. Regenerar `sprint-plan.md`: hoy cubre 4 epics y 11 stories en 3 olas. El plan advierte (límite conocido) que una dependencia entre epics que no está escrita en el texto de la story no se detecta; por eso el Epic 5 declara en su encabezado "Depende de: Epic 1, 2, 3 y 4" y cada story 5.N cita en sus notas la anterior; el bridge trata stories del mismo epic como secuencia (una sola capability, ola por story), lo que coincide con la cadena apilada.

## 5. Implementation Handoff

**Clasificación del alcance: Major** (agrega un epic nuevo y obliga a replanificar PRD, epics y arquitectura).

| Destinatario | Responsabilidad | Entregable |
|--------------|-----------------|------------|
| Usuario (decisión de producto) | Aprobar o ajustar este proposal; responder Q1-Q5. | Aprobación explícita (checklist 6.3). |
| PM (John) | Aplicar PRD-1..PRD-7; resolver Q2, Q3, Q4 y la regla de aprovisionamiento de cuentas con el usuario. | `prd.md` v0.2.0. |
| Architect (Winston) | Confirmar Q1 (D1-D3) y Q5; aplicar 4.c a `docs/architecture-base.md`; decidir el mecanismo por el que el colector llega a los módulos (residual #2). | `docs/architecture-base.md` lleno. |
| UX (Sally) opcional | Solo si el producto quiere una UI diseñada (D4); el plan no bloquea por ello. | Artefacto UX opcional. |
| Product Owner / Scrum | Aplicar EP-1..EP-6 a `epics.md`; correr `npx un-specweaver bridge`; crear `sprint-status.yaml` si el flujo lo usa (hoy no existe). | `epics.md` con 5 epics, trace y sprint plan regenerados. |
| Developer | Implementar 5.1-5.18 como PRs apilados, TDD con RED primero, `npm test` verde en cada uno; empezar por 5.1. No empezar 5.9 antes de resolver Q5/Q2/Q4. | PRs de ~400 líneas, con 5.7 y 5.10 como `size:exception`. |

**Criterios de éxito (del plan, sección 10).** `npm start` sirve la aplicación; los cuatro roles completan sus stories de punta a punta; todas las NFR Must tienen pruebas; `npm test` verde; PRs apilados de ~400 líneas o menos, salvo `size:exception` aceptadas.

**Orden recomendado.** Aprobar proposal, resolver Q1 (bloquea 5.1), aplicar 4.a-4.c, bridge, luego 5.1 en adelante. Q2-Q5 antes de 5.9 (R7).

### Brechas del plan y suposiciones (a revisar por el usuario)

- El plan no estima tiempo calendario: solo líneas y slices. No se inventó cronograma.
- Q4: el plan no da default; este proposal asume que el estudiante ingresa `promedioAcumulado` y crea la solicitud de beca (SUPUESTO).
- El plan no define NFR de disponibilidad, logs/correlation ids ni manejo de secretos; no se inventaron.
- Aprovisionamiento de cuentas reales, actor de `audit_log` para escalamientos del sistema, diseño de la prueba NFR-002, códigos de error ambiguos (`ESTADO_INVALIDO`), aprobación confirmada antes de validar términos, almacenamiento de configuración de umbrales y flujo de reejecución con datos incompletos: notas de un solo juez sin resolver en el plan; se trasladan a las notas técnicas de las stories correspondientes.
- Residuales de Judgment Day trasladados a stories: #1 a 5.14 (y 5.6), #2 a 5.6, #3 a 5.10, 5.11, 5.12 y 5.15, #4 a 5.7 (verificado: `confirmarEnvio` llama síncrono al notificador, `ejecutar` hace `await`, el archivo real es `src/desembolso/ejecucionDesembolso.js`).
- El plan menciona "una OpenSpec change por slice" como nota; el bridge la genera por story.
- Las citas de PRD, epics y arquitectura se tomaron de los archivos al 2026-10-01.

## 6. Checklist de cambio (Batch)

**Sección 1 — Disparador y contexto**
- [N/A] 1.1 Story disparadora: no hay story que lo revelara; es un requerimiento nuevo de stakeholders (vía `/sw:change`).
- [x] 1.2 Problema definido: nuevo requerimiento de stakeholders; el sistema no tiene canal de uso.
- [x] 1.3 Evidencia reunida: hechos F1-F8 del plan, 94 pruebas, 11 módulos, sin servidor ni UI (sección 1).

**Sección 2 — Impacto en epics**
- [x] 2.1 Epic disparador: no aplica ninguno; Epics 1-4 se completan como planeado.
- [x] 2.2 Cambios a nivel epic: se agrega Epic 5; sin modificar los existentes.
- [x] 2.3 Epics restantes revisados: no hay epics futuros; sin impacto.
- [x] 2.4 Obsolescencia/nuevos: ninguno obsoleto; un epic nuevo.
- [x] 2.5 Orden/prioridad: Epic 5 al final; cadena apilada 5.1-5.18.

**Sección 3 — Conflictos con artefactos**
- [!] 3.1 PRD: conflicto de alcance (sin FR/NFR web ni fuera de alcance de correo/IdP); propuestas PRD-1..7 pendientes de aprobar.
- [!] 3.2 Arquitectura: no existe documento; `docs/architecture-base.md` es plantilla vacía; contenido propuesto en 4.c, pendiente de Q1 y Q5.
- [!] 3.3 UX: no existen artefactos de UX; D4 usa páginas mínimas; correr el paso UX de BMAD solo si se quiere UI diseñada.
- [x] 3.4 Otros artefactos: `package.json` (engines/start) en 5.1; sin CI/IaC detectado; `trace.json` y `sprint-plan.md` se regeneran con el bridge (hallazgo en 4.d).

**Sección 4 — Camino a seguir**
- [x] 4.1 Direct Adjustment: viable; esfuerzo Alto, riesgo Medio.
- [x] 4.2 Rollback: no viable; nada que revertir.
- [x] 4.3 MVP Review: no viable; el MVP no se reduce.
- [x] 4.4 Seleccionado: Opción 1 (nuevo Epic 5).

**Sección 5 — Componentes del proposal**
- [x] 5.1 Resumen del problema: sección 1.
- [x] 5.2 Impacto en epics y artefactos: sección 2.
- [x] 5.3 Camino recomendado: sección 3.
- [x] 5.4 Impacto en MVP y plan de acción: secciones 3 y 5.
- [x] 5.5 Plan de handoff: sección 5.

**Sección 6 — Revisión final y handoff**
- [x] 6.1 Checklist revisado; los ítems [!] están documentados.
- [!] 6.2 Exactitud del proposal: pendiente de revisión humana de las ediciones de 4.a-4.c; sin verificar si el bridge acepta NFR en `**FRs:**`.
- [!] 6.3 Aprobación explícita del usuario: pendiente.
- [!] 6.4 `sprint-status.yaml`: no existe en el repo; si el flujo lo usa, agregar el Epic 5 y sus 18 stories con estado `backlog` tras aprobar; si no, el plan de sprint lo regenera `un-specweaver`.
- [!] 6.5 Siguientes pasos y responsables: definidos en la sección 5; confirmación pendiente del usuario.

## 7. Preguntas abiertas para el usuario

Exactamente como en el plan (sección 8), cada una con el default que las stories asumen.

- **Q1 Stack:** ¿se aceptan D1-D3 o se elige otro (Express/React/Postgres)? **Default asumido por las stories:** aceptar D1-D3 (Node built-ins, SQLite con `node:sqlite`, sesiones propias con scrypt). Afecta 5.1-5.7.
- **Q2 Ejecución de desembolsos:** ¿quién ejecuta un desembolso (la story 3.2 no tiene actor)? **Default asumido:** el rol asesor financiero (FR-048, story 5.14).
- **Q3 Carga de documentos:** los módulos solo guardan nombres de archivo (F8). ¿Se guardan los bytes en disco en v1 o solo metadatos? **Default asumido:** solo metadatos (story 5.8). El plan no declara un default explícito para Q3; este es el comportamiento actual de los módulos, por lo que es un SUPUESTO.
- **Q4 Solicitud de beca:** ¿cómo se inicia una solicitud de beca y quién ingresa `promedioAcumulado`? **Default asumido:** el plan no da default; las stories asumen (SUPUESTO) que el estudiante la inicia y registra el `promedioAcumulado` (story 5.11).
- **Q5 Asignación (NFR-003):** ¿cómo se "asignan" asesores y comité a un caso? **Default asumido (del plan):** un asesor reclama una solicitud sin asignar (registrado en `assignments` y `audit_log`); todo integrante del comité está asignado a todo caso del comité (stories 5.5, 5.9, 5.12).

---

*Sprint Change Proposal generado con `bmad-correct-course` en modo Batch. Estado: borrador pendiente de aprobación; ningún artefacto de planeación o código ha sido modificado.*
