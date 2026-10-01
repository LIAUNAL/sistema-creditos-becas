## 1. Implementacion

- [x] 1.1 el servidor escucha y `GET /health` responde 200
- [x] 1.2 el servidor responde con el estado HTTP mapeado a ese código y no expone la traza
- [x] 1.3 el servidor responde 404
- [x] 1.4 el servidor se cierra en `after` y `node --test src/` no queda colgado

## 2. Verificacion

- [x] 2.1 Test del criterio 1: el servidor escucha y `GET /health` responde 200
- [x] 2.2 Test del criterio 2: el servidor responde con el estado HTTP mapeado a ese código y no expone la traza
- [x] 2.3 Test del criterio 3: el servidor responde 404
- [x] 2.4 Test del criterio 4: el servidor se cierra en `after` y `node --test src/` no queda colgado
