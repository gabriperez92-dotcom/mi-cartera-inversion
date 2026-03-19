# CLAUDE.md

Este archivo proporciona contexto a Claude Code sobre el proyecto y cómo colaborar en él.

## Objetivo del proyecto

**Mi Cartera de Inversión** es una aplicación personal para que Gabri (el usuario) haga seguimiento de sus fondos de inversión y aportaciones mensuales. Registra cuánto ha aportado a cada fondo, cuál es el valor actual, y calcula el beneficio/pérdida y rentabilidad.

Los fondos actuales que sigue son: Numantia Renta 4, Baelo Dividendo Creciente, BTC, Oro, Emergentes, Vanguard Small Capital, Nasdaq 100.

## Arquitectura del sistema

El proyecto tiene **tres capas** que comparten los mismos datos vía Google Drive:

### 1. Componente principal — `investment-tracker.tsx` (raíz)
- Fichero React único y autocontenido, sin build propio.
- Exporta un componente `App` que es el 100% de la UI.
- Usa `window.storage` (inyectado por el host) para persistir datos.
- No tiene dependencias externas — funciona en cualquier entorno que inyecte `window.storage`.

### 2. PWA — `pwa/`
- Aplicación web instalable, desplegada en **GitHub Pages** (`z92-dotcom.github.io` o similar).
- Importa `investment-tracker.tsx` directamente: `import App from "../../investment-tracker"`.
- La autenticación con Google se hace vía **Google Identity Services** (OAuth2 implícito en el navegador).
- `pwa/src/DriveStorage.ts` implementa `window.storage` usando la API de Google Drive.
- El archivo de datos en Drive se llama `investment-tracker-data.json`.
- El despliegue es automático vía **GitHub Actions** al hacer push a `master`.

### 3. App Electron — `electron/` + `src/`
- App de escritorio para Windows/Mac/Linux.
- Usa el mismo `CLIENT_ID` de Google que la PWA → **comparten el mismo archivo en Google Drive**.
- La autenticación en Electron usa OAuth2 con flujo de código de autorización (localhost redirect), a diferencia de la PWA que usa el flujo implícito.
- `electron/main.cjs` gestiona auth, lectura/escritura en Drive, y expone `window.storage` al renderer vía IPC.
- `electron/preload.cjs` hace el bridge IPC → `window.storage`.

## Flujo de datos

```
Usuario edita en la app
  → persist(funds, entries, distribution)
    → setState (render inmediato)
    → window.storage.set(key, JSON)
      → DriveStorage / Electron IPC
        → Google Drive API (guardado con debounce de 2s)
```

## Estado de la app

Tres objetos principales:
- **`funds`**: `[{ id, name }]` — lista de fondos
- **`entries`**: `[{ id, fundId, date (YYYY-MM), aportacion, valorActual }]` — aportaciones mensuales
- **`distribution`**: `{ totalMensual, allocations: [{ id, label, pct }] }` — planificación mensual

Persistidos juntos bajo la clave `"investment-tracker-v1"` como `{ funds, entries, distribution }`.

## Tabs de la UI

| Tab | Clave | Función |
|-----|-------|---------|
| Resumen | `resumen` | Tabla con todos los fondos, totales y métricas |
| Aportaciones | `aportaciones` | Editor de entradas mensuales por fondo |
| Gestionar Fondos | `fondos` | Añadir, renombrar y eliminar fondos |
| Distribución | `distribucion` | Planificación del % mensual por concepto |

## Lógica clave

- **`fundStats(fid)`**: calcula métricas de un fondo. `valorActual` = último entry (no suma); `totalAportado` = suma de todos los entries.
- **`persist(f, e, d)`**: único punto de escritura — actualiza state Y storage a la vez.
- **`runningAportado`**: variable mutable fuera del JSX en la tab de aportaciones para calcular el acumulado fila a fila.
- **Variación mensual**: compara el total de la cartera del último mes registrado con el mes anterior.

## Diseño responsive

- En **escritorio**: tablas con todas las columnas visibles.
- En **móvil** (< 640px): tablas con scroll horizontal (`overflow-x: auto`, clase `.inv-table-scroll`), tarjetas de resumen en cuadrícula 2×2.
- El CSS responsive se inyecta con un `<style>` tag dentro del JSX para evitar dependencias externas de CSS.
- **Importante**: los contenedores de las tablas NO deben tener `overflow: hidden` porque bloquea el scroll horizontal en móvil.

## Convenciones

- Todo el texto de la UI en **español** (`es-ES`).
- Números con `toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- Colores principales: azul oscuro `#1a2744`, azul acción `#3b5bdb`, verde beneficio `#16a34a`, rojo pérdida `#dc2626`.
- Estilos como objetos inline (`style={{ }}`) — sin ficheros CSS externos.

## Deploy

Para que los cambios lleguen a la PWA del móvil:
```bash
git add investment-tracker.tsx
git commit -m "descripción"
git push origin master
# GitHub Actions construye y despliega automáticamente (~2-3 minutos)
```
