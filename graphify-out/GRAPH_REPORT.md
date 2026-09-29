# Graph Report - sistema-creditos-becas  (2026-09-29)

## Corpus Check
- 4 files · ~816 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 32 nodes · 36 edges · 7 communities (4 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- context7
- registroSolicitudCredito.test.js
- package.json
- registroSolicitudCredito.js
- camposFaltantesEn
- RegistroSolicitudCredito
- .buscarActivaPorEstudianteYPeriodo

## God Nodes (most connected - your core abstractions)
1. `RegistroSolicitudCredito` - 6 edges
2. `context7` - 3 edges
3. `ErrorCamposFaltantes` - 3 edges
4. `ErrorSolicitudExistente` - 3 edges
5. `camposFaltantesEn()` - 3 edges
6. `scripts` - 2 edges
7. `ESTADOS_ACTIVOS` - 2 edges
8. `esVacio()` - 2 edges
9. `npx` - 1 edges
10. `context7-mcp` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (7 total, 3 thin omitted)

### Community 0 - "context7"
Cohesion: 0.50
Nodes (3): npx, context7, context7-mcp

### Community 1 - "registroSolicitudCredito.test.js"
Cohesion: 0.22
Nodes (5): ErrorCamposFaltantes, ErrorSolicitudExistente, assert, {
  RegistroSolicitudCredito,
  ErrorCamposFaltantes,
  ErrorSolicitudExistente,
}, test

### Community 2 - "package.json"
Cohesion: 0.29
Nodes (6): description, name, private, scripts, test, version

### Community 3 - "registroSolicitudCredito.js"
Cohesion: 0.50
Nodes (3): CAMPOS_IDENTIDAD_OBLIGATORIOS, CAMPOS_SOCIOECONOMICOS_OBLIGATORIOS, { randomUUID }

## Knowledge Gaps
- **13 isolated node(s):** `npx`, `context7-mcp`, `name`, `version`, `private` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RegistroSolicitudCredito` connect `RegistroSolicitudCredito` to `registroSolicitudCredito.test.js`, `registroSolicitudCredito.js`, `camposFaltantesEn`, `.buscarActivaPorEstudianteYPeriodo`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `ErrorCamposFaltantes` connect `registroSolicitudCredito.test.js` to `registroSolicitudCredito.js`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `ErrorSolicitudExistente` connect `registroSolicitudCredito.test.js` to `registroSolicitudCredito.js`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `npx`, `context7-mcp`, `name` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._