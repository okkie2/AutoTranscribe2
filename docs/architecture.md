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

High-level orchestration: `TranscriptionService` (transcribe, title, write transcript) and `JobWorker` (pull jobs from queue, call service). Lives under `src/application/`.

### Infrastructure

Config, logging, backend adapter, watcher: YAML config loader, `ConsoleAndFileLogger`, `TranscriptionBackend` implementation (MLX Whisper via subprocess), `FileSystemPoller` for watcher mode. Lives under `src/infrastructure/`.

### CLI

Entry point and command: `watch` (automatic transcription), wired to application services. Lives under `src/cli/`. Additional entry scripts: `startAll`, `stopAll`, `autostartInstall`, `ingestJustPressRecord`, `titlePreview`.

### Python backend

`py-backend/mlx_whisper_backend.py` is invoked by the Node backend adapter. It runs MLX Whisper, returns JSON with `text` and `formatted_markdown`. `py-backend/timestamp_preview.py` is a standalone script for one-off formatted preview.

## Project structure

- **`src/domain/`** – AudioFile, TranscriptionJob, TranscriptionJobState, Transcript, TranscriptionJobQueue, WatchConfiguration
- **`src/infrastructure/`** – config (YAML), logging, backend (MLX Whisper), watcher (FileSystemPoller)
- **`src/application/`** – TranscriptionService, JobWorker
- **`src/cli/`** – CLI entry and commands
- **`py-backend/`** – MLX Whisper script; `timestamp_preview.py` for one-off formatted preview
- **`config.yaml`** – main configuration
- **`UbiquitousLanguageGlossary.md`** – domain glossary

---

**See also:** [[Development]] for glossary and contributing. [[Home]] for overview.
