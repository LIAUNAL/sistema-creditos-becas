## Why

El requisito "Reporte consolidado de créditos y becas por periodo" (Escenario 1, `openspec/specs/reportes-para-direccion-academica/spec.md`) exige que el reporte muestre el monto total desembolsado. `src/reportes/reporteConsolidado.js` sumaba solo los desembolsos en estado `desembolsado`, un estado que ninguna spec ni story define. La spec de `desembolso-y-seguimiento` (Story 3.2) define el estado de un desembolso efectuado como `ejecutado`. Con datos reales el monto total desembolsado del reporte era siempre 0.

El comportamiento especificado es correcto; la implementación no lo cumplía. Es un defecto, no un cambio de alcance.

## What Changes

- `reporteConsolidado.js` suma los desembolsos en estado `ejecutado` (la constante pasa de `ESTADO_DESEMBOLSO_EFECTUADO` a `ESTADO_DESEMBOLSO_EJECUTADO`).
- Las pruebas unitarias de `reporteConsolidado.test.js` usan `ejecutado`.
- Nueva prueba de integración `reporteConsolidado.integracion.test.js` con los módulos reales de Epic 3: el total incluye solo cuotas `ejecutado`; `programado` y `vencido` quedan excluidas.

## Capabilities

### Modified Capabilities

- `reportes-para-direccion-academica`: solo la implementación; no hay requisitos nuevos ni modificados.

## Impact

- Código: `src/reportes/reporteConsolidado.js` y sus pruebas.
- Sin cambios en specs, PRD ni epics; sin cambios en `src/desembolso/` ni `alertaTasaMora.js`.
- Cambia el nombre de la constante exportada; no tiene otros consumidores en el repositorio.
