# Hardening Changelog

## 2026-03-27

### Parakeet MLX backend support

- What changed:
  - Added `parakeet` as a selectable `backend.type` in `config.yaml`.
  - New `py-backend/parakeet_backend.py` calls `parakeet_mlx` on Apple Silicon.
  - New `ParakeetBackend.ts` TypeScript class implementing `TranscriptionBackend`.
  - New `BackendFactory.ts` selects the right backend from config (replaces hard-coded `new MlxWhisperBackend(...)`).
  - Config loader accepts both `mlx_whisper` and `parakeet`; new `model_id` option passed through to Python script.
  - `parakeet-mlx` installed in AutoTranscribe2's venv.
- Motivation:
  - Benchmark (TranscribeBench, 200 Dutch samples) shows Parakeet `mlx-community/parakeet-tdt-0.6b-v3` outperforms MLX Whisper on both speed (0.168s vs 0.486s) and accuracy (WER 0.049 vs 0.073).
- Test coverage:
  - `dist/__tests__/BackendFactory.test.js`
  - `dist/__tests__/ConfigWriter.test.js`
- Backend switching from menu:
  - New "Switch Backend" option (7) in the operational menu.
  - Writes `type:` and `script_path:` to `config.yaml` in-place; in-memory config updated immediately.
  - Takes effect on next watcher start; menu informs the operator of this.
  - New `ConfigWriter.ts` handles targeted YAML field replacement without disturbing other config.
- Remaining risks / follow-up:
  - Parakeet does not expose a detected language; language fallback retry in `TranscriptionService` will operate without language detection signal.
  - No timestamps in Parakeet output; formatted markdown uses plain paragraphs only.

## 2026-03-26

### Runtime liveness truth

- What changed:
  - Added `lastHeartbeatAt` to runtime status.
  - Status freshness now treats a recent heartbeat as live evidence during active job phases.
  - The status dashboard now shows `Last heartbeat` separately from `Last update`.
  - `JobWorker` now emits periodic heartbeat updates while transcription is still running.
- Failure mode addressed:
  - Long-running jobs could appear stale or ambiguous even though work was still active.
- Test coverage:
  - `dist/__tests__/JobWorkerHeartbeat.test.js`
  - `dist/__tests__/StatusDashboard.test.js`
- Remaining risks / follow-up:
  - Heartbeats are still local file writes, not part of a durable supervisor state model.
  - Restart and crash recovery for in-flight jobs remain unresolved.

### Watched-file stability gate

- What changed:
  - `FileSystemPoller` now requires an audio file to remain unchanged across consecutive scans before enqueueing it.
  - New unstable files are tracked in-memory as pending until their size and mtime stabilize.
- Failure mode addressed:
  - Partially written or recently modified files in watched directories could be enqueued too early.
- Test coverage:
  - `dist/__tests__/FileSystemPoller.test.js`
- Remaining risks / follow-up:
  - Stability tracking is not yet durable across restart.
  - Fingerprinting is still based only on current path, size, and mtime; reprocessing is still rename-driven.

### Durable queued-job recovery

- What changed:
  - Added a durable `Transcription Job` ledger under the runtime directory.
  - New jobs are now durably claimed before enqueue.
  - `JobWorker` now persists lifecycle transitions for `pending`, `in_progress`, `completed`, and `failed`.
  - Watcher startup now rehydrates recoverable queued jobs from the ledger into the in-memory queue.
  - The poller now treats that durable job claim as the primary duplicate-suppression signal across restart, even when the legacy discovery ledger is missing.
- Failure mode addressed:
  - Discovered and queued work could disappear across restart because queue state existed only in memory.
  - Recovered pending work could also be rediscovered as a duplicate when restart happened without a matching discovery-ledger entry.
- Test coverage:
  - `dist/__tests__/JobLedgerRecovery.test.js`
  - `dist/__tests__/TranscriptionWorkflow.test.js`
- Remaining risks / follow-up:
  - Restart during an actively running backend process still lacks a lease/drain model.
  - The ledger is durable job metadata plus durable claims, but not yet a full supervisor-owned queue.
  - Recovery now covers both queued and previously `in_progress` jobs by rehydrating them as fresh pending work on restart.

### Workflow safety net and language alignment

- What changed:
  - Added a workflow test for the transcription pipeline that asserts timestamped transcript sections and meaningful titled filenames.
  - Added a scripted menu workflow test for status, start, restart, recent jobs, latest transcript, and stop.
  - Updated human-facing terminology to use `Recent Transcription Jobs` and `Latest Transcript` instead of leaking code-style identifiers into the menu and docs.
- Failure mode addressed:
  - Important user workflows were previously protected only by seam-level tests and could drift without being noticed.
- Test coverage:
  - `dist/__tests__/TranscriptionWorkflow.test.js`
  - `dist/__tests__/MenuWorkflow.test.js`
- Remaining risks / follow-up:
  - The menu test currently uses a controlled simulated runtime instead of a real PTY and real detached watcher processes.

### Draining stop semantics

- What changed:
  - Added an explicit `draining` `RuntimeActivityState`.
  - When stop/restart is requested during an active transcription, runtime status now reports that stop was requested and the current Transcription Job is being allowed to finish cleanly.
  - `JobWorker` heartbeats now preserve that draining state until the current job completes.
- Failure mode addressed:
  - Stop/restart during active work looked like an immediate stop request with no honest operator signal that the backend was still finishing the current transcription.
- Test coverage:
  - `dist/__tests__/JobWorkerHeartbeat.test.js`
  - `dist/__tests__/StatusDashboard.test.js`
- Remaining risks / follow-up:
  - This is still cooperative draining, not true cancellation of the underlying backend subprocess.

### Title-provider dependency state

- What changed:
  - Added `TitleProviderState` to runtime status with `unknown`, `ready`, `degraded`, and `disabled`.
  - The transcription path now updates runtime status when title generation is disabled, healthy, or degraded.
  - Status views now surface title-provider state and detail alongside activity and freshness.
- Failure mode addressed:
  - Ollama/title dependency problems previously showed up only as fallback behavior or logs, not as explicit runtime state.
- Test coverage:
  - `dist/__tests__/TranscriptionService.test.js`
  - `dist/__tests__/StatusDashboard.test.js`
- Remaining risks / follow-up:
  - This tracks title-provider degradation, but broader dependency-health modeling for the transcription backend is still separate work.

### Supervisor-owned runtime control

- What changed:
  - Added `ManagedWatcherSupervisorState` in `runtime/managed-watcher-supervisor.json`.
  - `WatcherControl` now writes explicit lifecycle transitions for `starting`, `running`, `stopping`, `stopped`, and `error`.
  - `ManagedWatcherStackReconciler` now prefers supervisor state as the primary lifecycle source and only falls back to lock/PID artifact reconciliation when supervisor state is absent.
  - Status and diagnostics now inherit lifecycle truth from the supervisor model instead of reconstructing it only from lock/PID artifacts.
- Failure mode addressed:
  - Start, stop, and status logic previously inferred runtime truth from several weak signals, which made control flow fragile and operator state harder to trust.
- Test coverage:
  - `dist/__tests__/WatcherControl.test.js`
  - `dist/__tests__/MenuWorkflow.test.js`
  - `dist/__tests__/Diagnostics.test.js`
- Remaining risks / follow-up:
  - The stack lock and legacy PID file still exist as compatibility and start-safety artifacts.
  - Queue ownership and dependency health are not yet fully supervisor-owned.
  - Backend cancellation is still cooperative rather than lease-based.
