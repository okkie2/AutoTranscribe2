## Ubiquitous Language Glossary

This glossary defines the core concepts for the AutoTranscribe bounded context. Prefer these terms consistently in code, tests, documentation, CLI commands, and discussions.

### Core Domain Concepts

- **AudioFile**: A single audio recording that can be transcribed. Identified by its filesystem path and metadata (e.g. duration, format). Input to a `TranscriptionJob`.

- **TranscriptionJob**: A unit of work that represents transcribing a specific `AudioFile` into text. Owns configuration relevant to that transcription (e.g. output location, language hints, backend options).

- **TranscriptionJobState**: The lifecycle state of a `TranscriptionJob`. Expected states for MVP:
  - `pending`: The job is known but has not started processing.
  - `in_progress`: The job is currently being processed by a transcription backend.
  - `completed`: The job finished successfully and the transcript was written to disk.
  - `failed`: The job ended with an error that prevented successful completion.

- **Transcript**: The textual representation produced from an `AudioFile` by a `TranscriptionJob`. For MVP the primary persisted form is a `.md` (Markdown) file written to disk. The transcript should use the same language as the input audio unless explicitly configured otherwise.

- **TranscriptionJobQueue**: An in-memory (for MVP) queue of `TranscriptionJob` instances awaiting processing or currently being processed. Responsible for ordering, basic concurrency control, and exposing jobs to the worker that uses a transcription backend.

- **TranscriptionBackend**: An abstraction for components that perform speech-to-text transcription. Given an `AudioFile` (and job parameters), it produces a `Transcript`. Concrete example for MVP: a Python-based MLX Whisper backend invoked via subprocess.

- **WatchConfiguration**: The configuration that controls how directories are monitored for new audio inputs (e.g. polling interval, include/exclude patterns, output directory rules).

- **Watcher**: The long-running component that periodically scans configured directories (using a `Poller` in the MVP) to discover new `AudioFile` instances and submit corresponding `TranscriptionJob`s into the `TranscriptionJobQueue`.

- **WatcherControl**: The operational control surface for the `Watcher`. It starts, stops, restarts, and reports on the watcher process using the existing runtime files and CLI scripts.

- **StatusSnapshot**: A concise read model for showing the current watcher state to an operator. Derived from runtime status data plus watcher process information, and used for human-readable status views.

- **WatcherProcessState**: The operator-facing lifecycle state of the watcher process itself. Current values: `running`, `stopped`, `starting`, `stopping`, `error`.

- **RuntimeActivityState**: The current runtime activity being performed by the system. Distinct from process lifecycle and freshness. Examples: `idle`, `scanning`, `waitingForStableFile`, `ingesting`, `enqueuingJob`, `processingTranscription`, `writingTranscript`, `completed`, `failed`.

- **StatusFreshness**: Freshness derived from `updatedAt` on runtime status. Current values: `fresh`, `stale`, `missing`. This is separate from `RuntimeActivityState`.

- **LatestTranscript**: The most recently written `Transcript` in the configured transcript output directory. Used by operational flows that need to open or inspect the newest result quickly.

- **CurrentTranscriptionJob**: The currently active file or job reference shown to an operator in status views. In the current CLI this is represented by `currentFile` and, when available, `currentJobId`.

- **Poller**: The concrete mechanism used by the `Watcher` to detect file system changes via periodic scans (e.g. every N seconds). In later versions it may be replaced or augmented by real filesystem events without changing domain logic.

- **TranscriptionSession** (optional concept for later): A logical grouping of related `TranscriptionJob`s (e.g. all recordings from a single meeting or day). Not required for MVP but useful for future summarisation or reporting features.

### Supporting / Infrastructure Concepts

- **ConfigurationFile**: The YAML configuration file (`config.yaml`) that defines project-wide settings for the CLI and watcher (e.g. watched paths, polling interval, default output locations, backend configuration). One file for MVP; environment-specific variants may be added later.

- **CLICommand**: A user-invoked command exposed by the CLI interface. For MVP:
  - `autotranscribe watch`: Starts the long-running watcher process that submits `TranscriptionJob`s as new `AudioFile`s appear and transcribes them automatically.
  - `autotranscribe menu`: Opens the simple operational menu for `WatcherControl`, recent `TranscriptionJob` visibility, and opening the `LatestTranscript`.

- **LogEntry**: A single structured message produced by the logging system, including at least a timestamp, severity (e.g. info, warn, error), and human-readable text. For MVP, log entries are written both to the console and to a rolling or append-only logfile.

- **LogFile**: The persistent file on disk where log entries are appended. Used for later inspection and debugging of watcher runs.

### Terms Explicitly Avoided or Deferred

- **TranscriptArtifact**: Avoid this term for MVP. Use `Transcript` instead for the persistent text output.

- **JobStatus / JobState (generic)**: For now, use `TranscriptionJobState` to keep the concept clearly scoped to transcription. If future non-transcription jobs (e.g. copying from a cloud folder, distributing transcripts) are introduced, a more generic `Job` / `JobState` model can be added in a separate bounded context or module.
