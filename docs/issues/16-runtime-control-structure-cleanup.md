## Problem

Runtime control logic has become harder to maintain because reconciliation and CLI action policy are concentrated in oversized files.

The main issues are:
- `WatcherControl` mixes process reconciliation with runtime orchestration.
- `menu.ts` mixes terminal I/O with action policy and transition checks.
- Small runtime-control changes now require edits across large branching functions.

## Proposed change

Extract focused modules without changing runtime behaviour:
- move managed watcher stack reconciliation into `ManagedWatcherStackReconciler`
- move operational menu action handlers into `menuActions`
- keep `WatcherControl` as the orchestration layer
- keep `menu.ts` as the terminal interaction layer

## Affected components

- `src/application/WatcherControl.ts`
- `src/application/ManagedWatcherStackReconciler.ts`
- `src/cli/menu.ts`
- `src/cli/menuActions.ts`
