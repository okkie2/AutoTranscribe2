# Installation

## Prerequisites

| Requirement        | Notes |
|--------------------|--------|
| **Apple Silicon Mac** | Required for MLX Whisper. |
| **Node.js**        | v18+ recommended. |
| **Python 3**       | Venv with `pip install mlx-whisper`. |
| **Ollama**         | Optional; for title generation. Without it, titles fall back to `Untitled`. |
| **Git**            | For clone and contributing. |

## Quick start

From the project root:

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
npm run start:all
```

This builds the project, checks/starts Ollama if configured, starts the JPR ingester and the watcher. The JPR ingester polls the configured iCloud folder every 3 seconds for new recordings. Use `npm run stop:all` to stop everything.

## Installation steps

### 1. Clone and install Node deps

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
```

### 2. Python venv and MLX Whisper

The app uses the **mlx-whisper** Python package (tested with **0.4.3**) with the **whisper-large-v3-turbo** model (`mlx-community/whisper-large-v3-turbo`). Create a venv and install:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install mlx-whisper
```

To check the installed package version: `./.venv/bin/python -m pip show mlx-whisper` (or use your venv path from `config.yaml`).

### 3. Configure backend in config.yaml

Set your venv Python and script path. See [[Configuration]] for full config reference.

```yaml
backend:
  type: "mlx_whisper"
  python_executable: "/Users/<your-username>/Code/AutoTranscribe2/.venv/bin/python"
  script_path: "./py-backend/mlx_whisper_backend.py"
  language_hint: null  # or "nl" for Dutch
  options:
    model_size: "medium"
```

### 4. Build

```bash
npm run build
```

---

**Next:** [[Configuration]] for data directories and optional Ollama. [[Usage]] for commands and workflow.
