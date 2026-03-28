# AutoTranscribe2

[![CI](https://github.com/okkie2/AutoTranscribe2/actions/workflows/ci.yml/badge.svg)](https://github.com/okkie2/AutoTranscribe2/actions/workflows/ci.yml)

AutoTranscribe2 is a local-first speech-to-text tool for Apple Silicon Macs. It converts audio recordings into clean, readable Markdown transcripts using on-device speech-to-text (Parakeet MLX or Whisper). Drop audio files into a folder and they become structured notes with titles. Everything runs locally — no cloud, no uploads.

---

## What this does for you

1. Record audio (e.g. Just Press Record on your phone).
2. The recording syncs to your Mac via iCloud.
3. AutoTranscribe2 picks it up from iCloud and detects the new file.
4. AutoTranscribe2 moves this to the recordings folder.
5. You could also manually drop a file in recordings folder.
6. Anything in recordings folder gets picked up and LOCALLY transcribed by Parakeet MLX (or Whisper).
7. A titled Markdown transcript appears in your transcripts folder.

---

## Example output

```markdown
# Things to do tomorrow

**[00:00] Groceries**
Buy milk, eggs, and coffee.

**[00:12] Work**
Email Sally about the project timeline and schedule a short meeting.

**[00:25] Personal**
Call the garage to ask if the car is ready.

**[00:36] House**
Remember to water the plants and take out the recycling.

---

Original transcript

okay things to do tomorrow first buy milk eggs and coffee then...
```

---

## Why people use this

- Capture ideas while walking or commuting
- Turn meetings into notes automatically
- Record research interviews, dictate drafts, build a searchable archive

Transcripts are Markdown and work with Obsidian, Logseq, Notion, and Git.

---

## Use cases

- **Voice memos** – reminders, planning, capturing ideas
- **Meeting notes** – project meetings, stakeholder discussions, design sessions
- **Research interviews** – searchable transcripts, easy quoting
- **Writing** – blog posts, outlines, book notes
- **Knowledge archive** – searchable conversations that fit into your note system

---

## Key features

- **Automatic transcription:** run `autotranscribe watch` (or `npm run start:all`); new audio in watched folders is transcribed automatically.
- **Simple operational menu:** `autotranscribe menu` opens the lightweight `WatcherControl` entry point with a compact `StatusSnapshot`, manual refresh, start/stop/restart, recent Transcription Jobs, and opening the Latest Transcript.
- **Single-instance runtime guard:** menu control, `npm run start:all`, and launchd autostart all respect the same `ManagedWatcherStack` lock, so duplicate watcher stacks are refused instead of processing the same file multiple times.
- **Diagnostic tracing:** AutoTranscribe2 writes a lightweight JSONL `Diagnostic Trace` for CLI control flow, state observations, guard decisions, and transcript processing to `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl`.
- **Live status dashboard:** `npm run status` shows a terminal dashboard that refreshes every 500 ms with runtime activity, freshness, queue length, current job, and last error; data comes from `runtime/status.json`. Press Ctrl+C to exit.
- **Parakeet MLX or MLX Whisper** on Apple Silicon; switch backend from the menu or via `config.yaml`; optional Ollama for titles
- **Prettified output:** paragraphs, timestamps, labels; original transcript at bottom
- **JPR ingestion** via lightweight polling of the iCloud folder, plus **unified start/stop** (`npm run start:all` / `stop:all`)

---

## Quick start

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
```

Then choose how you want to run the app:

**Try quickly** — Use the simple operational entry point first.

```bash
./menu
```

This repo-local launcher works from the repository root without requiring `autotranscribe` on your `PATH`.
If you prefer the package script or installed CLI, the equivalent commands are:

```bash
npm run menu
autotranscribe menu
```

When the menu is shown or refreshed, a compact `StatusSnapshot` stays visible above the menu and shows `WatcherProcessState`, `RuntimeActivityState`, `StatusFreshness`, queue, the current transcription job, and the Latest Transcript filename.

Menu actions:

- **Show Watcher Status** – shows the detailed live status view from runtime status plus watcher process state.
- **Start Watcher** – starts the managed watcher stack (`ingest:jpr` + watcher, with Ollama check when configured) only if no valid stack lock already owns runtime control.
- **Stop Watcher** – stops only the managed watcher stack and cleans lock/PID artifacts when it shuts down cleanly.
- **Restart Watcher** – stops the managed watcher stack, verifies ownership cleanup, then starts a fresh stack.
- **Show Recent Transcription Jobs** – lists recent finished jobs from the existing log file.
- **Open Latest Transcript** – opens the Latest Transcript in the default macOS viewer.
- **Switch Backend** – toggles between `parakeet` and `mlx_whisper`; writes `config.yaml` in-place; takes effect on next watcher start.
- **Exit** – leaves the menu.

The menu is intentionally static while waiting for input. Refresh happens when the menu opens, after an action completes, when you press Enter on an empty line, or when you type `r`.

Internally, runtime control now uses `ManagedWatcherSupervisorState` as the primary lifecycle truth, `ManagedWatcherStackReconciler` as the process-validation layer, `WatcherControl` for start/stop/restart orchestration, and focused menu handlers for action policy.

You can still run directly in the foreground if you want the existing command flow. The app stops when you close the terminal or press Ctrl+C.

```bash
npm run start:all
```

**Run permanently in the background** — After the first run above, install the autostart agent so the app starts at every login and keeps running. You can then close the terminal; it will keep transcribing.

1. In `config.yaml`, set `autostart.enabled: true` (and leave `autostart.label` as-is).
2. Run once: `npm run autostart:install`

From then on, the app starts automatically when you log in. To stop it: `npm run stop:all`. To disable autostart, unload the launch agent (see [docs/usage.md](docs/usage.md)).

- **Status monitor:** In another terminal, run `npm run status` for the live-updating dashboard. Real-time monitoring belongs there; the menu stays static by design.

Autostart, the menu, and `start:all` all go through the same runtime ownership guard. If one managed stack is already running for this repo/runtime root, another start attempt is refused instead of creating duplicate watcher processes.

See [docs/usage.md](docs/usage.md) for full commands and autostart details.

If shell setup or an installed CLI is unavailable, the root-local fallback is:

```bash
./menu
```

To export the latest diagnostic bundle for debugging:

```bash
autotranscribe diagnostics
```

To probe the configured Ollama title endpoint and get the exact failure reason:

```bash
autotranscribe title-health
```

---

## Prerequisites

| Requirement        | Notes |
|--------------------|--------|
| **Apple Silicon Mac** | Required for MLX-based transcription. |
| **Node.js**        | v18+ recommended. |
| **Python 3**       | Venv with transcription packages installed (see below). |
| **Ollama**         | Optional; for title generation. |

**Transcription backends (choose one):**

- **Parakeet MLX** (recommended) — `pip install parakeet-mlx`. Uses `mlx-community/parakeet-tdt-0.6b-v3`. 3× faster and more accurate than Whisper on Dutch audio (WER 0.049 vs 0.073 on 200-sample benchmark). Set `backend.type: "parakeet"` in `config.yaml` or switch from the menu.
- **MLX Whisper** — `pip install mlx-whisper`. Uses `mlx-community/whisper-large-v3-turbo`. Default if no switch has been made.

---

## Documentation

**Install and uninstall guides:**

| Guide | Description |
|-------|-------------|
| [INSTALL.md](INSTALL.md) | Step-by-step fresh install: compatibility check, all dependencies, configuration, autostart |
| [UNINSTALL.md](UNINSTALL.md) | Complete removal guide with per-component checklist |

Wiki-ready docs under `docs/` (can be synced to GitHub Wiki):

| Page | Description |
|------|-------------|
| [docs/Home.md](docs/Home.md) | Overview, what it does, example output, use cases, key features |
| [docs/Installation.md](docs/Installation.md) | Prerequisites, quick start, install steps |
| [docs/Configuration.md](docs/Configuration.md) | `config.yaml`, data dirs, title/Ollama, ingest, autostart |
| [docs/Usage.md](docs/Usage.md) | Commands, workflow, autostart, what gets written where |
| [docs/Architecture.md](docs/Architecture.md) | Pipeline diagram, domain/application/infrastructure/CLI, project structure |
| [docs/Development.md](docs/Development.md) | Testing, contributing, TODO/roadmap, glossary |

Issue drafts: [docs/issues/](docs/issues/). Roadmap: [TODO.md](TODO.md).

## Roadmap

- Reliability first: strengthen automated testing, collision handling, and watcher robustness.
- Usability next: improve background visibility and CLI installation.
- Workflow improvements: extend ingestion options and transcript outputs.
- Future direction: explore a low-latency meeting assistant with a real-time transcription loop plus a delayed enrichment loop for summary, decisions, and action items.

**GitHub Wiki:** To fill the wiki, create the first page on the Wiki tab (one-time), then run `npm run push-wiki`.

### Note for existing users

This project supports **automatic transcription only**. The previous single-file command `autotranscribe transcribe <file>` has been removed. Use the watcher (`autotranscribe watch` or `npm run start:all`) so that new audio files in the configured directories are transcribed automatically.

---

## Development and testing

- **Unit tests:** `npm test` (runs build + unit tests). Used by the pre-push hook and CI.
- **Integration:** The automatic (watch) flow can be tested manually: start the watcher, add an audio file to the watched directory, and confirm a transcript appears. Not run in CI (requires Apple Silicon / MLX).
- **Pre-push hook:** After cloning, run `npm run install-hooks` once. Before each push, `npm run build` and `npm test` run automatically; if they fail, the push is blocked. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full commit/push workflow and how to fix or bypass when tests fail.

---

## License and attribution

- [LICENSE.md](LICENSE.md)
- [ATTRIBUTIONS.md](ATTRIBUTIONS.md)
