# CLI diagnostic trace system

## Problem

Debugging incorrect start/stop behaviour currently depends on the user manually describing what happened. That makes it hard to reconstruct races, guard failures, mismatches between internal state and live processes, or unexpected transcript processing after the system appears stopped.

## Proposed change

- Add a lightweight append-only JSONL `Diagnostic Trace` for CLI control flow and runtime transitions.
- Record CLI commands, observed state snapshots, guard evaluations, state mismatches, and transcript processing events.
- Export a diagnostic bundle that includes the trace, current config, and the latest reconciled state snapshot.
- Reuse the centralized reconciled runtime state so the trace follows the real control model.

## Affected components

- `src/infrastructure/tracing/TraceLogger.ts`
- `src/application/WatcherControl.ts`
- `src/application/Diagnostics.ts`
- `src/cli/index.ts`
- `src/cli/menu.ts`
- `src/cli/startAll.ts`
- `src/cli/stopAll.ts`
- `src/cli/ingestJustPressRecord.ts`
- `src/infrastructure/watcher/FileSystemPoller.ts`
- `src/application/JobWorker.ts`
- docs and tests

## Completion summary

- Added a lightweight append-only `Diagnostic Trace` at `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl`.
- Reused the centralized reconciled state model so traced observations and control guards share the same snapshot structure.
- Traced CLI commands, start/stop guards, state mismatches, state observations, and transcript detection/processing events.
- Added `autotranscribe diagnostics` to export the latest trace, current config, and reconciled state snapshot as a diagnostic bundle.
