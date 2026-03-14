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

- **Two modes:** `autotranscribe transcribe <file>` and `autotranscribe watch`
- **MLX Whisper** on Apple Silicon; optional Ollama for titles
- **Prettified output:** paragraphs, timestamps, labels; original transcript at bottom
- **JPR ingestion** and **unified start/stop** (`npm run start:all` / `stop:all`)

---

## Quick start

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
npm run start:all
```

Use `npm run stop:all` to stop. See [docs/usage.md](docs/usage.md) for commands and autostart.

---

## Prerequisites

| Requirement        | Notes |
|--------------------|--------|
| **Apple Silicon Mac** | Required for MLX Whisper. |
| **Node.js**        | v18+ recommended. |
| **Python 3**       | Venv with `pip install mlx-whisper`. |
| **Ollama**         | Optional; for title generation. |

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

---

## Development and testing

- **Unit tests:** `npm test` (runs build + unit tests). Used by the pre-push hook and CI.
- **Integration test:** `npm run test:integration` — run locally when the watcher is not running; not run in CI (requires Apple Silicon / MLX).
- **Pre-push hook:** After cloning, run `npm run install-hooks` once. Before each push, `npm run build` and `npm test` run automatically; if they fail, the push is blocked. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full commit/push workflow and how to fix or bypass when tests fail.
