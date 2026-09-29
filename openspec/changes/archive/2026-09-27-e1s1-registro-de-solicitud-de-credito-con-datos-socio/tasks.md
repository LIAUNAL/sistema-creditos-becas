## 1. Implementacion

- [x] 1.1 el sistema crea la solicitud con estado `borrador`, le asigna un identificador único y la asocia al estudiante — `src/solicitud-credito/registroSolicitudCredito.js` (`RegistroSolicitudCredito.crear`)
- [x] 1.2 el sistema rechaza la creación y muestra el estado de la solicitud existente — `ErrorSolicitudExistente` con `solicitudExistente` (id + estado)
- [x] 1.3 el sistema bloquea el envío y resalta los campos faltantes — `ErrorCamposFaltantes` con `camposFaltantes: string[]`

## 2. Verificacion

- [x] 2.1 Test del criterio 1: el sistema crea la solicitud con estado `borrador`, le asigna un identificador único y la asocia al estudiante — `src/solicitud-credito/registroSolicitudCredito.test.js`, `npm test` → 6/6 pass
- [x] 2.2 Test del criterio 2: el sistema rechaza la creación y muestra el estado de la solicitud existente — idem
- [x] 2.3 Test del criterio 3: el sistema bloquea el envío y resalta los campos faltantes — idem
