# Contributing to AutoTranscribe2

## Developer workflow: commits and pushes

### Commit behaviour

Committing code does **not** run tests automatically. Commits are treated as local checkpoints and should remain fast. This is intentional: running tests on every commit becomes slow and frustrating.

### Push behaviour

Before a push, a **pre-push hook** runs:

- `npm run build`
- `npm test`

If either command fails:

- The pre-push hook fails
- Git blocks the push
- You see the error output in the terminal
- Fix the issue, run the tests again, then push again

This is intentional. The push is the correct moment to enforce checks before code reaches the remote.

### Full workflow

1. **Commit freely** while working. No tests run on commit.
2. **When you push**, build and unit tests run automatically (pre-push hook).
3. **If they fail**, the push is blocked until you fix the problem and pass the hook.
4. **After pushing**, GitHub Actions runs the same checks remotely (see [CI](#ci-on-github)).

### Emergency override

In rare situations you can bypass the pre-push hook:

```bash
git push --no-verify
```

Use this only when necessary (e.g. pushing a known temporary state or after verifying tests elsewhere). Prefer fixing the failure and pushing normally.

---

## Installing the pre-push hook

After cloning the repo, install the Git hooks once:

```bash
npm run install-hooks
```

This copies the hooks from `.githooks/` to `.git/hooks/`. The pre-push hook will then run before every push.

---

## Running tests locally

- **Unit tests:** `npm test` — runs build and unit tests (e.g. TranscriptTitleFormatter). Fast; used by the pre-push hook and CI.
- **Integration test:** `npm run test:integration` — runs the CLI `transcribe` command on a fixture. Requires the MLX Whisper environment; **not** run in the pre-push hook or in CI. Run when the watcher stack is not running.

---

## CI on GitHub

On every push and pull request to `main`, GitHub Actions runs:

- `npm ci`
- `npm run build`
- `npm test`

Integration tests are not run in CI (they require Apple Silicon and MLX Whisper). Run `npm run test:integration` locally when you change transcription or CLI behaviour.

---

## Other guidelines

- Prefer small, focused commits.
- Avoid committing large audio fixtures; use `test/fixtures/` and `.gitignore` if needed.
- Configuration lives in a single `config.yaml`; no dev/prod profiles yet.
