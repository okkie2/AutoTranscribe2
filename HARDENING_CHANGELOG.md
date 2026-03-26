# Hardening Changelog

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
  - New jobs are recorded before enqueue.
  - `JobWorker` now persists lifecycle transitions for `pending`, `in_progress`, `completed`, and `failed`.
  - Watcher startup now rehydrates recoverable queued jobs from the ledger into the in-memory queue.
- Failure mode addressed:
  - Discovered and queued work could disappear across restart because queue state existed only in memory.
- Test coverage:
  - `dist/__tests__/JobLedgerRecovery.test.js`
  - `dist/__tests__/TranscriptionWorkflow.test.js`
- Remaining risks / follow-up:
  - Restart during an actively running backend process still lacks a lease/drain model.
  - The ledger is durable job metadata, not yet a full supervisor-owned queue.
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
