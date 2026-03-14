## AutoTranscribe2

AutoTranscribe2 is a local-first transcription tool for Apple Silicon, focused on **high-quality Dutch transcription**. It consists of:

- A Node/TypeScript CLI (`autotranscribe`)
- A Python backend that uses **MLX Whisper** for on-device speech recognition
- A simple watcher that monitors directories and transcribes new audio files into Markdown
 - An optional local title service (via **Ollama**) that generates short, descriptive titles for transcripts

The core logic is CLI-agnostic so it can be reused in a future macOS app.

### Quick start / stop

From the project root:

```bash
cd /Users/<your-username>/Code/AutoTranscribe2

# Start everything (Ollama check + JPR ingestion + watcher)
npm run start:all

# Stop everything again
npm run stop:all
```

What this does:

- **`start:all`**:
  - Builds the project.
  - If the title provider is set to `ollama`, checks whether the Ollama endpoint is reachable; if not, it attempts to run `brew services start ollama`.
  - Starts:
    - `ingest:jpr` – watches the Just Press Record iCloud folder and flattens new `.m4a` files into `~/Documents/AutoTranscribe2/recordings`.
    - The main watcher (`autotranscribe watch`) – polls the recordings folder and produces titled `.md` transcripts in `~/Documents/AutoTranscribe2/transcripts`.
  - Logs all actions to the console and writes the child PIDs to `.autotranscribe2-pids.json`.

- **`stop:all`**:
  - Reads `.autotranscribe2-pids.json`.
  - Sends `SIGINT` to both the ingester and the watcher.
  - Removes the PID file and logs what it did.

Use `start:all` when you begin a session, and `stop:all` when you’re done.

To have this stack start automatically when you log in on macOS:

```bash
# 1) Enable autostart in config.yaml
# autostart:
#   enabled: true
#   label: "com.autotranscribe2.startall"

cd /Users/<your-username>/Code/AutoTranscribe2
npm run autostart:install
```

This writes a `~/Library/LaunchAgents/com.autotranscribe2.startall.plist` that runs `npm run start:all` at login (and logs to `~/Library/Logs/autotranscribe2.*.log`).

### Features (MVP)

- **Two interaction modes**
  - `autotranscribe transcribe <audio-file>` – transcribe a single file
  - `autotranscribe watch` – long-running watcher that polls configured directories
- **Local MLX Whisper backend**
  - Uses `mlx-whisper` and MLX on Apple Silicon
  - Can auto-detect language or accept a language hint (e.g. Dutch)
- **Markdown output**
  - Writes `.md` transcripts alongside (or separate from) recordings
  - Adds a `# Title` heading at the top of each transcript
  - Uses `{timestamp}_{slug}.md` filenames (or `{timestamp}_Untitled.md` on fallback)
  - **Readable format**: body is split into paragraphs (alineas), each with a timestamp and short label (e.g. `**[00:00] Opening of the meeting**`), followed by the paragraph text
  - The **original, unformatted transcript** is appended at the bottom under `---` / "Original transcript", so nothing is lost
- **Logging**
  - Human-readable, timestamped logs to console
  - Same logs appended to a logfile on disk

### Project layout (high level)

- `src/domain/` – domain model (`AudioFile`, `TranscriptionJob`, `TranscriptionJobState`, `Transcript`, `TranscriptionJobQueue`, `WatchConfiguration`)
- `src/infrastructure/`
  - `config/` – YAML config loading and typed `AppConfig`
  - `logging/` – `Logger` interface and `ConsoleAndFileLogger`
  - `backend/` – `TranscriptionBackend` interface and MLX Whisper implementation
  - `watcher/` – polling `FileSystemPoller` for watcher mode
- `src/application/`
  - `TranscriptionService` – high-level transcription operations
  - `JobWorker` – processes `TranscriptionJob`s from a queue
- `src/cli/` – CLI entry point and commands
- `py-backend/` – Python MLX Whisper backend script
- `config.yaml` – main configuration file
- `UbiquitousLanguageGlossary.md` – domain language and glossary

### Data locations

Source code lives under the repository directory (e.g. `~/Code/AutoTranscribe2`).

By default, **runtime data** (recordings, transcripts, logs) lives under:

- `~/Documents/AutoTranscribe2/recordings` – input audio files
- `~/Documents/AutoTranscribe2/transcripts` – output `.md` transcripts
- `~/Documents/AutoTranscribe2/logs` – log files

These can be changed in `config.yaml`.

### Prerequisites

- **Node.js** (v18+ recommended)
- **Python 3** (Apple Silicon, with MLX / `mlx-whisper` support)
- **Ollama** (for local title generation, optional but recommended)
- Git (if you want to contribute or sync via GitHub)

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
```

2. **Install Node dependencies**

```bash
npm install
```

3. **Create a Python virtual environment and install MLX Whisper**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install mlx-whisper
```

4. **Configure the backend Python executable**

Edit `config.yaml` and set the `backend.python_executable` to your venv Python, for example:

```yaml
backend:
  type: "mlx_whisper"
  python_executable: "/Users/<your-username>/Code/AutoTranscribe2/.venv/bin/python"
  script_path: "./py-backend/mlx_whisper_backend.py"
  language_hint: null  # or "nl" to force Dutch
  options:
    model_size: "medium"
```

5. **Adjust data directories if needed**

In `config.yaml`, set where the watcher reads from and where transcripts/logs are written:

```yaml
watch:
  enabled: true
  directories:
    - "/Users/<your-username>/Documents/AutoTranscribe2/recordings"
  output_directory: "/Users/<your-username>/Documents/AutoTranscribe2/transcripts"

logging:
  log_file: "/Users/<your-username>/Documents/AutoTranscribe2/logs/autotranscribe.log"
```

The application will create missing watch directories and log directories on first use.

6. **(Optional) Configure the local title service**

Titles are configured via the `title` section in `config.yaml`. By default this repo enables a local Ollama-backed title suggester:

```yaml
title:
  enabled: true
  provider: "ollama" # "ollama" | "heuristic" | "none"
  max_length: 80
  max_words: 5
  language_hint: null
  ollama:
    endpoint: "http://127.0.0.1:11434/api/generate"
    model: "llama3.1:8b-instruct-q4_K_M"
    temperature: 0.2
    timeout_ms: 20000
```

To use this:

```bash
brew install ollama                  # if not already installed
ollama pull llama3.1:8b-instruct-q4_K_M
brew services start ollama           # run Ollama as a background service
```

If Ollama is unreachable or fails, the app falls back to `Untitled` titles and `{timestamp}_Untitled.md` filenames.

7. **Build the TypeScript code**

```bash
npm run build
```

### Usage

#### Single-file transcription

```bash
node dist/cli/index.js transcribe /path/to/audio.m4a
# or, if linked:
# autotranscribe transcribe /path/to/audio.m4a
```

This will:

- Run the Python MLX Whisper backend on the given file
- Generate a short title (using the configured title provider, e.g. Ollama)
- Write a titled Markdown transcript under the configured `output_directory`, e.g.:
  - `# Kennismaking met Sabine` (first line)
  - Body: timestamped paragraphs with short labels, then `---` and the original unformatted transcript at the bottom
  - Filename: `2025-12-03_14-03-14_kennismaking-met-sabine.md`
- Log progress to console and to the logfile

To preview the same formatted output for a single file without going through the Node pipeline (e.g. to experiment with paragraph length), from the project root with the venv activated: `python py-backend/timestamp_preview.py /path/to/audio.m4a --language nl > preview.md`

#### Watcher mode

```bash
node dist/cli/index.js watch
# or, if linked:
# autotranscribe watch
```

This will:

- Poll the configured `watch.directories` for new audio files
- Enqueue a `TranscriptionJob` for each new file
- Process jobs with the MLX Whisper backend
- For each file, generate a short title and write a titled `.md` transcript under `output_directory`,
  optionally mirroring the source directory structure

Stop the watcher with `Ctrl+C`.

### Ubiquitous language

The project uses a shared domain glossary documented in `UbiquitousLanguageGlossary.md`. Core concepts include:

- `AudioFile`
- `TranscriptionJob` and `TranscriptionJobState`
- `TranscriptionJobQueue`
- `Transcript`
- `TranscriptionBackend`
- `Watcher`, `Poller`, `WatchConfiguration`

These names are used consistently in code, tests, and documentation.

### Contributing / development notes

- Keep configuration in `config.yaml` (no separate dev/prod profiles yet).
- Prefer small, focused commits (e.g. “Add watcher polling loop”, “Improve MLX backend error handling”).
- Avoid committing large audio fixtures; they can live under `test/fixtures/` and be ignored via `.gitignore` if desired.
- Use `npm test` for fast unit tests; use `npm run test:integration` for the CLI end-to-end test (ideally when the watcher stack is not running).

