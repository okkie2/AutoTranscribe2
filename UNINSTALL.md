# Uninstalling AutoTranscribe2

A complete guide to removing AutoTranscribe2 from your Mac.

Work through the sections that apply to your setup.
Each section is independent — skip any component you did not install.

---

## 1. Stop the watcher if it is running

```bash
cd ~/Code/AutoTranscribe2
npm run stop:all
```

Or from the menu: select **3 – Stop Watcher**.

---

## 2. Remove the autostart agent

If you enabled autostart in step 14 of INSTALL.md, remove the Launch Agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.autotranscribe2.startall.plist
rm ~/Library/LaunchAgents/com.autotranscribe2.startall.plist
```

Verify it is gone:

```bash
launchctl list | grep autotranscribe
```

No output means it has been removed.

---

## 3. Remove the global CLI link (if installed)

If you ran `npm link` in step 15 of INSTALL.md:

```bash
npm unlink -g autotranscribe2
```

Verify:

```bash
which autotranscribe   # should print nothing
```

---

## 4. Remove the repository

This removes the code, the Python virtual environment, the built output,
and all runtime state files.

```bash
rm -rf ~/Code/AutoTranscribe2
```

If you cloned to a different location, substitute that path.

---

## 5. Remove data directories (your choice)

These directories contain your recordings and transcripts.
**Delete them only if you no longer need the files inside.**

```bash
rm -rf ~/Documents/AutoTranscribe2
```

This removes:
- `recordings/` — your audio files
- `transcripts/` — all generated Markdown transcripts
- `logs/` — application log files

If you want to keep your transcripts but remove everything else:

```bash
cp -r ~/Documents/AutoTranscribe2/transcripts ~/Desktop/AutoTranscribe2-transcripts
rm -rf ~/Documents/AutoTranscribe2
```

---

## 6. Remove the diagnostic trace

AutoTranscribe2 writes a trace log to:

```bash
rm -rf ~/Library/Logs/AutoTranscribe2
```

---

## 7. Remove Ollama (optional)

Ollama may be used by other applications on your Mac (for example, Thunderbird AI
or other local LLM tools). Only remove it if no other app depends on it.

**Remove installed models first (optional, frees the most disk space):**

```bash
ollama list                  # see what is installed
ollama rm qwen3:14b          # remove a specific model
```

Models are stored in `~/.ollama/models/`. To remove all of them:

```bash
rm -rf ~/.ollama/models
```

**Uninstall Ollama itself:**

1. Stop the Ollama service: quit the Ollama app from the menu bar icon.
2. Delete the application: drag `/Applications/Ollama.app` to the Trash, or:

```bash
sudo rm -rf /Applications/Ollama.app
rm -rf ~/.ollama
```

Reference: https://github.com/ollama/ollama/blob/main/docs/faq.md#how-do-i-uninstall-ollama

---

## 8. Remove Node.js (optional)

Node.js is commonly used by many development tools. Only remove it if nothing
else on your Mac depends on it.

If you installed it with Homebrew:

```bash
brew uninstall node
```

---

## 9. Remove Python 3 (optional)

Python 3 is a system-level tool used by many applications. Only remove it if
you are certain nothing else depends on it.

If you installed it with Homebrew:

```bash
brew uninstall python@3.11
```

The virtual environment inside the repository folder is already gone if you
completed step 4.

---

## Summary checklist

| Component | Command | Safe to skip? |
|-----------|---------|--------------|
| Stop watcher | `npm run stop:all` | Skip if already stopped |
| Autostart agent | `launchctl unload ...` + `rm ...` | Skip if not installed |
| Global CLI link | `npm unlink -g autotranscribe2` | Skip if not linked |
| Repository folder | `rm -rf ~/Code/AutoTranscribe2` | Required for clean uninstall |
| Data directories | `rm -rf ~/Documents/AutoTranscribe2` | Optional — contains your transcripts |
| Diagnostic trace | `rm -rf ~/Library/Logs/AutoTranscribe2` | Optional |
| Ollama | See step 7 | Optional — may be used by other apps |
| Node.js | `brew uninstall node` | Optional — may be used by other tools |
| Python 3 | `brew uninstall python@3.11` | Optional — may be used by other tools |

---

## Reinstalling

If you want to start fresh, complete the uninstall above and then follow [INSTALL.md](INSTALL.md) from the beginning.
