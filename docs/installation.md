# Installation

For a complete, step-by-step installation guide see **[INSTALL.md](../INSTALL.md)** in the repository root.

It covers:

- Compatibility check (Apple Silicon required)
- Homebrew, Node.js, Python 3, Git
- Python virtual environment and Parakeet MLX backend
- Optional Ollama for title generation
- `config.yaml` personalisation
- Data directories, autostart, and optional PATH setup

For removal, see **[UNINSTALL.md](../UNINSTALL.md)**.

---

## Quick reference

```bash
git clone https://github.com/okkie2/AutoTranscribe2.git
cd AutoTranscribe2
npm install
python3.11 -m venv .venv && source .venv/bin/activate && pip install parakeet-mlx
# edit config.yaml — replace <your-username> in all paths
npm run build
./menu
```

Full details and troubleshooting: [INSTALL.md](../INSTALL.md)

---

**See also:** [[Configuration]] for `config.yaml` reference. [[Usage]] for commands and workflow.
