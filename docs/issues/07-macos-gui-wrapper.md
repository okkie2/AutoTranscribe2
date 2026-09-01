# macOS GUI wrapper

## Problem

The SwiftBar MVP now provides a lightweight visible wrapper for status and existing lifecycle controls. A richer native macOS app may still be useful if it needs controls or settings beyond SwiftBar's menu model.

## Proposed solution

Keep the existing SwiftBar MVP as the thin wrapper. Explore a native macOS menu-bar app only if it needs to:

- provide richer controls, settings, notifications, or history than SwiftBar can reasonably support
- preserve the existing JSON status and lifecycle-command contract, or replace it deliberately with equivalent application boundaries
- avoid creating a second watcher, queue, or runtime-state store

The implemented MVP is a SwiftBar script that consumes compiled CLI commands. A future native app is optional; it is not required for the current operational workflow.

## Acceptance criteria

- [x] A working SwiftBar MVP exposes status plus Start, Stop, Restart, and Open transcript folder actions.
- [x] The wrapper does not create a second watcher, queue, or runtime-state store.
- [ ] Evaluate a native app only after SwiftBar's limits are demonstrated by real use.
