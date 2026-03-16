# Usage

## Watcher (automatic transcription)

```bash
autotranscribe watch
```

Or without global link: `node dist/cli/index.js watch`.

- Polls `watch.directories` for new audio files, enqueues jobs, and writes transcripts to `output_directory`.
- Each new audio file is transcribed automatically; MLX Whisper runs, a title is generated (Ollama/heuristic/none), and a titled `.md` is written (e.g. `2025-12-03_14-03-14_kennismaking-met-sabine.md`) with a prettified body and the original transcript at the bottom.
- Stop with `Ctrl+C`.

## Menu (simple operational entry point)

```bash
autotranscribe menu
```

This opens a lightweight interactive menu with exactly these actions:

- A compact `StatusSnapshot` is always visible above the menu whenever it is shown or refreshed.
- The compact snapshot shows `WatcherProcessState`, `RuntimeActivityState`, `StatusFreshness`, queue, current job, and the `LatestTranscript` filename when available.
- The menu is intentionally static while waiting for input. Refresh happens when the menu opens, after an action completes, when you press Enter on an empty line, or when you type `r`.
- Menu actions, `start:all`, and autostart all use the same single-instance `ManagedWatcherStack` guard. If a valid stack lock already owns runtime control, start is refused instead of creating duplicate watcher stacks.

- **Show Watcher Status** – shows the fuller live status view based on `runtime/status.json`, the reconciled `ManagedWatcherStack`, and the current `LatestTranscript`.
- **Start Watcher** – starts the managed watcher stack (`ingest:jpr` + watcher, including the Ollama check when configured) only when the stack lock can be acquired safely.
- **Stop Watcher** – stops only the managed watcher stack, then cleans the stack lock and legacy PID artifacts.
- **Restart Watcher** – stops the managed watcher stack, verifies ownership cleanup, then starts it again.
- **Show Recent TranscriptionJobs** – lists recent finished jobs from the existing log file.
- **Open Latest Transcript** – finds the `LatestTranscript` in `watch.output_directory` and opens it with the default macOS viewer.
- **Exit** – closes the menu.

From the repo root, `npm run menu` is the local fallback if `autotranscribe` is not yet linked onto your `PATH`.

## Diagnostic bundle

```bash
autotranscribe diagnostics
```

This exports a lightweight debugging bundle that contains:

- the latest `Diagnostic Trace` from `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl`
- the current `config.yaml`
- the latest reconciled state snapshot

The trace is append-only JSONL and records CLI commands, state observations, transition guards, state mismatches, and transcript processing events. It is designed to let a coding agent reconstruct what happened during a control-flow session without relying on a manual retelling.

## Preview formatted output (no Node pipeline)

To get only the formatted transcript for a single file (e.g. to experiment with paragraph length):

```bash
source .venv/bin/activate
python py-backend/timestamp_preview.py /path/to/audio.m4a --language nl > preview.md
```

## Typical workflow

1. Record with Just Press Record or drop a `.m4a` into the recordings folder.
2. JPR ingester (if running) polls the JPR iCloud folder every 3 seconds and copies new recordings into the recordings folder.
3. Watcher detects the new file.
4. MLX Whisper transcribes it; a title is generated (Ollama or fallback).
5. A Markdown transcript appears in the transcripts folder with timestamped paragraphs and the original text at the bottom.

## What gets written where

- **Recordings:** Input audio lives in the directory listed in `watch.directories` (default `~/Documents/AutoTranscribe2/recordings`). The JPR ingester writes normalised filenames there.
- **Transcripts:** Each transcript is written to `watch.output_directory` (default `~/Documents/AutoTranscribe2/transcripts`) as `{timestamp}_{slug}.md` or `{timestamp}_Untitled.md`.
- **Logs:** Console and file logs go to the path in `logging.log_file` (default `~/Documents/AutoTranscribe2/logs/autotranscribe.log`).
- **Runtime status:** When the runtime is active, it writes `runtime/status.json` (next to `config.yaml`) with `runtimeActivityState`, queue length, current file, last error, and `updatedAt`. Freshness is derived separately from `updatedAt`.
- **Stack ownership:** `runtime/managed-stack.lock.json` is the `StackLock` for the managed watcher stack. AutoTranscribe2 reconciles that lock with live PIDs and the legacy `.autotranscribe2-pids.json` file before starting, stopping, or reporting process state.

## Live status dashboard

When the watcher is running (e.g. via `npm run start:all` or `autotranscribe watch`), you can see what it’s doing without reading logs:

```bash
npm run status
```

This starts a **live-updating terminal dashboard** that:

- Refreshes **every 500 ms** in place (no scrolling).
- Shows: **Activity**, **Freshness**, **Queue length**, **Current job** (if any), **Last update** time, **Last error** (if any).
- Uses colour on freshness: green (`fresh`), dim (`stale`), red (`missing`).
- Reads from the same `runtime/status.json` file the watcher updates.

Press **Ctrl+C** to exit the dashboard cleanly.

If the status file is missing or invalid, the dashboard shows fallbacks (`-`) and the path it looked for. If data is older than about 30 seconds, freshness is shown as `stale` (dim).

## Autostart on macOS

1. In `config.yaml`, set `autostart.enabled: true` and `autostart.label: "com.autotranscribe2.startall"`.
2. Run:

```bash
cd /Users/<your-username>/Code/AutoTranscribe2
npm run autostart:install
```

This installs a launchd plist that runs `npm run start:all` at login. Logs go to `~/Library/Logs/autotranscribe2.out.log` and `autotranscribe2.err.log`.

Autostart uses the same single-instance guard as the menu and `start:all`. If a valid managed stack already owns runtime control, launchd-triggered startup is refused instead of creating duplicates.

### start:all and stop:all

- **start:all:** Loads config, acquires the `StackLock`, checks Ollama when needed, starts `ingest:jpr` and `autotranscribe watch`, then records managed PIDs in both `runtime/managed-stack.lock.json` and the legacy `.autotranscribe2-pids.json`.
- **ingest:jpr:** Polls the configured Just Press Record iCloud folder every 3 seconds, waits for each `.m4a` file to stabilize, then copies it into the recordings folder and removes the source file.
- **stop:all:** Reconciles the managed watcher stack, sends `SIGINT` only to the managed processes it owns, and then removes lock/PID artifacts.
- **menu:** Reuses the same watcher control path for start/stop/restart, plus shows a static `StatusSnapshot`, recent `TranscriptionJob`s, and the `LatestTranscript`.

---

**See also:** [[Configuration]] for data paths and options. [[Home]] for overview.
