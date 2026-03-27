# Architecture

## Overview

AutoTranscribe2 is built in layers: domain, application, infrastructure, and CLI. The Python MLX Whisper backend is invoked as a subprocess. Core logic is CLI-agnostic so a future GUI (e.g. menu bar app) can reuse the same services.

## Pipeline (flow diagram)

```
Audio file
   │
   ▼
Node CLI / Watcher
   │
   ▼
TranscriptionJobQueue
   │
   ▼
Python backend (Parakeet MLX or MLX Whisper)
   │
   ▼
Transcript formatter (paragraphs, timestamps, labels)
   │
   ▼
Markdown transcript (.md)
```

## Major layers

### Domain

Core concepts with no infrastructure dependency: `AudioFile`, `TranscriptionJob`, `TranscriptionJobState`, `Transcript`, `TranscriptionJobQueue`, `WatchConfiguration`. Defined under `src/domain/`.

### Application

High-level orchestration lives under `src/application/`.

- `TranscriptionService`: transcribe, title, and write transcripts.
- `JobWorker`: pull jobs from the queue and call the service.
- `ManagedWatcherSupervisorState`: authoritative runtime lifecycle record for the managed watcher stack.
- `ManagedWatcherStackReconciler`: validates supervisor state against live process checks and falls back to `StackLock` and legacy PID artifacts when supervisor state is absent.
- `WatcherControl`: start/stop/restart orchestration, compact `StatusSnapshot`, detailed watcher status, recent `TranscriptionJob`s, latest transcript lookup, and diagnostic state export.
- `StatusSnapshot`: separates `WatcherProcessState`, `RuntimeActivityState`, and `StatusFreshness`, while process state comes from the reconciled stack result.

### Infrastructure

Config, logging, backend adapter, watcher, runtime status: YAML config loader, `ConsoleAndFileLogger`, `TranscriptionBackend` implementations (Parakeet MLX and MLX Whisper via subprocess, selected by `BackendFactory`), `FileSystemPoller` for watcher mode, `RuntimeStatus` for writing/reading `runtime/status.json` (`runtimeActivityState`, queue length, current file, last error, freshness derived from `updatedAt`). Runtime control artifacts live alongside this status data: `runtime/managed-watcher-supervisor.json` is the primary lifecycle record, `runtime/managed-stack.lock.json` remains the start-safety `StackLock`, and `.autotranscribe2-pids.json` remains a legacy compatibility artifact. `FileSystemPoller` also persists a minimal discovery ledger in the transcript output directory so watcher restarts do not rediscover the same recordings. A lightweight tracing module writes the append-only `Diagnostic Trace` to `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl` for control-flow and state-transition debugging. Lives under `src/infrastructure/`.

### CLI

Entry point and commands live under `src/cli/`.

- `index.ts`: main command entry point (`watch`, `menu`, `diagnostics`, etc.).
- `menu.ts`: terminal rendering, input loop, and live detailed status subview.
- `menuActions.ts`: applicability checks, confirmations, and execution handlers for menu actions.
- `startAll`, `stopAll`, and launchd autostart all share the same `WatcherControl` single-instance path, so duplicate stacks are refused centrally rather than by per-command heuristics.
- Additional entry scripts: `status` (read and print runtime status), `autostartInstall`, `ingestJustPressRecord`, `titlePreview`.

### Python backend

Two backend scripts are available, selected via `backend.type` in `config.yaml`:

- `py-backend/parakeet_backend.py` — default; uses `parakeet_mlx`, returns `AlignedResult` with sentence-level timestamps formatted as `**[MM:SS] Label**` paragraphs.
- `py-backend/mlx_whisper_backend.py` — alternative; uses `mlx_whisper`, returns segment-level timestamps.

Both return JSON with `text`, `formatted_markdown`, and `language`. Switch from the menu (option 7) or by editing `config.yaml` directly.

`py-backend/timestamp_preview.py` is a standalone script for one-off formatted preview without running the full pipeline.

## Project structure

- **`src/domain/`** – AudioFile, TranscriptionJob, TranscriptionJobState, Transcript, TranscriptionJobQueue, WatchConfiguration
- **`src/infrastructure/`** – config (YAML), logging, backend (MLX Whisper), watcher (FileSystemPoller), status (RuntimeStatus → `runtime/status.json`)
- **`src/application/`** – TranscriptionService, JobWorker, ManagedWatcherStackReconciler, WatcherControl, StatusSnapshot
- **`src/cli/`** – CLI entry (`watch`, `menu`), menuActions, status viewer, startAll, stopAll, ingest, titlePreview
- **`py-backend/`** – `parakeet_backend.py` (default), `mlx_whisper_backend.py` (alternative), `timestamp_preview.py` for one-off formatted preview
- **`config.yaml`** – main configuration
- **`UbiquitousLanguageGlossary.md`** – domain glossary

---

**See also:** [[Development]] for glossary and contributing. [[Home]] for overview.
