# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a single-file React investment tracker (`investment-tracker.tsx`) — a self-contained component with no build tooling, package manager, or external dependencies. It is intended to run inside a host environment (e.g., a Claude artifact runner or custom app shell).

## Architecture

Everything lives in one default export (`App`) in `investment-tracker.tsx`. Key pieces:

- **State**: `funds` (list of investment funds) and `entries` (monthly contribution records), both persisted via `window.storage` (a host-provided async key/value API).
- **`persist(funds, entries)`**: the single write path — always call this instead of setting state directly, as it updates both state and storage atomically.
- **`fundStats(fid)`**: computes totals for a fund from its entries. `valorActual` comes from the *last* entry only (not summed); `totalAportado` is summed across all entries.
- **Tabs**: "resumen" (summary table), "aportaciones" (monthly entry editor per fund), "fondos" (add/rename/remove funds).
- **Running totals** in the aportaciones tab are computed inline during render via `runningAportado` (a mutable variable outside JSX — not state).

## Storage

Data is persisted under the key `"investment-tracker-v1"` as `{ funds, entries }` JSON via `window.storage?.get/set`. The `?.` guards mean it degrades gracefully if the host doesn't provide storage.

## Locale

UI text and number formatting are in Spanish (`es-ES`). Keep any new UI strings in Spanish.
