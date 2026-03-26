# Operational watcher menu

Add a simple interactive CLI menu as the operational entry point for AutoTranscribe2.

## Problem

The repository already has watcher control commands (`watch`, `start:all`, `stop:all`) and a live status view, but day-to-day operation still requires remembering several commands. A small interactive menu would make common watcher actions and transcript inspection easier without adding a full TUI or GUI.

## Desired outcome

- Add `autotranscribe menu`.
- Render a compact always-visible `StatusSnapshot` above the menu whenever it is shown or refreshed.
- Show exactly these menu options:
  - Show Watcher Status
  - Start Watcher
  - Stop Watcher
  - Restart Watcher
  - Show Recent Transcription Jobs
  - Open Latest Transcript
  - Exit
- Reuse existing watcher control and runtime status logic rather than duplicating it.
- Keep the implementation dependency-free and native to the current CLI.
- Update docs, glossary, and wiki-ready pages.

## Acceptance criteria

- Running `autotranscribe menu` opens an interactive terminal menu.
- A compact always-visible `StatusSnapshot` is rendered above the menu whenever the menu is shown or refreshed.
- Watcher start/stop/restart reuse the existing operational path.
- Watcher status is shown as a concise formatted `StatusSnapshot`.
- Recent `TranscriptionJob`s come from existing logs or output artifacts.
- Latest transcript opens in the default macOS viewer.
