## TODO / Next Steps

Prioritised roadmap for AutoTranscribe2. Items are ordered by reliability first, then usability, then workflow.

---

## Already implemented

- **iCloud Just Press Record ingestion** – `npm run ingest:jpr` watches the JPR iCloud folder, flattens dated subfolders into the recordings directory, normalises filenames (`YYYY-MM-DD_HH-MM-SS_...`), optional cleanup after copy.
- **Readable transcript format** – Paragraphs with timestamps and labels; original transcript at bottom. Preview script: `python py-backend/timestamp_preview.py <file> --language nl`.
- **CLI integration test** – `npm run test:integration` runs the transcribe command on a fixture and checks output.
- **Unified start/stop** – `npm run start:all` (build, Ollama check, ingest:jpr + watcher); `npm run stop:all` (SIGINT via PID file).
- **Config-driven autostart** – `autostart.enabled` / `autostart.label` in `config.yaml`; `npm run autostart:install` writes launchd plist for login.

---

### Priority 1 — Reliability

- **Automated testing on each commit**
  - Add automated test runs on each push / pull request.
  - Start with:
    - `npm run build`
    - `npm test`
    - `npm run test:integration`
  - Add a GitHub Actions workflow so changes are checked automatically.
  - Where the real MLX backend is hard to run in CI, prefer a mocked backend for stable tests.

- **Duplicate and collision handling**
  - Ensure filename collisions cannot overwrite recordings or transcripts.
  - Likely solution: suffix numbering (`_1`, `_2`, ...).

- **Watcher robustness**
  - Handle failed jobs cleanly.
  - Avoid reprocessing the same files.
  - Make watcher behaviour resilient if the backend crashes or a file is incomplete.

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
