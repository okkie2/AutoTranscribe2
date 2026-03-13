## TODO / Next Steps

This is a living list of next steps and ideas for AutoTranscribe2. Items are grouped roughly by area.

### 1. Ingestion & file handling

- **iCloud Just Press Record ingestion (implemented)**
  - Implemented as `npm run ingest:jpr`, which:
    - Watches the Just Press Record iCloud folder (e.g. `~/Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents`).
    - Recursively scans dated subfolders and flattens recordings into the data root (e.g. `~/Documents/AutoTranscribe2/recordings`).
    - Uses filenames of the form: `YYYY-MM-DD_HH-MM-SS_originalname.m4a`.
    - Deletes the source file and removes empty date folders after a successful copy.
  - Possible refinements:
    - Make deletion/cleanup behavior configurable.
    - Add a one-shot mode (ingest current backlog and exit) in addition to the long-running watcher.

- **Duplicate and collision handling**
  - Decide how to handle name collisions (e.g. same timestamp twice):
    - Suffix (`_1`, `_2`), or
    - Skip with a warning.

### 2. Transcript formatting & metadata

- **Metadata header**
  - Add a small header block above the title or just below it, e.g.:
    - Recording timestamp
    - Original file name
    - Duration (if easily available)
    - Language (from MLX / title service)

- **Section structure**
  - Optionally add basic sections to the `.md` output:
    - `## Transcript`
    - (Later) `## Summary` or `## Action items` if you decide to add a separate summariser.

### 3. Title service & quality

- **Guardrail tuning**
  - Collect a handful of “good” and “bad” titles from real meetings.
  - Use them to:
    - Refine the Ollama prompt.
    - Extend the generic-title blacklist.
    - Adjust max length and word limits.

- **Heuristic fallback refinement**
  - When provider is `"heuristic"`, improve the simple keyword/phrase heuristic using:
    - A small Dutch stopword + filler list (already present).
    - Prefer phrases containing rarer, content-heavy words.

### 4. Watcher & robustness

- **Ollama health check**
  - On startup, or before first title request:
    - Ping the configured Ollama endpoint.
    - If unreachable:
      - Log a clear warning: titles disabled, falling back to `Untitled`.

- **Backoff & retry**
  - When the title provider or backend fails intermittently:
    - Add simple retry with backoff (for titles only).

### 5. Testing & observability

- **Integration tests**
  - Add a small integration test (or script) that:
    - Runs `transcribe` on a known fixture.
    - Asserts that:
      - A `.md` file is created.
      - The first line starts with `# `.
      - The filename matches `{timestamp}_{slug}.md` or `{timestamp}_Untitled.md`.

### 6. Packaging & ergonomics

- **CLI installation**
  - Document or add `npm link` usage so `autotranscribe` is available on `$PATH`.
  - Provide a short “install” script or documented one-liner to:
    - Build the project.
    - Run `npm link` (or a local wrapper) so `autotranscribe` becomes globally available.

- **Mac app considerations (later)**
  - Keep CLI and core logic cleanly separated so a future GUI wrapper:
    - Can call the same `TranscriptionService` and watcher orchestration.
    - Can surface titles and transcripts without shelling out.

- **Easy uninstall / cleanup**
  - Document how to “uninstall” AutoTranscribe2 cleanly:
    - `npm unlink autotranscribe` (or equivalent if using a wrapper).
    - Optional removal of venv and local data folders (with a clear warning and explicit user action).

### 7. Autostart & background behavior

- **Autotranscribe watcher autostart (macOS)**
  - Add a helper or documented setup to have `autotranscribe watch` start automatically on macOS login, for example:
    - A small `launchd` plist that runs `node dist/cli/index.js watch` in the project directory.
    - Or a wrapper script that can be referenced from a launch agent.

- **Remove unused heuristics (when Ollama is stable)**
  - Once the Ollama-based title service is stable and preferred:
    - Remove or clearly separate the heuristic title suggester code.
    - Keep the interface (`TitleSuggester`) but simplify implementations to reduce maintenance.

- **Unified start/stop helper**
  - Implemented as:
    - `npm run start:all` – builds the project, checks/starts Ollama (when configured), then starts `ingest:jpr` and the main watcher.
    - `npm run stop:all` – sends `SIGINT` to both processes using a PID file and cleans up the PID file.
  - Both commands log their actions to the console for transparency.

- **Config-driven autostart flag**
  - Implemented:
    - `config.yaml` now has:
      - `autostart.enabled: true|false`
      - `autostart.label: "com.autotranscribe2.startall"`
    - `npm run autostart:install`:
      - Builds the project.
      - When `autostart.enabled: true`, writes a `~/Library/LaunchAgents/<label>.plist` that runs `npm run start:all` on login.
      - Reloads the launch agent via `launchctl load -w`.
  - Autostart can be toggled by editing `config.yaml` and re-running `npm run autostart:install`.


