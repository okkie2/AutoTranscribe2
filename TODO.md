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

- **Duplicate and collision handling**
  - Decide how to handle name collisions (e.g. same timestamp twice):
    - Suffix (`_1`, `_2`), or
    - Skip with a warning.

### 2. Title service & quality

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

### 3. Watcher & robustness

### 4. Testing & observability

- **CLI integration test (implemented)**
  - Implemented as `src/__tests__/TranscribeIntegration.test.ts`:
    - Runs the CLI `transcribe` command on the weather fixture.
    - Ensures exactly one transcript is created.
    - Verifies the first line starts with `# `.
    - Intended to be run manually via `npm run test:integration` in a quiet environment (no watcher stack running), to avoid interference with the live queue.

### 5. Packaging & ergonomics

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

### 6. Autostart & background behavior

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


