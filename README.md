# AutoTranscribe2

[![CI](https://github.com/okkie2/AutoTranscribe2/actions/workflows/ci.yml/badge.svg)](https://github.com/okkie2/AutoTranscribe2/actions/workflows/ci.yml)

AutoTranscribe2 is a local-first speech-to-text tool for Apple Silicon Macs. It converts audio recordings into clean, readable Markdown transcripts using on-device Whisper. Drop audio files into a folder and they become structured notes with timestamps and titles. Everything runs locally — no cloud, no uploads.

---

## What this does for you

1. Record audio (e.g. Just Press Record on your phone).
2. The recording syncs to your Mac via iCloud.
3. AutoTranscribe2 detects the new file.
4. Whisper transcribes it locally.
5. A titled Markdown transcript appears in your transcripts folder.

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
- **Live status dashboard:** `npm run status` shows a terminal dashboard that refreshes every 500 ms with state (idle/processing/error), queue length, current file, and last error; data comes from `runtime/status.json`. Press Ctrl+C to exit.
- **MLX Whisper** on Apple Silicon; optional Ollama for titles
- **Prettified output:** paragraphs, timestamps, labels; original transcript at bottom
- **JPR ingestion** and **unified start/stop** (`npm run start:all` / `stop:all`)

---

## Quick start

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
```

Then choose how you want to run the app:

**Try quickly** — Run in the foreground (good for a first test). The app stops when you close the terminal or press Ctrl+C.

```bash
npm run start:all
```

**Run permanently in the background** — After the first run above, install the autostart agent so the app starts at every login and keeps running. You can then close the terminal; it will keep transcribing.

1. In `config.yaml`, set `autostart.enabled: true` (and leave `autostart.label` as-is).
2. Run once: `npm run autostart:install`

From then on, the app starts automatically when you log in. To stop it: `npm run stop:all`. To disable autostart, unload the launch agent (see [docs/usage.md](docs/usage.md)).

- **Status monitor:** In another terminal, run `npm run status` for a live-updating dashboard (refreshes every 500 ms; shows state, queue, current file). Press Ctrl+C to exit.

See [docs/usage.md](docs/usage.md) for full commands and autostart details.

---

## Prerequisites

| Requirement        | Notes |
|--------------------|--------|
| **Apple Silicon Mac** | Required for MLX Whisper. |
| **Node.js**        | v18+ recommended. |
| **Python 3**       | Venv with `pip install mlx-whisper`. |
| **Ollama**         | Optional; for title generation. |

**Transcription stack (Whisper):** The app uses [MLX Whisper](https://github.com/ml-explore/mlx-whisper) (Python package **mlx-whisper**, tested with **0.4.3**) with the **whisper-large-v3-turbo** model from `mlx-community/whisper-large-v3-turbo`. Install with `pip install mlx-whisper`; check the installed version with `./.venv/bin/python -m pip show mlx-whisper`.

---

## Documentation

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
