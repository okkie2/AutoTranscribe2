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

- **TranscriptionBackend**: An abstraction for components that perform speech-to-text transcription. Given an `AudioFile` (and job parameters), it produces a `Transcript`. Concrete implementations: `MlxWhisperBackend` (MLX Whisper via Python subprocess) and `ParakeetBackend` (Parakeet MLX via Python subprocess). Selected at startup by `BackendFactory` based on `config.yaml` `backend.type`.

- **WatchConfiguration**: The configuration that controls how directories are monitored for new audio inputs (e.g. polling interval, include/exclude patterns, output directory rules).

- **Watcher**: The long-running component that periodically scans configured directories (using a `Poller` in the MVP) to discover new `AudioFile` instances and submit corresponding `TranscriptionJob`s into the `TranscriptionJobQueue`.

- **WatcherControl**: The operational control surface for the `Watcher`. It starts, stops, restarts, and reports on the watcher process using the managed runtime control model and CLI scripts.

- **ManagedWatcherStack**: The operator-managed runtime stack consisting of the watcher process and the Just Press Record ingester process. For a given repo/runtime root, only one managed stack may own runtime control at a time.

- **ManagedWatcherSupervisorState**: The authoritative runtime state record for the `ManagedWatcherStack`. It stores intended lifecycle, current operator-facing process state, owned PIDs, and transition detail in `runtime/managed-watcher-supervisor.json`.

- **DurableJobClaim**: The persisted ownership record that a specific `AudioFile` path already belongs to a known `TranscriptionJob`. It is the primary restart-safe dedupe signal for pending, in-progress, completed, or failed work.

- **StackLock**: The filesystem lock record that establishes ownership of the `ManagedWatcherStack`. It is used to prevent duplicate starts and to recover safely from stale runtime artifacts.

- **StatusSnapshot**: A concise read model for showing the current watcher state to an operator. Derived from runtime status data plus watcher process information, and used for human-readable status views.

- **WatcherProcessState**: The operator-facing lifecycle state of the watcher process itself. Current values: `running`, `stopped`, `starting`, `stopping`, `error`.

- **ReconciledProcessState**: The operational state derived from `ManagedWatcherSupervisorState`, managed process liveness, and fallback runtime-artifact checks. Current values: `starting`, `running`, `stopping`, `stopped`, `partial`, `staleLock`, `inconsistent`, `error`.

- **RuntimeActivityState**: The current runtime activity being performed by the system. Distinct from process lifecycle and freshness. Examples: `idle`, `scanning`, `waitingForStableFile`, `ingesting`, `enqueuingJob`, `processingTranscription`, `writingTranscript`, `completed`, `failed`.
- **Draining**: Preferred operator-facing term for the state where stop/restart has been requested but the current `TranscriptionJob` is still being allowed to finish cleanly.

- **StatusFreshness**: Freshness derived from `updatedAt` on runtime status. Current values: `fresh`, `stale`, `missing`. This is separate from `RuntimeActivityState`.
- **TitleProviderState**: Operator-facing readiness state for transcript title generation. Current values: `unknown`, `ready`, `degraded`, `disabled`.

- **LatestTranscript**: The most recently written `Transcript` in the configured transcript output directory. Used by operational flows that need to open or inspect the newest result quickly.
- **Latest Transcript**: Preferred human-facing CLI and documentation label for the `LatestTranscript` concept.

- **Recent Transcription Jobs**: Preferred human-facing CLI and documentation label for a list of recently completed `TranscriptionJob` records. Avoid the mixed form `TranscriptionJobs` in operator-facing text.

- **CurrentTranscriptionJob**: The currently active file or job reference shown to an operator in status views. In the current CLI this is represented by `currentFile` and, when available, `currentJobId`.

- **Diagnostic Trace**: A structured JSONL event log used to reconstruct runtime behaviour and debug state transitions across CLI control flow, state reconciliation, and transcript processing.

- **Poller**: The concrete mechanism used by the `Watcher` to detect file system changes via periodic scans (e.g. every N seconds). In later versions it may be replaced or augmented by real filesystem events without changing domain logic.

- **TranscriptionSession** (optional concept for later): A logical grouping of related `TranscriptionJob`s (e.g. all recordings from a single meeting or day). Not required for MVP but useful for future summarisation or reporting features.

- **Real-time transcription loop**: A future low-latency processing path where audio flows directly to speech-to-text and produces a live transcript without waiting for downstream enrichment.

- **Delayed enrichment loop**: A future asynchronous processing path where transcript output is sent to an LLM or other enrichment stage after the live transcript is already available.

- **Live transcript**: The low-latency transcript output produced by the real-time transcription loop. Prefer this term for the immediate meeting-time transcript before delayed enrichment outputs arrive.

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
