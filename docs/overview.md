# Overview

AutoTranscribe2 is a local-first speech-to-text tool for Apple Silicon Macs. It converts audio recordings into clean, readable Markdown transcripts using on-device speech-to-text (Parakeet MLX or Whisper). Everything runs locally — no cloud, no uploads.

## What it does for you

1. Record audio (e.g. Just Press Record on your phone).
2. The recording syncs to your Mac (e.g. via iCloud).
3. AutoTranscribe2 detects the new file.
4. Parakeet MLX (or Whisper) transcribes it locally.
5. A titled, formatted Markdown transcript appears in your transcripts folder.

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

## Why people use it

- Capture ideas while walking or commuting
- Turn meetings into notes automatically
- Record research interviews
- Dictate drafts for writing
- Build a searchable archive of conversations

Transcripts are Markdown, so they work with Obsidian, Logseq, Notion, and plain Git repos.

## Use cases

- **Voice memos on the go** – reminders, planning your day, capturing ideas
- **Meeting notes** – project meetings, stakeholder discussions, design sessions
- **Research interviews** – searchable transcripts, easy quoting, original preserved
- **Writing and brainstorming** – blog posts, article outlines, book notes
- **Personal knowledge archive** – searchable archive that fits into Obsidian, Logseq, Git, etc.

See [README](../README.md) for quick start and [Usage](usage.md) for commands.
