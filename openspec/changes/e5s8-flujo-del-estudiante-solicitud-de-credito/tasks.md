## 1. Implementacion

- [ ] 1.1 se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista
- [ ] 1.2 el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox
- [ ] 1.3 el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`
- [ ] 1.4 el sistema responde 403 o 404 (visibilidad NFR-003)

## 2. Verificacion

- [ ] 2.1 Test del criterio 1: se crea una solicitud `borrador` asociada a su id canónico y se muestra en su lista
- [ ] 2.2 Test del criterio 2: el estado pasa a `pendiente_revision` y se encola el aviso de confirmación en el outbox
- [ ] 2.3 Test del criterio 3: el envío se rechaza, se indica el documento faltante y el estado sigue en `borrador`
- [ ] 2.4 Test del criterio 4: el sistema responde 403 o 404 (visibilidad NFR-003)
