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
Python MLX Whisper backend
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

High-level orchestration: `TranscriptionService` (transcribe, title, write transcript), `JobWorker` (pull jobs from queue, call service), and `WatcherControl` (start/stop/restart/status, compact `StatusSnapshot`, recent `TranscriptionJob`s, latest transcript lookup). `WatcherControl` now owns the single-instance `ManagedWatcherStack` guard and central reconciliation of `StackLock`, legacy PID file, live process checks, unmanaged watcher-like activity, and runtime ownership. `StatusSnapshot` separates `WatcherProcessState`, `RuntimeActivityState`, and `StatusFreshness`, while process state comes from the reconciled stack result. Lives under `src/application/`.

### Infrastructure

Config, logging, backend adapter, watcher, runtime status: YAML config loader, `ConsoleAndFileLogger`, `TranscriptionBackend` implementation (MLX Whisper via subprocess), `FileSystemPoller` for watcher mode, `RuntimeStatus` for writing/reading `runtime/status.json` (`runtimeActivityState`, queue length, current file, last error, freshness derived from `updatedAt`). Runtime ownership artifacts live alongside this status data: `runtime/managed-stack.lock.json` establishes `ManagedWatcherStack` ownership, while `.autotranscribe2-pids.json` remains as a legacy compatibility artifact. `FileSystemPoller` also persists a minimal discovery ledger in the transcript output directory so watcher restarts do not rediscover the same recordings. A lightweight tracing module writes the append-only `Diagnostic Trace` to `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl` for control-flow and state-transition debugging. Lives under `src/infrastructure/`.

### CLI

Entry point and commands: `watch` (automatic transcription) and `menu` (simple operational entry point), wired to application services. `menu`, `startAll`, `stopAll`, and launchd autostart all share the same `WatcherControl` single-instance path, so duplicate stacks are refused centrally rather than by per-command heuristics. Lives under `src/cli/`. Additional entry scripts: `startAll`, `stopAll`, `status` (read and print runtime status), `autostartInstall`, `ingestJustPressRecord`, `titlePreview`.

### Python backend

`py-backend/mlx_whisper_backend.py` is invoked by the Node backend adapter. It runs MLX Whisper, returns JSON with `text` and `formatted_markdown`. `py-backend/timestamp_preview.py` is a standalone script for one-off formatted preview.

## Project structure

- **`src/domain/`** – AudioFile, TranscriptionJob, TranscriptionJobState, Transcript, TranscriptionJobQueue, WatchConfiguration
- **`src/infrastructure/`** – config (YAML), logging, backend (MLX Whisper), watcher (FileSystemPoller), status (RuntimeStatus → `runtime/status.json`)
- **`src/application/`** – TranscriptionService, JobWorker, WatcherControl
- **`src/cli/`** – CLI entry (`watch`, `menu`), status viewer, startAll, stopAll, ingest, titlePreview
- **`py-backend/`** – MLX Whisper script; `timestamp_preview.py` for one-off formatted preview
- **`config.yaml`** – main configuration
- **`UbiquitousLanguageGlossary.md`** – domain glossary

---

**See also:** [[Development]] for glossary and contributing. [[Home]] for overview.
