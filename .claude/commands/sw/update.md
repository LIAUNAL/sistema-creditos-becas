---
name: "UB: Actualizar skills y entorno"
description: "Actualiza las skills, comandos y configuración de agentes en un proyecto existente sin tocar la arquitectura ni los specs."
allowed-tools: Bash(npx:*), Bash(git:*), Read, Glob
---

# /sw:update — actualizar skills y entorno

Sincroniza la capa de skills y comandos de un-specweaver en un repositorio ya inicializado.

## Paso 1 — Verificar estado del repositorio

Antes de actualizar, asegúrate de que el árbol de trabajo esté limpio:

```bash
git status
```

Si hay cambios sin confirmar, confírmalos o guárdalos en stash. La actualización sobrescribe las skills y comandos generados; contar con un punto de restauración limpio garantiza que puedas revertir si es necesario.

## Paso 2 — Ejecutar actualización

Para actualizar la capa de skills y comandos respetando los agentes configurados:

```bash
npx un-specweaver update
```

Si deseas agregar un nuevo agente (como Antigravity):

```bash
npx un-specweaver update --agents antigravity
```

O si deseas actualizar también las dependencias y vendors:

```bash
npx un-specweaver update --vendors
```

## Paso 3 — Verificar que todo esté al día

Ejecuta el diagnóstico para confirmar que los artefactos y el entorno son coherentes:

```bash
npx un-specweaver doctor
```
