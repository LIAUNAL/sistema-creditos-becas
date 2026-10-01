## Why

Entrega la Story 5.10 del Epic 5: Aplicación web.

## What Changes

- Condiciones del crédito y calendario de desembolso.
- Se guardan los términos y se genera un desembolso `programado` por cuota con `periodoAcademico` y `tipoCredito` copiados.
- Se rechaza, se registra el error en `calendar_errors` y no se crean desembolsos parciales.
- No se duplican desembolsos.
- Los desembolsos conservan fecha, monto, periodo y tipo de crédito.

## Capabilities

### New Capabilities

### Modified Capabilities

- `aplicacion-web`: agrega el requisito "Condiciones del crédito y calendario de desembolso".

## Impact

- Origen: BMAD Story 5.10 — Epic 5: Aplicación web
- Requisitos de esta story: FR-044, FR-020
- Capability: `aplicacion-web`
