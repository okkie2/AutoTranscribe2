# Changelog

## 2026-09-09

- **perf: stop paying for language fallback passes that cannot help** — the fallback ran two extra full transcription passes on every long recording, tripling transcription time. It now also requires the auto-detected transcript to score below an absolute floor of 20. Measured over 54 real fallback events (scores -1127.9, -0.4, -0.4, 6.9, 16.3, 22.5 … median 36.4, max 47.2), 49 of 54 now finish in a single pass while every genuinely broken transcript still retries, including the -1127.9 outlier the fallback rescued.
- **feat: prune the recording archive** — `retention.keep_archived_recordings` keeps the newest N archived recordings and permanently deletes older ones; `0` keeps everything. Transcripts are never deleted, so the durable output survives the audio.
- **fix: generate titles again with reasoning-capable Ollama models** — `OllamaTitleSuggester` sent `format: "json"` with `num_predict: 32`. Reasoning models put the answer in the response's `thinking` field and left `response` empty, so every title failed with "Ollama returned an empty response body" and transcripts were written as `Untitled`. The request now sends `think: false` (accepted by non-reasoning models too), falls back to `thinking` when `response` is empty, and raises `num_predict` to 256.
- **change: default the title model to `qwen3.5:9b`** — the configured `qwen3:14b` is four generations old. Measured on nine real Dutch transcripts, `qwen3.5:9b` kept Dutch in 7/7 cases where `qwen3.5:4b` dropped to English once and `nemotron-3-nano:4b` did so four times.
- **fix: stop the Diagnostic Trace drowning in repeat poll events** — `FileSystemPoller` no longer traces `transcript_duplicate_ignored` for files it has already seen in this process. That branch fired for every known recording on every poll and accounted for 99.8% of a 126 MB trace file. The one-shot duplicate reasons (`already_claimed_in_durable_job_state`, `transcript_already_exists`) are still traced.
- **feat: bound the Diagnostic Trace size** — `TraceLogger` now rotates `cli-trace.jsonl` once it passes 5 MB and keeps exactly one previous generation, so trace usage stays bounded instead of growing without limit.
- **feat: archive transcribed recordings** — New `RecordingRetention` policy moves recordings with a `completed` `TranscriptionJob` out of the watched recordings folder into a configurable archive directory. The newest three recordings always stay in place so a recent one can be re-listened to or re-transcribed, and `pending`, `in_progress`, and `failed` recordings are never archived. Configured under `retention:` in `config.yaml`; runs at watcher startup and after each successful transcription.

## 2026-09-01

- **feat: add SwiftBar menu wrapper** — Added a five-second macOS menu-bar view, JSON status command, existing start/stop/restart controls, and safe install/uninstall scripts. The wrapper reads existing runtime state and does not own transcription queues.
- **fix: make the SwiftBar wrapper work outside an interactive shell** — The installer records the Node executable and the plugin runs commands from the configured repository root, so it works in SwiftBar's restricted environment.

## 2026-06-16

- **fix: recover from partial watcher stack on startup** — `startWatcherControl` now handles the `partial` reconciled state (one managed process alive) by sending SIGINT to the orphan and cleaning up before attempting a fresh start, instead of throwing an unrecoverable error. Prevents the crash loop that occurs when the watcher or ingest process dies but the other survives across a launchd restart.
- **fix: stop launchd restart loop for already-running stack** — Changed launchd plist `KeepAlive` from unconditional `true` to `{ SuccessfulExit: false }` so launchd no longer restarts `startAll` after a successful launch. `startAll` now also exits 0 (instead of 1) when the stack is already running, so a redundant restart attempt is treated as a no-op.

## 2026-04-11

- Hardened watcher restart and autostart recovery; stale running supervisor state after reboot is now treated as a stale lock and cleaned up on next start.

## Earlier

- Parakeet MLX backend, operational menu, iCloud Just Press Record ingestion, readable transcript format, unified start/stop, config-driven autostart.
