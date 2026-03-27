# Ubiquitous Language

This document mirrors the canonical glossary in the repository root: [../UbiquitousLanguageGlossary.md](../UbiquitousLanguageGlossary.md).

Prefer existing terms from that glossary in code, tests, docs, and CLI output.

Core operational terms for the CLI and runtime model:

- **WatcherControl**: Operational control surface for starting, stopping, restarting, and inspecting the watcher stack.

- **ManagedWatcherStack**: The single operator-managed runtime stack made up of the watcher and ingester processes.

- **ManagedWatcherSupervisorState**: Authoritative runtime state record for the managed watcher stack.

- **DurableJobClaim**: Persisted claim that an audio file path already belongs to a known transcription job.

- **StackLock**: The filesystem lock record that gives one `ManagedWatcherStack` ownership of runtime control.

- **StatusSnapshot**: Read model shown to an operator in the menu or status views.

- **LatestTranscript**: Most recently written transcript artifact in the configured transcript output directory.

- **Recent Transcription Jobs**: Preferred human-facing label for recent completed `TranscriptionJob` entries in the menu and docs.

- **WatcherProcessState**: Lifecycle state of the watcher process itself.

- **ReconciledProcessState**: The operational process result derived from `ManagedWatcherSupervisorState`, live PIDs, and fallback runtime ownership checks.

- **RuntimeActivityState**: Current runtime activity being performed by the system.

- **StatusFreshness**: Freshness of runtime status derived from `updatedAt`.

- **TitleProviderState**: Operator-facing readiness state for transcript title generation.

- **Draining**: Preferred operator-facing term for “stop or restart requested, current transcription still finishing cleanly”.

- **CurrentTranscriptionJob**: Current file or job reference shown to the operator in status output.

- **Diagnostic Trace**: Structured JSONL event log used to reconstruct control-flow and state-transition behaviour after the fact.

- **Real-time transcription loop**: Future low-latency path from audio directly to speech-to-text for a live transcript.

- **Delayed enrichment loop**: Future asynchronous path from transcript output to LLM-generated meeting artefacts.

  
