## TODO / Next Steps

Prioritised roadmap for AutoTranscribe2. Items are ordered by reliability first, then usability, then workflow.

---

## Already implemented

- **Operational menu** – `autotranscribe menu` opens a simple interactive `WatcherControl` menu with an always-visible compact `StatusSnapshot`, manual refresh, watcher status, start/stop/restart, recent `TranscriptionJob`s, and opening the `LatestTranscript`.
- **iCloud Just Press Record ingestion** – `npm run ingest:jpr` watches the JPR iCloud folder, flattens dated subfolders into the recordings directory, normalises filenames (`YYYY-MM-DD_HH-MM-SS_...`), optional cleanup after copy.
- **Readable transcript format** – Paragraphs with timestamps and labels; original transcript at bottom. Preview script: `python py-backend/timestamp_preview.py <file> --language nl`.
- **Unit tests** – `npm test` runs build and unit tests; integration for the watch flow is manual (run watcher, add file, check transcript).
- **Unified start/stop** – `npm run start:all` (build, Ollama check, ingest:jpr + watcher); `npm run stop:all` (SIGINT via PID file).
- **Config-driven autostart** – `autostart.enabled` / `autostart.label` in `config.yaml`; `npm run autostart:install` writes launchd plist for login.

---

### Priority 1 — Reliability

- **Automated testing on each commit**
  - Add automated test runs on each push / pull request.
  - Start with:
    - `npm run build`
    - `npm test`
  - Add a GitHub Actions workflow so changes are checked automatically.
  - Where the real MLX backend is hard to run in CI, prefer a mocked backend for stable tests.

- **Duplicate and collision handling**
  - Ensure filename collisions cannot overwrite recordings or transcripts.
  - Likely solution: suffix numbering (`_1`, `_2`, ...).

- **Watcher robustness**
  - Handle failed jobs cleanly.
  - Avoid reprocessing the same files.
  - Make watcher behaviour resilient if the backend crashes or a file is incomplete.
  - Add a thin enqueue-side deduplication guard if a single managed stack can still enqueue the same audio file more than once after stack locking.

---

### Priority 2 — Usability

- **Background status visibility**
  - Provide a lightweight visual clue that AutoTranscribe2 is running in the background.
  - Indicate whether the app is:
    - idle
    - processing
    - error / attention needed
  - First direction: explore a small macOS menu bar or status item.

- **CLI installation**
  - Provide a simple way to make `autotranscribe` available on `$PATH`.
  - Document `npm link` or provide a one-step install script.

---

### Priority 3 — Workflow improvements

- **Ingestion mode**
  - Add configuration so the user can choose how files are handled after ingestion:
    - `move` – current behaviour and default
    - `copy` – keep the original file in the source folder

---

### Future ideas

- **macOS GUI wrapper**
  - Explore a small GUI or menu bar app that reuses the same core services.

---

### Transcript summary block

Add an automatically generated summary above the prettified transcript in the Markdown output. Markdown remains canonical; summary may include main topics, decisions, action items, open questions.

- Design summary block format (Markdown structure, headings).
- Add summary generation step after transcription.
- Prepend summary to Markdown transcript in the writer.
- Add tests for summary insertion.
- Document summary behaviour in README.

---

### HTML transcript viewer with clickable timestamps

Generate an HTML transcript view with an audio player and clickable timestamps that jump to the correct moment. Markdown stays source of truth; HTML is an additional output.

- Extend transcript model to include timestamp seconds where needed.
- Create HTML transcript renderer (template or generator).
- Embed audio player in HTML output.
- Implement timestamp click → audio seek.
- Resolve audio path from config.
- Optionally generate transcript index page.
- Document HTML output.

---

### Evaluate improved transcription engines

Experiment with newer or higher-quality STT engines; compare accuracy, speed, resource use; keep pipeline modular and config-driven.

- Abstract or confirm transcription engine interface for pluggable backends.
- Add support for at least one alternative engine (e.g. Faster-Whisper, whisper.cpp).
- Benchmark transcription quality and speed.
- Document results.
- Allow engine selection via config.yaml.
