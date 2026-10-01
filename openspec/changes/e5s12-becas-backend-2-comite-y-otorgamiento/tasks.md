## 1. Implementacion

- [ ] 1.1 aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox
- [ ] 1.2 se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud
- [ ] 1.3 el sistema responde 403
- [ ] 1.4 el estado y el comentario persisten

## 2. Verificacion

- [ ] 2.1 Test del criterio 1: aparece en la cola de los integrantes del comité asignados y se encola el aviso al comité en el outbox
- [ ] 2.2 Test del criterio 2: se actualiza el estado, `audit_log` guarda el id del integrante, la acción y la fecha, y una decisión `otorgada` se registra en `scholarship_awards` con el periodo de la solicitud
- [ ] 2.3 Test del criterio 3: el sistema responde 403
- [ ] 2.4 Test del criterio 4: el estado y el comentario persisten
