## 1. Implementacion

- [ ] 1.1 pasa a `vencido` y el estado persiste al recargar desde SQLite
- [ ] 1.2 permanece `ejecutado`
- [ ] 1.3 estado y filas de outbox se confirman juntos o no se confirman
- [ ] 1.4 corre la revisión y un estudiante recibe 403
- [ ] 1.5 el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado)

## 2. Verificacion

- [ ] 2.1 Test del criterio 1: pasa a `vencido` y el estado persiste al recargar desde SQLite
- [ ] 2.2 Test del criterio 2: permanece `ejecutado`
- [ ] 2.3 Test del criterio 3: estado y filas de outbox se confirman juntos o no se confirman
- [ ] 2.4 Test del criterio 4: corre la revisión y un estudiante recibe 403
- [ ] 2.5 Test del criterio 5: el temporizador diario no mantiene vivo el proceso (`unref()` o teardown inyectado)
