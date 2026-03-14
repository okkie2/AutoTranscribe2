# Development

## Contributing notes

- **Config:** Single `config.yaml`; no dev/prod profiles yet.
- **Commits:** Prefer small, focused commits. Avoid committing large audio fixtures; use `test/fixtures/` and `.gitignore` if needed.

## Testing commands

- **Unit tests:** `npm test` – runs build and the TranscriptTitleFormatter (and other) unit tests.
- **Integration test:** `npm run test:integration` – runs the CLI `transcribe` command on a fixture and checks that a transcript is created with the expected shape. Run when the watcher stack is not running to avoid interference with the live queue.

## TODO / roadmap

Planned work is prioritised in `TODO.md` (reliability, usability, workflow, future ideas). Issue drafts for GitHub live in `docs/issues/`. When you push changes to `TODO.md` or `docs/issues/*.md`, a GitHub Action syncs the drafts to GitHub issues. Manual sync: `npm run sync-issues` (requires `gh` CLI and `gh auth login`).

## Ubiquitous language / glossary

See `UbiquitousLanguageGlossary.md` in the repo root. Core terms (AudioFile, TranscriptionJob, Transcript, TranscriptionBackend, Watcher, Poller, etc.) are used consistently in code, tests, and documentation.

---

**See also:** [[Architecture]] for layers and project structure. [[Home]] for overview.
