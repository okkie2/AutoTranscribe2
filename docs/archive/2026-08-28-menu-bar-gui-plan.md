# MVP: AutoTranscribe Menu Bar Wrapper

Captured: 2026-08-28T14:27:15+02:00

## Decision

Build a small macOS menu-bar wrapper on top of the existing AutoTranscribe2 CLI. The wrapper shows the CLI's current state and invokes its existing commands; it does not perform transcription, run a second watcher, move files, or create its own queue.

This keeps AutoTranscribe2 as the single owner of runtime state and queue processing. The first release is a SwiftBar plugin. A native `MenuBarExtra` app remains a later option only if the wrapper outgrows SwiftBar.

## MVP Scope

The menu-bar label has four states:

- `AT idle`
- `AT working`
- `AT error`
- `AT stale`

The dropdown shows:

- current activity and current file, when available
- a count for recordings awaiting processing
- a count for transcription jobs waiting or running
- the most recent completed transcript
- the most recent error or warning
- the time of the last status update
- actions already supported by the CLI: Refresh, Start, Stop, Restart, and Open transcript folder

`AT stale` means the wrapper could not obtain a current CLI status. It must never infer that the service is idle from missing or outdated data.

## Queue Model

The wrapper reports queues; it does not manage them.

| Concern | Existing CLI owns | MVP wrapper shows |
| --- | --- | --- |
| Recordings | Discovery and eligibility of source audio files | Awaiting count and oldest pending recording, if available |
| Transcription jobs | Queuing, running, retrying, completing, and failing jobs | Waiting, running, failed, and latest-completed summary |
| Transcripts | Writing and locating completed output | Latest transcript path and an Open action |
| Logs | Recording operational events and errors | Latest warning/error and a bounded recent-events view, if available |

Logs are not a work queue. The MVP may show a short recent-events summary, but it must not tail an unbounded log file or retain a duplicate history. The existing CLI remains the source of truth for retries, failures, and queue state.

## SQLite Decision

Do not introduce SQLite for the menu-bar MVP. A wrapper database would duplicate the CLI's state, create reconciliation problems, and add migration and backup work before it solves a user-facing need.

Consider SQLite inside the CLI when the service needs durable job history across restarts, atomic claiming of work, retry scheduling, multiple workers, or queries that the current runtime files cannot answer reliably. If that threshold is reached, SQLite should become the one canonical store for recordings and transcription jobs; logs should remain append-only operational events rather than database queue records. The menu-bar wrapper would continue to consume the same JSON status contract.

## Required CLI Boundary

First inspect the existing CLI and runtime files, then either reuse or add one stable machine-readable status command, for example:

```bash
npm run status:json
```

It should produce one compact JSON object rather than requiring the wrapper to scrape terminal output. The exact field names follow the existing application model, but the MVP needs equivalents for:

```json
{
  "updatedAt": "...",
  "service": "idle | working | error | stopped",
  "recordings": { "pending": 0, "oldest": null },
  "jobs": { "waiting": 0, "running": 0, "failed": 0 },
  "latestTranscript": null,
  "latestError": null
}
```

The wrapper calls compiled CLI commands only. It must not run a build, mutate runtime files directly, or run a polling loop that competes with the CLI's watcher.

## Implementation Slice

1. Confirm the existing CLI commands and authoritative runtime files for recordings, jobs, transcripts, and logs.
2. Add or reuse the JSON status command with a focused automated test.
3. Add `scripts/gui/autotranscribe.5s.sh`, which calls the status command and renders SwiftBar output.
4. Wire the existing Start, Stop, and Restart CLI commands as menu actions.
5. Add a minimal `gui:install` command that copies or symlinks the plugin into SwiftBar's plugin directory, plus `gui:uninstall` that removes only that plugin.
6. Document installation, status meanings, and the CLI command used by the wrapper.

## Verification

- Run the existing AutoTranscribe2 test suite and the status-command test.
- Confirm the menu reflects idle, working, error, and stale states.
- Create or discover a recording and confirm the recording and job counts change without the wrapper changing any files.
- Confirm a completed job exposes the latest transcript and opens its folder.
- Confirm Start, Stop, and Restart invoke the existing CLI behavior.
- Confirm uninstall removes only the SwiftBar plugin and preserves AutoTranscribe2 data and configuration.

## Later, Not MVP

- Native SwiftUI menu-bar app.
- Queue filters, job history, retry controls, and per-job actions.
- Rich log browsing, notifications, and settings UI.
- Any container, Synology, or remote-control deployment.

## Assumption

This plan is intentionally a wrapper over the existing macOS CLI. I could not inspect `/Users/joostokkinga/Documents/AutoTranscribe2` because macOS privacy controls denied read access, so the exact command names and runtime-field mapping must be confirmed in step 1.
