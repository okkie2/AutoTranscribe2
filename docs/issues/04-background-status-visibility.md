# Background status visibility

## Problem

When AutoTranscribe2 runs in the background, users need a quick view of whether it is idle, working, in an error state, or unavailable.

## Proposed solution

The SwiftBar MVP provides a lightweight menu-bar indicator that reads the existing JSON status contract and uses existing lifecycle commands. It does not own the watcher or queue state.

- **Idle** – watcher running, no job in progress.
- **Processing** – currently transcribing one or more files.
- **Error / attention needed** – e.g. backend repeatedly failing, or a clear failure that needs user action.

The wrapper refreshes every five seconds and reports `AT idle`, `AT working`, `AT error`, or `AT stale`. Future work is limited to validating it against real runtime states and considering richer detail only when needed.

## Acceptance criteria

- [x] User can see at a glance that AutoTranscribe2 is running through the SwiftBar item.
- [x] Idle, working, error, and stale states are distinguishable.
- [x] The wrapper uses the same runtime state whether the watcher is started by autostart or `start:all`.
- [ ] Validate the wrapper during real error and stale runtime scenarios.
