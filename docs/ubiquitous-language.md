# Ubiquitous Language

This document mirrors the canonical glossary in the repository root: [../UbiquitousLanguageGlossary.md](../UbiquitousLanguageGlossary.md).

Prefer existing terms from that glossary in code, tests, docs, and CLI output.

Core operational terms for the CLI and runtime model:

- **WatcherControl**: Operational control surface for starting, stopping, restarting, and inspecting the watcher stack.
- **ManagedWatcherStack**: The single operator-managed runtime stack made up of the watcher and ingester processes.
- **StackLock**: The filesystem lock record that gives one `ManagedWatcherStack` ownership of runtime control.
- **StatusSnapshot**: Read model shown to an operator in the menu or status views.
- **LatestTranscript**: Most recently written transcript artifact in the configured transcript output directory.
- **WatcherProcessState**: Lifecycle state of the watcher process itself.
- **ReconciledProcessState**: The authoritative process result derived from lock files, live PIDs, and runtime ownership checks.
- **RuntimeActivityState**: Current runtime activity being performed by the system.
- **StatusFreshness**: Freshness of runtime status derived from `updatedAt`.
- **CurrentTranscriptionJob**: Current file or job reference shown to the operator in status output.
- **Diagnostic Trace**: Structured JSONL event log used to reconstruct control-flow and state-transition behaviour after the fact.
