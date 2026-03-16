# Development

## Developer workflow: commits and pushes

**Commit behaviour:** Committing does not run tests. Commits are local checkpoints and stay fast.

**Push behaviour:** Before each push, a pre-push hook runs `npm run build` and `npm test`. If either fails, the push is blocked and you see the error. Fix the issue, run tests again, then push. This is intentional: the push is the right moment to enforce checks.

**Full workflow:**

1. Commit freely while working.
2. When you push, build and unit tests run automatically.
3. If they fail, the push is blocked until the problem is fixed.
4. After pushing, GitHub Actions runs the same checks remotely.

**Emergency override:** In rare cases you can bypass the hook with `git push --no-verify`. Use only when necessary.

**Installing the hook:** After cloning, run `npm run install-hooks` once. See [CONTRIBUTING.md](../CONTRIBUTING.md) in the repo for full details.

## CI (GitHub Actions)

On every push and pull request to `main`, the CI workflow runs on Ubuntu with Node 20:

- `npm ci`
- `npm run build`
- `npm test`

Integration testing for the automatic (watch) flow is manual: run the watcher, add an audio file to the watched directory, and confirm a transcript appears. Not run in CI (requires Apple Silicon and MLX Whisper).

## Testing commands

- **Unit tests:** `npm test` – runs build and the TranscriptTitleFormatter, status, and WatcherControl unit tests.
- **Live status:** When the watcher is running, `npm run status` shows a live-updating terminal dashboard (refreshes every 500 ms; press Ctrl+C to exit). Data is read from `runtime/status.json`.

## TODO / roadmap

Planned work is prioritised in `TODO.md` (reliability, usability, workflow, future ideas). Issue drafts for GitHub live in `docs/issues/`. When you push changes to `TODO.md` or `docs/issues/*.md`, a GitHub Action syncs the drafts to GitHub issues. Manual sync: `npm run sync-issues` (requires `gh` CLI and `gh auth login`).

## Wiki (GitHub)

The `docs/` folder contains wiki-ready pages (Home, Installation, Configuration, Usage, Architecture, Development). To populate the GitHub Wiki:

1. **One-time:** On GitHub, open the repo → **Wiki** → **Create the first page**. Save any placeholder (e.g. title "Home", body "Welcome"). That creates the wiki repo.
2. **Push docs to wiki:** From the repo root run `npm run push-wiki`. This clones the wiki repo, copies the six pages from `docs/`, and pushes. Repeat after updating the wiki-ready docs.

## GitHub Project (roadmap board)

1. **Grant project scope (one-time):**  
   `gh auth refresh -s project`  
   Approve the new scope when prompted.

2. **Create and fill a new project:**  
   `npm run populate-project`  
   This creates "AutoTranscribe2 Roadmap", links it to the repo, and adds issues #1–#7.

3. **If you already have an empty project:** get its number from the project URL (e.g. `.../projects/2` → number is `2`), then run:  
   `npm run populate-project -- 2`  
   (Replace `2` with your project number.) This only adds the seven issues to that project.

## Ubiquitous language / glossary

See `UbiquitousLanguageGlossary.md` in the repo root and `docs/ubiquitous-language.md`. Core terms (AudioFile, TranscriptionJob, Transcript, TranscriptionBackend, Watcher, WatcherControl, WatcherProcessState, RuntimeActivityState, StatusFreshness, StatusSnapshot, LatestTranscript, Poller, etc.) are used consistently in code, tests, and documentation.

---

**See also:** [[Architecture]] for layers and project structure. [[Home]] for overview.
