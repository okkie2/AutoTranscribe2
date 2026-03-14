# Configuration

All configuration is in `config.yaml` in the project root. The application creates missing watch directories and log directories on first use.

## Key config sections

- **`watch`** – `directories`, `output_directory`, `include_extensions`, `polling_interval_seconds`, `mirror_source_structure`
- **`backend`** – `python_executable`, `script_path`, `language_hint`
- **`logging`** – `level`, `log_file`, `console`
- **`title`** – `enabled`, `provider` (`ollama` | `heuristic` | `none`), `ollama` endpoint/model
- **`ingest`** – `jpr_source_root`, `recordings_root`
- **`autostart`** – `enabled`, `label` (for macOS launchd)

## Data directories

Configure where recordings are read from, where transcripts and logs are written. Create on first use if missing.

```yaml
watch:
  directories:
    - "/Users/<your-username>/Documents/AutoTranscribe2/recordings"
  output_directory: "/Users/<your-username>/Documents/AutoTranscribe2/transcripts"

logging:
  log_file: "/Users/<your-username>/Documents/AutoTranscribe2/logs/autotranscribe.log"
```

Default paths:

| Purpose       | Default path |
|---------------|---------------|
| Recordings    | `~/Documents/AutoTranscribe2/recordings` |
| Transcripts   | `~/Documents/AutoTranscribe2/transcripts` |
| Logs          | `~/Documents/AutoTranscribe2/logs` |
| Runtime status | `runtime/status.json` (relative to project root; written when watcher runs) |

## Title / Ollama configuration

Optional local title generation via Ollama:

```yaml
title:
  enabled: true
  provider: "ollama"
  max_length: 80
  max_words: 5
  ollama:
    endpoint: "http://127.0.0.1:11434/api/generate"
    model: "llama3.1:8b-instruct-q4_K_M"
    temperature: 0.2
    timeout_ms: 20000
```

Then: `brew install ollama`, `ollama pull llama3.1:8b-instruct-q4_K_M`, `brew services start ollama`. If Ollama is unreachable, the app uses `Untitled` and `{timestamp}_Untitled.md`.

## Ingestion-related config

JPR (Just Press Record) ingestion:

- **`ingest.jpr_source_root`** – iCloud path to the JPR Documents folder (e.g. `~/Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents`)
- **`ingest.recordings_root`** – directory where copied recordings are written (typically the same as `watch.directories`)

## Autostart-related config

macOS login autostart:

```yaml
autostart:
  enabled: true
  label: "com.autotranscribe2.startall"
```

When `enabled` is true, `npm run autostart:install` writes a launchd plist to `~/Library/LaunchAgents/<label>.plist` that runs `npm run start:all` at login.

---

**See also:** [[Usage]] for how start/stop and autostart are used. [[Installation]] for initial setup.
