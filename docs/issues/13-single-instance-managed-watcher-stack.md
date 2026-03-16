# Single-instance managed watcher stack

## Problem

AutoTranscribe2 can still end up with duplicate watcher stacks. That creates repeated transcriptions from one audio file, inconsistent process state in the menu, and disagreement between displayed state and start/stop guards.

## Proposed change

- Introduce a single-instance lock for the managed watcher stack.
- Centralise stack reconciliation across lock file, legacy PID file, runtime status, and live process checks.
- Make start/stop/restart use the reconciled stack state instead of weak one-off PID checks.
- Make menu and status derive `WatcherProcessState` from the same reconciliation source.
- Keep autostart, menu, and `start:all` on the same single-instance guard path.

## Affected components

- `src/application/WatcherControl.ts`
- `src/application/StatusSnapshot.ts`
- `src/cli/menu.ts`
- `src/cli/index.ts`
- `src/cli/startAll.ts`
- `src/cli/stopAll.ts`
- `src/cli/autostartInstall.ts`
- `src/infrastructure/status/RuntimeStatus.ts`
- `src/infrastructure/watcher/FileSystemPoller.ts`
- tests and docs

## Completion summary

- Added a filesystem `StackLock` for the `ManagedWatcherStack` so `menu`, `start:all`, and autostart share the same single-instance guard.
- Centralised process reconciliation in `WatcherControl` across lock file, legacy PID file, live process checks, and runtime ownership state.
- Updated menu/status views to use the same reconciled process-state source as the start/stop guards.
- Added tests for duplicate-start refusal, stale-artifact cleanup, partial-stack mapping, and reconciled snapshot output.
