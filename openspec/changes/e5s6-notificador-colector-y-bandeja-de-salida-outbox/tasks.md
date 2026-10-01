## 1. Implementacion

- [ ] 1.1 cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos
- [ ] 1.2 el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga
- [ ] 1.3 ninguna de las dos queda confirmada (todo o nada)
- [ ] 1.4 las filas pasan a la tabla `notifications` y la entrega no revierte el estado
- [ ] 1.5 el colector implementa los cuatro métodos con la firma que cada módulo espera

## 2. Verificacion

- [ ] 2.1 Test del criterio 1: cada payload queda registrado en memoria, ninguna llamada lanza error y ninguna toca la base de datos
- [ ] 2.2 Test del criterio 2: el estado mutado queda persistido (se recarga igual desde SQLite) y la excepción se propaga
- [ ] 2.3 Test del criterio 3: ninguna de las dos queda confirmada (todo o nada)
- [ ] 2.4 Test del criterio 4: las filas pasan a la tabla `notifications` y la entrega no revierte el estado
- [ ] 2.5 Test del criterio 5: el colector implementa los cuatro métodos con la firma que cada módulo espera
