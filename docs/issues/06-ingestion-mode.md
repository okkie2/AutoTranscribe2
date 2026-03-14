# Ingestion mode (move vs copy)

## Problem

The JPR ingester currently moves (or copies then deletes) files from the source folder. Some users may want to keep the original in the source folder and only copy into the recordings directory, e.g. for backup or to avoid deleting from iCloud before they are sure.

## Proposed solution

Add a configuration option for ingestion behaviour after a successful copy:

- **`move`** – current behaviour and default: remove the source file (and clean up empty date folders) after copying to the recordings directory.
- **`copy`** – keep the original file in the source folder; only copy to the recordings directory.

Place the option under the existing `ingest` section in `config.yaml` (e.g. `ingest.mode: "move"` or `"copy"`). Document in configuration docs and README.

## Acceptance criteria

- [ ] `config.yaml` supports an ingest mode option (e.g. `move` | `copy`).
- [ ] `move` preserves current behaviour (copy then delete source, cleanup empty dirs).
- [ ] `copy` only copies; source files and folder structure in the JPR source are left unchanged.
- [ ] Default is `move`; behaviour is documented.
