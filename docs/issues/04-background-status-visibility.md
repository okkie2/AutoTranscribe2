# Background status visibility

## Problem

When AutoTranscribe2 runs in the background (e.g. via autostart or `start:all`), users have no quick way to see whether it is running, idle, processing, or in an error state. They must check logs or process lists.

## Proposed solution

Provide a lightweight visual indicator that AutoTranscribe2 is running and what state it is in:

- **Idle** – watcher running, no job in progress.
- **Processing** – currently transcribing one or more files.
- **Error / attention needed** – e.g. backend repeatedly failing, or a clear failure that needs user action.

First direction: explore a small macOS menu bar or status item that shows these states and optionally opens logs or docs. Implementation can be a thin wrapper that reads from the same process/queue or a small sidecar that the main processes signal.

## Acceptance criteria

- [ ] User can see at a glance that AutoTranscribe2 is running (e.g. menu bar or status item).
- [ ] At least two states are distinguishable: idle vs processing (or “busy”).
- [ ] Optional: error/attention state is indicated when appropriate.
- [ ] Solution works when the app is started via autostart or `start:all`.
