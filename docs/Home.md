# AutoTranscribe2

AutoTranscribe2 is a local-first speech-to-text tool for Apple Silicon Macs. It converts audio recordings into clean, readable Markdown transcripts using on-device Whisper. Drop audio files into a folder and they become structured notes with timestamps and titles. Everything runs locally — no cloud, no uploads.

## What this does for you

1. Record audio (e.g. Just Press Record on your phone).
2. The recording syncs to your Mac via iCloud.
3. AutoTranscribe2 picks it up from iCloud and detects the new file.
4. Whisper transcribes it locally.
5. A titled Markdown transcript appears in your transcripts folder.

You get a structured note you can read, search, and store in your notes system.

## Example output

Each transcript looks like this:

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

## Why people use this

- Capture ideas while walking or commuting
- Turn meetings into notes automatically
- Record research interviews, dictate drafts, build a searchable archive

Transcripts are Markdown and work with Obsidian, Logseq, Notion, and Git.

## Use cases

- **Voice memos** – reminders, planning, capturing ideas
- **Meeting notes** – project meetings, stakeholder discussions, design sessions
- **Research interviews** – searchable transcripts, easy quoting
- **Writing** – blog posts, outlines, book notes
- **Knowledge archive** – searchable conversations that fit into your note system

## Key features

- **Automatic transcription:** run `autotranscribe watch` (or `npm run start:all`); new audio in watched folders is transcribed automatically.
- **Simple operational menu:** `autotranscribe menu` opens the `WatcherControl` menu with an always-visible compact `StatusSnapshot`, manual refresh, status, start/stop/restart, recent Transcription Jobs, and the Latest Transcript.
- **Live status dashboard:** `npm run status` shows a terminal dashboard that refreshes every 500 ms (activity, freshness, queue, current job; data from `runtime/status.json`). Press Ctrl+C to exit.
- **MLX Whisper** on Apple Silicon (Python package **mlx-whisper** 0.4.x, e.g. 0.4.3; model `mlx-community/whisper-large-v3-turbo`); optional Ollama for titles
- **Prettified output:** paragraphs, timestamps, labels; original transcript at bottom
- **JPR ingestion** via lightweight polling of the iCloud folder, plus **unified start/stop** (`npm run start:all` / `stop:all`)

---

**Next steps**

- [[Installation]] – prerequisites, quick start, install steps
- [[Configuration]] – `config.yaml` and data directories
- [[Usage]] – commands, workflow, autostart
- [[Architecture]] – pipeline and project structure
- [[Development]] – testing, contributing, glossary
