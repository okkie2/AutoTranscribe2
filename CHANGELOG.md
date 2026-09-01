# Changelog

## 2026-09-01

- **feat: add SwiftBar menu wrapper** — Added a five-second macOS menu-bar view, JSON status command, existing start/stop/restart controls, and safe install/uninstall scripts. The wrapper reads existing runtime state and does not own transcription queues.
- **fix: make the SwiftBar wrapper work outside an interactive shell** — The installer records the Node executable and the plugin runs commands from the configured repository root, so it works in SwiftBar's restricted environment.

## 2026-06-16

- **fix: recover from partial watcher stack on startup** — `startWatcherControl` now handles the `partial` reconciled state (one managed process alive) by sending SIGINT to the orphan and cleaning up before attempting a fresh start, instead of throwing an unrecoverable error. Prevents the crash loop that occurs when the watcher or ingest process dies but the other survives across a launchd restart.
- **fix: stop launchd restart loop for already-running stack** — Changed launchd plist `KeepAlive` from unconditional `true` to `{ SuccessfulExit: false }` so launchd no longer restarts `startAll` after a successful launch. `startAll` now also exits 0 (instead of 1) when the stack is already running, so a redundant restart attempt is treated as a no-op.

## 2026-04-11

- Hardened watcher restart and autostart recovery; stale running supervisor state after reboot is now treated as a stale lock and cleaned up on next start.

## Earlier

- Parakeet MLX backend, operational menu, iCloud Just Press Record ingestion, readable transcript format, unified start/stop, config-driven autostart.
