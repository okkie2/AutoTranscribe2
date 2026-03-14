# Watcher robustness

## Problem

Failed jobs (missing file, backend crash, incomplete file) can leave the watcher in a bad state: repeated retries, reprocessing the same file, or no clear recovery. Backend or filesystem issues should not require restarting the whole stack.

## Proposed solution

- Mark jobs as failed after a deterministic outcome (e.g. backend exit non-zero, file not found) and do not re-enqueue the same file for that run unless explicitly retried.
- Use existing “transcript already exists” logic to avoid reprocessing; ensure it is reliable for all output naming (including suffixed names).
- On backend crash or subprocess error, log clearly and continue polling; do not exit the watcher process. Optionally add a simple backoff or max-retries per file to avoid tight loops.
- Document expected behaviour when a file is incomplete or removed during processing.

## Acceptance criteria

- [ ] Failed jobs are not retried indefinitely for the same file in the same watcher run.
- [ ] Watcher does not reprocess a file that already has a corresponding transcript (including suffixed filenames).
- [ ] Backend crash or subprocess failure is logged and watcher keeps running.
- [ ] Behaviour with missing or incomplete source files is defined and documented.
