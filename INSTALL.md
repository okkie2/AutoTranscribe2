# Installing AutoTranscribe2

A complete, step-by-step guide for a fresh install on an Apple Silicon Mac.
Read this top to bottom the first time — each step builds on the previous one.

---

## 1. Check compatibility

AutoTranscribe2 requires an Apple Silicon Mac (M1 or later). The transcription backends
use Apple's MLX framework, which only runs on Apple Silicon.

Open Terminal and run:

```bash
uname -m
```

Expected output: `arm64`. If you see `x86_64` the machine is Intel and the app will not work.

Also check available disk space. The full setup needs roughly:

| Component | Disk space |
|-----------|-----------|
| Repository + Node modules | ~400 MB |
| Python venv + Parakeet | ~1.5 GB |
| Parakeet model weights (downloaded on first use) | ~1.2 GB |
| Ollama + one title model (e.g. qwen3:14b) | ~9 GB |
| **Total** | **~12 GB** |

If you skip Ollama (titles fall back to a heuristic), you need about 3 GB.

---

## 2. Install Homebrew

Homebrew is the package manager used to install Node.js, Python, and Git.
If you already have it, skip this step.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, follow the instructions Homebrew prints to add it to your PATH
(usually two lines starting with `echo` and `eval`).

Verify:

```bash
brew --version
```

Reference: https://brew.sh

---

## 3. Install Node.js

AutoTranscribe2 is a Node.js application. Version 18 or later is required.

```bash
brew install node
```

Verify:

```bash
node --version   # should print v18.x or higher
npm --version
```

Reference: https://nodejs.org

---

## 4. Install Python 3

The transcription backend is a Python script. Python 3.11 or later is recommended.

```bash
brew install python@3.11
```

Verify:

```bash
python3 --version   # should print Python 3.11.x or higher
```

Reference: https://www.python.org

---

## 5. Install Git

Git is needed to clone the repository and receive updates.
If you already have it (try `git --version`), skip this step.

```bash
brew install git
```

---

## 6. Clone the repository

Choose a location. The example below uses `~/Code/AutoTranscribe2`.
You can use any path you prefer; just substitute it consistently through the rest of this guide.

```bash
mkdir -p ~/Code
git clone https://github.com/okkie2/AutoTranscribe2.git ~/Code/AutoTranscribe2
cd ~/Code/AutoTranscribe2
```

---

## 7. Install Node dependencies and build

```bash
npm install
npm run build
```

`npm install` downloads all Node.js packages listed in `package.json`.
`npm run build` compiles TypeScript to JavaScript in the `dist/` folder.
Both must complete without errors before you continue.

---

## 8. Create the Python virtual environment

A virtual environment keeps AutoTranscribe2's Python packages isolated from
other projects and from the system Python.

```bash
cd ~/Code/AutoTranscribe2
python3.11 -m venv .venv
```

Activate the environment and install the transcription backend:

```bash
source .venv/bin/activate
pip install parakeet-mlx
```

`parakeet-mlx` installs Apple Silicon–optimised Parakeet transcription.
The install downloads about 300 MB of Python packages.
The Parakeet model weights (~1.2 GB) are downloaded separately on first use.

Verify:

```bash
python -c "import parakeet_mlx; print('ok')"
```

If you also want the MLX Whisper backend available as a fallback:

```bash
pip install mlx-whisper
```

Deactivate the environment when you're done with setup steps:

```bash
deactivate
```

Reference: https://pypi.org/project/parakeet-mlx/

---

## 9. Install Ollama (optional, for automatic titles)

Ollama runs a local language model that generates a title for each transcript.
Without it, titles fall back to a short heuristic label (`Untitled` if that fails).

Download and install Ollama from https://ollama.com/download (macOS installer).

After install, start Ollama:

```bash
ollama serve &
```

Then pull a title model. The config default is `qwen3:14b` (~9 GB):

```bash
ollama pull qwen3:14b
```

Smaller alternative if disk space is tight — `qwen3:8b` (~5 GB):

```bash
ollama pull qwen3:8b
```

Verify Ollama is running:

```bash
curl http://127.0.0.1:11434/api/tags
```

You should see a JSON response listing your installed models.

Reference: https://ollama.com

---

## 10. Create data directories

AutoTranscribe2 reads audio from and writes transcripts to directories on your Mac.
The defaults below match the example `config.yaml`; adjust them to your preference.

```bash
mkdir -p ~/Documents/AutoTranscribe2/recordings
mkdir -p ~/Documents/AutoTranscribe2/transcripts
mkdir -p ~/Documents/AutoTranscribe2/logs
```

---

## 11. Edit config.yaml

Open `~/Code/AutoTranscribe2/config.yaml` in any text editor and personalise it.

The fields you must change are those containing your username in a path.
Replace `<your-username>` with the output of `whoami`.

**Minimum required edits:**

```yaml
watch:
  directories:
    - "/Users/<your-username>/Documents/AutoTranscribe2/recordings"
  output_directory: "/Users/<your-username>/Documents/AutoTranscribe2/transcripts"

backend:
  python_executable: "/Users/<your-username>/Code/AutoTranscribe2/.venv/bin/python"

logging:
  log_file: "/Users/<your-username>/Documents/AutoTranscribe2/logs/autotranscribe.log"

ingest:
  recordings_root: "/Users/<your-username>/Documents/AutoTranscribe2/recordings"
```

**If you are using Just Press Record (JPR):**

Set `ingest.jpr_source_root` to your JPR iCloud path. The default is:

```yaml
ingest:
  jpr_source_root: "/Users/<your-username>/Library/Mobile Documents/iCloud~com~openplanetsoftware~just-press-record/Documents"
```

**If you installed a different Ollama model:**

```yaml
title:
  ollama:
    model: "qwen3:8b"   # or whichever model you pulled
```

**If you skipped Ollama entirely:**

```yaml
title:
  provider: "heuristic"
```

Full configuration reference: [docs/configuration.md](docs/configuration.md)

---

## 12. Verify the setup

Run the menu to confirm everything is connected:

```bash
cd ~/Code/AutoTranscribe2
./menu
```

The menu opens and shows a compact status snapshot at the top.
If the status shows `stopped` that is expected — the watcher has not been started yet.

Select **1 – Show Watcher Status** to see the full status view.
Select **8 – Exit** to close the menu.

---

## 13. Start the watcher

From the menu, select **2 – Start Watcher**.

Or from the terminal:

```bash
npm run start:all
```

This starts both the JPR ingester (if configured) and the file watcher.
Drop an audio file into your recordings folder — a transcript should appear in
the transcripts folder within a minute or two depending on audio length.

---

## 14. Enable autostart (run at login)

To have AutoTranscribe2 start automatically every time you log in:

1. In `config.yaml`, confirm these values:

```yaml
autostart:
  enabled: true
  label: "com.autotranscribe2.startall"
```

2. Install the launchd agent:

```bash
cd ~/Code/AutoTranscribe2
npm run autostart:install
```

This registers a macOS Launch Agent under `~/Library/LaunchAgents/`.
From the next login onwards, AutoTranscribe2 starts automatically in the background.

To verify the agent is loaded:

```bash
launchctl list | grep autotranscribe
```

---

## 15. Make the CLI available on your PATH (optional)

If you want to type `autotranscribe` from any directory instead of always
running from the repo root:

```bash
cd ~/Code/AutoTranscribe2
npm link
```

Verify:

```bash
autotranscribe --version
```

To undo this at any time: `npm unlink -g autotranscribe2`

---

## What gets written where

| Item | Location |
|------|----------|
| Repository and code | `~/Code/AutoTranscribe2/` |
| Recordings (input) | `~/Documents/AutoTranscribe2/recordings/` |
| Transcripts (output) | `~/Documents/AutoTranscribe2/transcripts/` |
| Logs | `~/Documents/AutoTranscribe2/logs/` |
| Runtime state | `~/Code/AutoTranscribe2/runtime/` |
| Diagnostic trace | `~/Library/Logs/AutoTranscribe2/cli-trace.jsonl` |
| Autostart agent | `~/Library/LaunchAgents/com.autotranscribe2.startall.plist` |
| Ollama models | `~/.ollama/models/` |
| Python venv | `~/Code/AutoTranscribe2/.venv/` |

---

## Troubleshooting

**Watcher starts but no transcript appears**
- Check the log file: `tail -f ~/Documents/AutoTranscribe2/logs/autotranscribe.log`
- Run `autotranscribe title-health` to check the Ollama connection.
- Run `autotranscribe diagnostics` to export a debug bundle.

**Parakeet model download is slow**
- First-use model download (~1.2 GB) happens automatically from Hugging Face.
- If it stalls, check your internet connection and try again.

**Metal memory error on very long files**
- The default chunk duration is 300 seconds (5 minutes per chunk).
- For very long recordings this is handled automatically.

**`autotranscribe` command not found**
- Either run from the repo root with `./menu` or `npm run menu`, or follow step 15 above.

---

See also: [docs/usage.md](docs/usage.md) | [docs/configuration.md](docs/configuration.md)
