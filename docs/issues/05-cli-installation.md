# CLI installation

## Problem

Running `autotranscribe` requires either being in the project directory and using `node dist/cli/index.js` or manually adding the project to `PATH`. There is no single, documented way to get the `autotranscribe` command available globally.

## Proposed solution

Document or provide a one-step way to make `autotranscribe` available on `$PATH`:

- Document `npm link` from the project root (after `npm run build`) so that `autotranscribe` resolves to the project’s CLI.
- Or provide a small install script that builds and runs `npm link` (and optionally checks prerequisites).

Keep the approach simple and reversible (e.g. `npm unlink`).

## Acceptance criteria

- [ ] README or dedicated doc explains how to get `autotranscribe` on `$PATH` (e.g. `npm link`).
- [ ] After following the steps, user can run `autotranscribe transcribe <file>` and `autotranscribe watch` from any directory.
- [ ] Uninstall or “unlink” is documented (e.g. `npm unlink autotranscribe` or equivalent).
