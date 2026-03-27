# Robustness Action Plan

## Progress update

Completed on branch `hardening-runtime-robustness`:

- Active-work heartbeats were added so long-running transcription stays visible as live rather than merely "last updated".
- Watched-directory discovery now requires a file to remain unchanged across scans before it is enqueued.
- A durable Transcription Job ledger now records queued/in-progress/completed/failed jobs and rehydrates recoverable queued work on watcher startup.
- Workflow-level tests now cover the transcription pipeline and scripted menu control flows.

Still open:
- Restart drain and recovery semantics.
- Explicit dependency-health state model.
- PTY-backed menu integration coverage.
- Effective-config validation and dead-config cleanup.

## Recommended implementation order

1. Establish trustworthy runtime truth and liveness.
2. Make jobs durable and restart-safe.
3. Harden ingestion against partial writes, duplicates, and ambiguous rediscovery.
4. Formalize dependency health and degraded mode.
5. Stabilize the operator control surface with integration tests.
6. Remove misleading config and reduce source/runtime drift.
7. Pursue larger supervisor-oriented redesigns.

## Ordered recommendations

### 1. Introduce a durable job ledger

- Rationale: the current in-memory queue is the single largest reliability gap because restart and crash recovery are undefined for queued and in-flight work.
- Expected impact: very high
- Implementation difficulty: medium-high
- Suggested owner type: backend / architecture
- Type: redesign
- Dependencies: none

Details:
- Persist discovered jobs before enqueue.
- Persist transitions such as `queued`, `processing`, `completed`, `failed`.
- Rehydrate pending work on startup.

Status:
- Implemented in the current hardening branch.
- Covered by `dist/__tests__/JobLedgerRecovery.test.js` plus adjacent watcher and workflow tests.

### 2. Separate runtime truth into explicit state domains

- Rationale: the current dashboard conflates process state, job state, and status freshness into a single inferred picture.
- Expected impact: very high
- Implementation difficulty: medium
- Suggested owner type: architecture / platform
- Type: redesign
- Dependencies: item 1 improves this but is not strictly required

Details:
- Represent supervisor/process state separately from job state and dependency health.
- Keep reconciliation only for recovery and diagnostics.

### 3. Add active-work heartbeats

- Rationale: long-running jobs currently appear stale or ambiguous because status writes happen only at coarse transitions.
- Expected impact: high
- Implementation difficulty: medium
- Suggested owner type: backend / platform
- Type: quick win
- Dependencies: none

Details:
- Update heartbeat timestamps during transcription and title generation.
- Surface `lastHeartbeatAt` distinctly from `updatedAt`.

Status:
- Implemented in the current hardening branch.
- Covered by `dist/__tests__/JobWorkerHeartbeat.test.js` and expanded status dashboard tests.

### 4. Add restart-aware job draining and recovery semantics

- Rationale: current stop/restart behavior is signal- and timeout-driven rather than job-aware.
- Expected impact: high
- Implementation difficulty: medium-high
- Suggested owner type: backend / platform
- Type: redesign
- Dependencies: items 1 and 2

Details:
- Support `draining`, `stop_after_current_job`, and forced stop.
- Persist in-flight job ownership and restart recovery outcomes.

### 5. Harden watched-directory ingestion with stable-file detection and file fingerprints

- Rationale: file-system polling is sensitive to partially written files, renames, and basename heuristics.
- Expected impact: high
- Implementation difficulty: medium
- Suggested owner type: backend
- Type: quick win moving toward redesign
- Dependencies: item 1

Details:
- Require stability checks on all watched paths.
- Record file fingerprint metadata instead of relying only on path.
- Make reprocessing explicit instead of rename-driven where possible.

Status:
- Partially implemented in the current hardening branch via consecutive-scan stability checks in the watcher poller.
- File fingerprint persistence and explicit reprocess operations remain open.

### 6. Add high-value integration tests around runtime artifacts and subprocess behavior

- Rationale: the dominant risk is in operational boundaries, not isolated pure logic.
- Expected impact: high
- Implementation difficulty: medium
- Suggested owner type: test / platform
- Type: quick win
- Dependencies: none

Details:
- Cover restart during active work.
- Cover crash after discovery but before completion.
- Cover stale status versus active heartbeats.
- Cover partially written files.

Status:
- Expanded materially in the current hardening branch.
- Coverage now includes menu workflow control, transcript pipeline output, pending-job recovery, partial-write protection, and long-job heartbeats.

### 7. Formalize Ollama and dependency health states

- Rationale: optional dependencies are operationally important and should be explicit in the status model.
- Expected impact: medium-high
- Implementation difficulty: medium
- Suggested owner type: backend / platform
- Type: quick win moving toward redesign
- Dependencies: item 2

Details:
- Track readiness, degraded mode, and failure reason.
- Show dependency state in CLI surfaces and diagnostics.

### 8. Persist transcript-selection diagnostics for language fallback

- Rationale: mixed-language behavior is user-visible and quality-sensitive; heuristic fallback should be auditable.
- Expected impact: medium
- Implementation difficulty: medium
- Suggested owner type: backend
- Type: quick win
- Dependencies: item 1

Details:
- Store selected language hint, detected language, scoring rationale, and retry path with each job.

### 9. Simplify menu input handling and add PTY integration coverage

- Rationale: terminal control is still more fragile than a normal command interface and affects operator trust directly.
- Expected impact: medium
- Implementation difficulty: medium
- Suggested owner type: CLI/UI / test
- Type: quick win
- Dependencies: none

Details:
- Use one input model where possible.
- Add realistic PTY tests for menu selection, confirmation, and refresh behavior.

### 10. Validate effective config at startup and remove dead knobs

- Rationale: misleading config creates silent operator error and weakens confidence in the system.
- Expected impact: medium
- Implementation difficulty: low-medium
- Suggested owner type: backend / architecture
- Type: quick win
- Dependencies: none

Details:
- Warn on ignored settings.
- Emit effective loaded configuration in diagnostics.
- Either honor `modelSize` end-to-end or remove it.

### 11. Improve runtime diagnostics and auditability

- Rationale: debugging requires more than a single status file and recent transcript lookup.
- Expected impact: medium
- Implementation difficulty: medium
- Suggested owner type: platform
- Type: quick win
- Dependencies: items 2 and 7 help, but basic work can begin earlier

Details:
- Add structured event records for job lifecycle, dependency degradation, and recovery actions.
- Keep a compact recoverable audit trail separate from ad hoc logs.

### 12. Reduce source/build drift risk

- Rationale: committed `dist/` plus long-lived processes makes it hard to know what code is actually running.
- Expected impact: medium
- Implementation difficulty: medium-high
- Suggested owner type: platform / architecture
- Type: redesign
- Dependencies: delivery decision

Details:
- Either stop versioning `dist/` or enforce build/version discipline.
- Expose running build identity in status.

### 13. Consolidate toward a single runtime supervisor

- Rationale: this is the structural fix that resolves most reconciliation and lifecycle fragility.
- Expected impact: very high
- Implementation difficulty: high
- Suggested owner type: architecture / platform
- Type: redesign
- Dependencies: items 1, 2, 4, and 11

Details:
- Replace detached-script coordination with one long-lived authority that owns child processes, job lifecycle, and dependency state.
- Progress on 2026-03-26:
  - First slice implemented: `ManagedWatcherSupervisorState` is now the primary runtime truth for start/stop/status lifecycle state.
  - Remaining work: move queue ownership and dependency ownership fully under that supervisor model, then retire legacy lock/PID reconciliation as a fallback path.

## Dependencies between actions

- Durable job state is the foundation for restart safety, auditable language fallback, and cleaner runtime truth.
- Explicit runtime state domains make the dashboard and control surface honest.
- Stable-file ingestion should build on durable job records to avoid duplicate or lost work.
- Dependency-health reporting becomes much more useful once the status model distinguishes process, job, and dependency state.
- Full supervisor consolidation should come after the first round of runtime truth and job durability improvements, not before.

## Practical sequencing

### Now

1. Add integration tests around stale status, active work, and restart behavior.
2. Introduce heartbeat fields and use them in the dashboard.
3. Add a durable job ledger and queue rehydration.
4. Add partial-write protection to watched-directory discovery.

### Next

1. Add restart drain semantics and job recovery logic.
2. Formalize dependency health and degraded mode.
3. Persist transcript-selection diagnostics.
4. Strengthen PTY/menu integration coverage.
5. Remove dead config and expose effective config.

### Later

1. Reduce source/build drift.
2. Consolidate runtime supervision into one authoritative process model.
