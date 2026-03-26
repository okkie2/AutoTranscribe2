# Robustness Review

## 1. Executive summary

This codebase is functional but structurally fragile in the areas that matter most for a long-running local automation tool: runtime truth, recovery, operator trust, and dependency handling.

The biggest fragility themes are:

1. Runtime truth is fragmented across multiple weak signals rather than owned by one authoritative supervisor.
2. Job orchestration is in-memory and not restart-safe, so crash and restart behavior is only partially defined.
3. Status reporting is observational and stale-prone, which makes the operator UI easy to distrust.
4. File ingestion relies on timing, naming, and polling assumptions that are workable but not robust enough for real-world file movement and partial writes.
5. Long-running work cannot be cancelled or safely drained in a first-class way; stop/restart behavior is process-driven rather than job-driven.
6. External dependency handling, especially Ollama, has improved locally but is still not modeled as an explicit degraded mode with clear recovery semantics.
7. Configuration contains misleading knobs and duplicated intent, which increases operator confusion and change risk.
8. The current test suite is mostly unit and seam-level; the highest-risk behavior lives in process boundaries and integration flows that are not covered deeply enough.
9. Source and runtime artifacts are too entangled: `dist/` is a committed part of the repo, long-lived processes load old code, and on-disk changes do not become operational truth until the right process is restarted.

Overall judgement: the repository has workable building blocks and some recent hardening, but the system still behaves more like a collection of cooperating scripts than a supervised, durable service. It is serviceable for a single-user local tool, but it is not yet predictably reliable under restart, partial failure, slow dependencies, or ambiguous file-system events.

## 2. System model as understood

Current runtime model as implemented:

- A control layer in [src/application/WatcherControl.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/WatcherControl.ts) starts and stops two detached processes:
  - `dist/cli/ingestJustPressRecord.js`
  - `dist/cli/index.js watch`
- The ingest process polls the Just Press Record export location, waits for files to appear stable, copies them into the local recordings directory, and deletes the source file; see [src/cli/ingestJustPressRecord.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/ingestJustPressRecord.ts).
- The watcher process polls configured audio directories, records discoveries in a ledger, enqueues in-memory transcription jobs, and a worker consumes those jobs; see [src/infrastructure/watcher/FileSystemPoller.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/watcher/FileSystemPoller.ts), [src/domain/TranscriptionJobQueue.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/domain/TranscriptionJobQueue.ts), and [src/application/JobWorker.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/JobWorker.ts).
- Transcription is delegated to a Python backend process; see [src/infrastructure/backend/MlxWhisperBackend.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/backend/MlxWhisperBackend.ts) and [py-backend/mlx_whisper_backend.py](/Users/joostokkinga/Code/AutoTranscribe2/py-backend/mlx_whisper_backend.py).
- Title generation is optionally delegated to Ollama; see [src/infrastructure/title/OllamaTitleSuggester.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/title/OllamaTitleSuggester.ts).
- Runtime status is written to `runtime/status.json`; see [src/infrastructure/status/RuntimeStatus.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/status/RuntimeStatus.ts).
- The menu and status surfaces render a compact view by reconciling process discovery, lock files, PID files, latest transcript lookup, and runtime status freshness; see [src/application/ManagedWatcherStackReconciler.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/ManagedWatcherStackReconciler.ts), [src/application/StatusSnapshot.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/StatusSnapshot.ts), [src/cli/menu.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/menu.ts), and [src/cli/status.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/status.ts).

Important state/control artifacts:

- `runtime/status.json`
- `runtime/managed-stack.lock.json`
- `.autotranscribe2-pids.json`
- discovery ledger in the output directory
- trace JSONL logs
- detached OS processes
- in-memory queue state

This means the effective system behavior emerges across the CLI layer, application orchestration, file system side effects, and external subprocesses rather than from one clearly authoritative runtime service.

## 3. Findings by theme

### Finding 1: Runtime truth is fragmented and reconciled after the fact

Severity: critical

Why it is fragile:
- The system does not have one authoritative runtime owner. Instead, it infers truth from lock files, PID files, `ps`, status freshness, and the presence of detached processes.
- This makes contradictions normal rather than exceptional.

Evidence from the codebase:
- [src/application/ManagedWatcherStackReconciler.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/ManagedWatcherStackReconciler.ts) combines lock-file state, legacy PID file state, and process discovery heuristics to infer `reconciledProcessState`.
- [src/application/WatcherControl.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/WatcherControl.ts) writes lock/PID artifacts and spawns detached children, but it is not the persistent owner of ongoing truth after startup.
- [src/infrastructure/status/RuntimeStatus.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/status/RuntimeStatus.ts) writes a status file that can diverge from actual process state.

Likely real-world failure mode:
- UI says watcher is stopped while processes are alive, or says running while the meaningful work path is dead.
- Operator performs restart/stop based on misleading information and compounds the problem.

Recommended fix:
- Introduce a single authoritative runtime supervisor state file or control daemon that owns process lifecycle, job lifecycle, and health state directly.
- Reduce reconciliation to recovery and diagnostics, not normal operation.

### Finding 2: Queueing is in-memory and not restart-safe

Severity: critical

Why it is fragile:
- Job intent is not durable. Once a file has been discovered, the queue entry exists only in memory.
- Restart behavior during enqueued or in-flight work is therefore ambiguous.

Evidence from the codebase:
- [src/domain/TranscriptionJobQueue.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/domain/TranscriptionJobQueue.ts) is a simple in-memory FIFO with no persistence.
- [src/application/JobWorker.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/JobWorker.ts) dequeues directly from memory and has no recovery journal.
- [src/infrastructure/watcher/FileSystemPoller.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/watcher/FileSystemPoller.ts) persists discovery, not job state.

Likely real-world failure mode:
- File was discovered and maybe even queued, but a restart loses that work while the discovery ledger prevents easy rediscovery.
- Operator renames files repeatedly because the system lacks a first-class reprocess concept.

Recommended fix:
- Introduce a durable job ledger with explicit states such as `discovered`, `queued`, `processing`, `completed`, `failed`, `abandoned`, `retryable`.
- Rehydrate pending work on startup.

### Finding 3: Status freshness and activity are weak proxies for liveness

Severity: high

Why it is fragile:
- The system writes status opportunistically. Long-running work can continue while freshness becomes stale.
- Recent local fixes reduce false `idle` reporting, but the model still lacks an explicit heartbeat owned by active work.

Evidence from the codebase:
- [src/application/StatusSnapshot.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/StatusSnapshot.ts) uses a simple 30 second freshness threshold against `updatedAt`.
- [src/application/JobWorker.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/JobWorker.ts) updates status at phase transitions, not continuously during long-running transcription/title work.
- [src/cli/index.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/index.ts) has local logic to avoid overwriting active work with poll-loop `idle`, which is a symptom-management patch rather than a lifecycle model.

Likely real-world failure mode:
- Active transcription appears stale or ambiguous, undermining operator trust even when the job is still healthy.

Recommended fix:
- Add structured heartbeats for long-running job phases.
- Separate status concepts: `desired process state`, `observed process state`, `current job state`, `last heartbeat`, and `operator freshness`.

### Finding 4: Stop/restart behavior is process-driven, not job-driven

Severity: high

Why it is fragile:
- Stopping means sending signals to detached processes and waiting on coarse timeouts.
- There is no first-class drain/abort contract for active work.

Evidence from the codebase:
- [src/application/WatcherControl.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/WatcherControl.ts) sends `SIGINT`, waits for exit, and uses timeouts.
- [src/infrastructure/backend/MlxWhisperBackend.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/backend/MlxWhisperBackend.ts) runs a Python child process but does not expose cancellation or cooperative drain semantics.
- [src/application/JobWorker.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/JobWorker.ts) has no persisted lease/ownership for the in-flight job.

Likely real-world failure mode:
- Restart succeeds from the menu, but work either continues invisibly, exits late, or loses state.

Recommended fix:
- Model restart as a job-aware transition: `draining`, `stopping_after_current_job`, `force_stop`.
- Persist in-flight job ownership and restart recovery semantics.

### Finding 5: File ingestion and discovery are only partially robust against real file-system behavior

Severity: high

Why it is fragile:
- The ingest pipeline does a stable-file check before copy, but the watcher discovery path itself does not apply the same safety discipline.
- Discovery and reprocessing semantics are coupled to basename, file movement, and transcript filename heuristics.

Evidence from the codebase:
- [src/cli/ingestJustPressRecord.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/ingestJustPressRecord.ts) waits for stable files before copying from the source directory.
- [src/infrastructure/watcher/FileSystemPoller.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/watcher/FileSystemPoller.ts) scans directories, keys discovery by full path, and uses transcript-file existence heuristics to suppress duplicates.
- Discovery ledger entries are path-based, which makes rename retriggering an operational mechanism rather than a designed reprocess flow.

Likely real-world failure mode:
- Partially written or recently moved files are discovered too early.
- Duplicate or missing processing occurs depending on rename timing and output naming.

Recommended fix:
- Introduce a durable ingestion state machine with file fingerprints, stable-write detection on all watched paths, and explicit reprocess commands separate from rename hacks.

### Finding 6: External dependency handling is improved but still not a coherent degraded mode

Severity: high

Why it is fragile:
- Title generation and health checks have been locally improved, but the system still treats dependency trouble as request-level exceptions rather than explicit operational modes.
- Operator-facing behavior when Ollama is slow, absent, or unhealthy is still too implicit.

Evidence from the codebase:
- [src/infrastructure/title/OllamaTitleSuggester.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/title/OllamaTitleSuggester.ts) now has better timeout/error handling in the working tree.
- [src/application/WatcherControl.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/WatcherControl.ts) probes Ollama before start, but service readiness and degraded operation are still owned by control flow rather than a dependency state model.

Likely real-world failure mode:
- Transcription succeeds but titles fall back or fail in ways that are only visible in logs or by filename quality.
- Restart may report success while a key dependency is effectively degraded.

Recommended fix:
- Model Ollama readiness explicitly with statuses such as `ready`, `slow`, `unreachable`, `disabled`, `degraded_but_optional`.
- Surface that state in the dashboard and job records.

### Finding 7: Configuration contains misleading or dead abstractions

Severity: high

Why it is fragile:
- Operators believe they are controlling behavior that the runtime does not actually honor.
- Misleading config is worse than missing config because it destroys trust.

Evidence from the codebase:
- [src/infrastructure/config/YamlConfigLoader.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/config/YamlConfigLoader.ts) loads `backend.options.modelSize`.
- [py-backend/mlx_whisper_backend.py](/Users/joostokkinga/Code/AutoTranscribe2/py-backend/mlx_whisper_backend.py) is hard-wired to `mlx-community/whisper-large-v3-turbo` and does not appear to consume `modelSize`.
- Long-lived processes mean config fixes on disk are inert until the right processes restart.

Likely real-world failure mode:
- User changes config, sees no effect, and concludes the system is random or broken.

Recommended fix:
- Remove dead knobs or make them real.
- Add config validation at startup that reports ignored or contradictory settings.
- Surface the loaded effective config in status/diagnostics.

### Finding 8: Language handling is operationally important but only partially modeled

Severity: medium

Why it is fragile:
- The system needs multilingual support, but language detection quality is not reliable enough to be treated as invisible implementation detail.
- Recent working-tree changes add retry heuristics in [src/application/TranscriptionService.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/TranscriptionService.ts), which is a good mitigation, but the quality-validation model is still heuristic and local.

Evidence from the codebase:
- [src/application/TranscriptionService.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/TranscriptionService.ts) now retries suspicious transcripts with `nl` and `en`.
- The backend emits detected language, but there is no durable quality audit for why one variant was chosen.

Likely real-world failure mode:
- Wrong-language gibberish is accepted unless the heuristic catches it.
- Future changes regress mixed-language quality without obvious visibility.

Recommended fix:
- Persist transcript-selection diagnostics with each job.
- Treat language confidence and fallback decisions as first-class job metadata, not just logger output.

### Finding 9: The menu/control surface is safer than before but still tightly coupled to terminal behavior

Severity: medium

Why it is fragile:
- The recent input-parsing fix removed obvious duplicate key echo, but the UI still depends on raw-mode keyboard handling mixed with `readline`.
- Terminal control logic is hard to test comprehensively and remains a reliability risk for the operator path.

Evidence from the codebase:
- [src/cli/menu.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/menu.ts) pauses `readline`, toggles raw mode, and manages manual `data` listeners.
- [src/cli/menuActions.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/menuActions.ts) couples operator actions directly to runtime reconciliation calls.

Likely real-world failure mode:
- Buffered keys, awkward prompt transitions, or status-refresh/input races cause confusing operator behavior.

Recommended fix:
- Simplify the menu loop or move to one input model.
- Add PTY-driven integration tests for realistic terminal interactions.

### Finding 10: Tests do not yet cover the highest-risk operational boundaries

Severity: high

Why it is fragile:
- The system’s real risk is in restarts, partially written files, process coordination, and dependency degradation.
- Current tests cover seams and some logic, but not enough full-flow behavior.

Evidence from the codebase:
- Test suite in [package.json](/Users/joostokkinga/Code/AutoTranscribe2/package.json) runs compiled JS tests under `dist/__tests__`.
- Present tests include watcher control, diagnostics, poller, title suggester, menu input, and transcription service, but there is still no true durable queue recovery test or end-to-end restart-during-active-job test against persisted runtime artifacts.

Likely real-world failure mode:
- A change looks safe in unit tests but breaks restart, duplicate suppression, or dependency degradation behavior in live use.

Recommended fix:
- Add integration/end-to-end scenarios centered on persisted artifacts and subprocess behavior, not just pure functions.

### Finding 11: Source and build outputs are coupled in a way that increases drift risk

Severity: medium

Why it is fragile:
- The repo tracks both `src/` and `dist/`, so behavioral changes can be partially applied or reviewed inconsistently.
- Operators also interact with long-lived built artifacts, which amplifies confusion about what code is actually running.

Evidence from the codebase:
- Current working tree contains parallel edits in `src/` and `dist/`.
- Scripts in [package.json](/Users/joostokkinga/Code/AutoTranscribe2/package.json) execute `dist/` entrypoints exclusively.

Likely real-world failure mode:
- Review or manual edits miss corresponding `dist/` updates, or running processes continue serving old logic after source changes.

Recommended fix:
- Either stop versioning `dist/` or enforce a stronger source-to-build delivery discipline.
- Surface running build version and start time in status.

## 4. Root causes

Several findings come from the same underlying causes:

1. The system evolved as cooperating scripts rather than around one durable runtime authority.
2. Persistence is used for some side effects, but not for the core domain state of jobs and supervision.
3. Runtime UX was added through reconciliation layers, which means the UI often explains inferred truth rather than owned truth.
4. Process management and job management are conflated; signals and timeouts are standing in for lifecycle contracts.
5. File-system behavior is treated as mostly deterministic, but real-world ingestion is adversarial: partial writes, renames, race windows, and retries are normal.
6. Operationally important dependency behavior is not represented explicitly in the domain model.
7. Testing follows module boundaries more than system-risk boundaries.

## 5. Quick wins

1. Add durable job records before and after queue transitions.
2. Add active-job heartbeat updates during transcription and title generation.
3. Expose effective loaded config and dependency health in the status dashboard.
4. Remove or validate dead config such as non-honored model selection.
5. Add PTY-backed menu integration tests around restart, confirmation, and prompt transitions.
6. Add stable-file checks to all discovery paths, not just Just Press Record ingestion.
7. Record explicit job outcomes for dependency-degraded cases, not only completion/failure.

## 6. Structural redesign recommendations

1. Replace inference-heavy runtime reconciliation with a single supervisor model.
2. Introduce a durable job ledger and worker lease model.
3. Decouple ingestion discovery from transcription execution through explicit persisted job intent.
4. Model runtime state as separate concerns:
   - supervisor/process state
   - queue/job state
   - dependency health state
   - operator status summary
5. Move reprocessing from rename-based side effect to explicit command or recorded job action.
6. Create a proper degraded-mode contract for Ollama and other optional dependencies.
7. Consider reducing the number of independent long-lived processes or supervising them under one owned runtime.

## 7. Testing gaps

Highest-value tests to add next:

1. Restart during active transcription with durable recovery expectations.
2. Crash after discovery but before completion, with queue rehydration on restart.
3. Partially written file discovery on watched directories.
4. Duplicate and rename-based retrigger behavior against durable job state.
5. Slow, unavailable, and intermittently available Ollama behavior.
6. Status heartbeat behavior during long jobs.
7. PTY-driven menu interaction tests for realistic terminal input.
8. Transcript language fallback selection with persisted audit metadata.

## 8. Priority roadmap

### Now

- Make runtime truth and liveness more trustworthy.
- Add durable job state and recovery semantics.
- Add integration tests around restart, in-flight work, and stale status.

### Next

- Harden file ingestion against partial writes and duplicate triggers.
- Model dependency health and degraded mode explicitly.
- Improve operator control safety and terminal integration testing.

### Later

- Simplify architecture around a single supervisor/service model.
- Rework config and build/delivery ergonomics.
- Reduce or remove source/dist drift.

## 9. Appendix

### File/module references

- [src/application/WatcherControl.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/WatcherControl.ts)
- [src/application/ManagedWatcherStackReconciler.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/ManagedWatcherStackReconciler.ts)
- [src/application/JobWorker.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/JobWorker.ts)
- [src/application/TranscriptionService.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/application/TranscriptionService.ts)
- [src/domain/TranscriptionJobQueue.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/domain/TranscriptionJobQueue.ts)
- [src/infrastructure/watcher/FileSystemPoller.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/watcher/FileSystemPoller.ts)
- [src/infrastructure/status/RuntimeStatus.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/status/RuntimeStatus.ts)
- [src/infrastructure/backend/MlxWhisperBackend.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/backend/MlxWhisperBackend.ts)
- [src/infrastructure/title/OllamaTitleSuggester.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/infrastructure/title/OllamaTitleSuggester.ts)
- [src/cli/ingestJustPressRecord.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/ingestJustPressRecord.ts)
- [src/cli/menu.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/menu.ts)
- [src/cli/menuActions.ts](/Users/joostokkinga/Code/AutoTranscribe2/src/cli/menuActions.ts)
- [py-backend/mlx_whisper_backend.py](/Users/joostokkinga/Code/AutoTranscribe2/py-backend/mlx_whisper_backend.py)
- [package.json](/Users/joostokkinga/Code/AutoTranscribe2/package.json)

### Assumptions

- Review is based on the current working tree on March 26, 2026, including local uncommitted hardening work already present in the repository.
- The intended operational model is a single-user local macOS environment with Apple Silicon and local Ollama availability.
- Detached child-process execution is intentional today, even though it is a source of fragility.

### Open questions

1. Whether the current discovery ledger is intended to be the eventual source of truth for durable processing state or only a stopgap deduplication mechanism.
2. Whether the project wants to keep committed `dist/` outputs as part of delivery, or whether that is temporary.
3. Whether queue durability should survive only clean restarts or also hard crashes and machine reboots.
4. Whether mixed-language support should be best-effort or auditable and operator-visible.
