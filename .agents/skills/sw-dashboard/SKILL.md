---
name: sw-dashboard
description: "Inicia el dashboard web multi-proyecto en puerto libre (default 3100), sirve la SPA en / y opcionalmente abre el navegador."
---

# sw-dashboard — panel de control

Inicia el servidor del dashboard local. Sirve la SPA en `/` y expone los endpoints REST/SSE del dashboard.

## Uso

```bash
npx un-specweaver dashboard [--port <n>] [--host <h>] [--open] [--no-open]
npx un-specweaver ui       # alias de dashboard
npx un-specweaver dashboard --help
```

El servidor inicia en puerto libre (default `3100`). Si `3100` está ocupado, reintenta `3101`, `3102`... hasta `10` intentos. Con `--port 0` usa puerto efímero del sistema. Siempre loguea:

```
Dashboard en http://127.0.0.1:<port>
```

y sirve la SPA en `GET /`.

## Flags

| Flag | Default | Descripción |
|------|---------|-------------|
| `--port <n>` | `3100` | Puerto a escuchar. `0` = efímero. Reintenta siguiente libre si está ocupado. |
| `--host <h>` | `127.0.0.1` | Host a escuchar. Solo `0.0.0.0` si necesitas exponer en red local. |
| `--open` | `false` | Abrir navegador del sistema a la URL efectiva sin bloquear el proceso. |
| `--no-open` | — | No abrir navegador (default). Útil para desactivar `--open` heredado. |
| `--help`, `-h` | — | Muestra ayuda de dashboard. |
| `--version`, `-v` | — | Muestra versión. |

Apertura de navegador (preferencia **Chromium**): `darwin` → `open -a Chromium` → `open -a "Google Chrome"` → `open`, `linux` → `chromium-browser` → `chromium` → `google-chrome` → `xdg-open`, `win32` → `cmd /c start chrome` → `cmd /c start`. Se ejecuta con `spawn` detached + `unref` para no bloquear.

## Ejemplos

```bash
# Iniciar en 3100 (o siguiente libre) y ver URL en log
npx un-specweaver dashboard

# Alias corto
npx un-specweaver ui

# Puerto fijo y abrir navegador automáticamente
npx un-specweaver dashboard --port 3200 --open

# Puerto efímero y host explícito
npx un-specweaver dashboard --port 0 --host 127.0.0.1

# Forzar sin apertura aunque la config sugiera --open
npx un-specweaver dashboard --no-open

# Ayuda
npx un-specweaver dashboard --help
```

### Comportamiento de `--open` con puerto ocupado

```bash
# Si 3200 está ocupado, el servidor inicia en 3201 y abre http://127.0.0.1:3201
npx un-specweaver dashboard --open --port 3200
```

La URL abierta es siempre la efectiva (`host:port` real), no la solicitada.

## Notas

- **ESM estricto**: `type: module`, `import`/`export` nativo, sin `require`. Requiere **Node >=20.11** (`engines` en `package.json`).
- **Sin `process.chdir`**: el servidor nunca cambia el cwd global; toda ruta de proyecto es absoluta y se pasa como `cwd` a subprocess.
- **Cierre limpio**: `SIGINT`/`SIGTERM` (y `SIGBREAK` en Windows) cierran el servidor y matan procesos hijos.
- **SPA**: `src/dashboard/public/` se sirve como estáticos; rutas desconocidas sin extensión hacen fallback a `index.html`.
- **Logs**: solo `Dashboard en http://...` en `stdout`; errores en `stderr` con prefijo `[dashboard]`.
