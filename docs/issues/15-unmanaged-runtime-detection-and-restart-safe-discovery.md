# Unmanaged runtime detection and restart-safe discovery

## Problem

AutoTranscribe2 can still show `stopped` while transcript processing is happening, then allow `Start Watcher`, after which a fresh watcher re-scans existing recordings and enqueues old work again. The current managed stack lock is necessary but not sufficient when runtime activity exists outside the managed ownership path or when discovery state is lost on restart.

## Proposed change

- Detect unmanaged watcher/ingester processes during stack reconciliation and surface them as an error state instead of `stopped`.
- Refuse managed startup when watcher-like activity already exists outside the current managed lock.
- Persist a minimal discovery ledger so watcher restarts do not re-enqueue already discovered recordings.
- Add regression tests for unmanaged-process detection and restart-safe discovery.

## Affected components

- `src/application/WatcherControl.ts`
- `src/infrastructure/watcher/FileSystemPoller.ts`
- tests and docs
