# Usage

## Single-file transcription

```bash
autotranscribe transcribe /path/to/audio.m4a
```

Or without global link: `node dist/cli/index.js transcribe /path/to/audio.m4a`.

- Runs MLX Whisper on the file, generates a title (Ollama/heuristic/none), and writes a titled `.md` under the configured `output_directory`.
- The file contains a prettified body (paragraphs, timestamps, labels) and the original transcript at the bottom.
- Filename example: `2025-12-03_14-03-14_kennismaking-met-sabine.md`.

## Watcher mode

```bash
autotranscribe watch
```

- Polls `watch.directories` for new audio files, enqueues jobs, and writes transcripts to `output_directory`.
- Stop with `Ctrl+C`.

## Preview formatted output (no Node pipeline)

To get only the formatted transcript for a single file (e.g. to experiment with paragraph length):

```bash
source .venv/bin/activate
python py-backend/timestamp_preview.py /path/to/audio.m4a --language nl > preview.md
```

## Typical workflow

1. Record with Just Press Record or drop a `.m4a` into the recordings folder.
2. JPR ingester (if running) copies from iCloud into the recordings folder.
3. Watcher detects the new file.
4. MLX Whisper transcribes it; a title is generated (Ollama or fallback).
5. A Markdown transcript appears in the transcripts folder with timestamped paragraphs and the original text at the bottom.

## What gets written where

- **Recordings:** Input audio lives in the directory listed in `watch.directories` (default `~/Documents/AutoTranscribe2/recordings`). The JPR ingester writes normalised filenames there.
- **Transcripts:** Each transcript is written to `watch.output_directory` (default `~/Documents/AutoTranscribe2/transcripts`) as `{timestamp}_{slug}.md` or `{timestamp}_Untitled.md`.
- **Logs:** Console and file logs go to the path in `logging.log_file` (default `~/Documents/AutoTranscribe2/logs/autotranscribe.log`).

## Autostart on macOS

1. In `config.yaml`, set `autostart.enabled: true` and `autostart.label: "com.autotranscribe2.startall"`.
2. Run:

```bash
cd /Users/<your-username>/Code/AutoTranscribe2
npm run autostart:install
```

This installs a launchd plist that runs `npm run start:all` at login. Logs go to `~/Library/Logs/autotranscribe2.out.log` and `autotranscribe2.err.log`.

### start:all and stop:all

- **start:all:** Builds the project; if title provider is `ollama`, tries to start Ollama; spawns `ingest:jpr` and `autotranscribe watch`; writes child PIDs to `.autotranscribe2-pids.json`.
- **stop:all:** Sends `SIGINT` to those processes using the PID file, then removes the file.

---

**See also:** [[Configuration]] for data paths and options. [[Home]] for overview.
