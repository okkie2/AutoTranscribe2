# Runtime status model and static operational menu

## Problem

The current `autotranscribe menu` flow behaves partly like a live dashboard, and the runtime status model still mixes process lifecycle, runtime activity, and freshness into a single generic `state` concept. That makes the operational menu harder to reason about and makes status output less precise.

## Proposed change

- Keep `autotranscribe menu` as a static operational control interface.
- Refresh the compact `StatusSnapshot` only when the menu opens, after an action completes, and when the operator requests a manual refresh.
- Separate `WatcherProcessState`, `RuntimeActivityState`, and `StatusFreshness`.
- Refactor `runtime/status.json` to use `runtimeActivityState` instead of the generic `state` field.
- Update watcher and ingester status writes so the menu and status dashboard read structured state instead of inferring it from mixed signals.

## Affected components

- `src/infrastructure/status/RuntimeStatus.ts`
- `src/application/StatusSnapshot.ts`
- `src/application/WatcherControl.ts`
- `src/cli/menu.ts`
- `src/cli/status.ts`
- `src/cli/ingestJustPressRecord.ts`
- `src/application/JobWorker.ts`
- `src/infrastructure/watcher/FileSystemPoller.ts`
- README, docs, glossary, TODO
