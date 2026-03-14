# macOS GUI wrapper

## Problem

Power users can use the CLI and autostart, but there is no lightweight GUI for users who prefer a visible app (e.g. menu bar or small window) to start/stop the pipeline or see status.

## Proposed solution

Explore a small macOS GUI or menu bar app that:

- Reuses the same core services (TranscriptionService, watcher orchestration, config).
- Does not shell out to the CLI for core behaviour; calls the same application layer.
- Surfaces start/stop, basic status, and optionally logs or transcript list.

This is a future idea; the current codebase is already structured so that a GUI can depend on the application layer without duplicating logic. Implementation can be a separate package or target (e.g. Electron, Swift menu bar app, or similar) that imports or spawns the Node services.

## Acceptance criteria

- [ ] Design or spike exists for a small GUI or menu bar app that uses the existing core.
- [ ] Core remains CLI-agnostic; no hard coupling from application layer to CLI.
- [ ] Optional: minimal working prototype (e.g. “Start” / “Stop” and status) that runs the same pipeline as `start:all` / `stop:all`.
