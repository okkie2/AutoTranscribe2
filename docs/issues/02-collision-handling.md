# Duplicate and collision handling

## Problem

If two recordings share the same timestamp or normalised filename, one could overwrite the other. That risks data loss for recordings or transcripts.

## Proposed solution

Before writing a new recording or transcript, check for an existing file with the same path. If it exists, use a numeric suffix: `_1`, `_2`, etc., until a free name is found. Apply this in both the JPR ingester (destination recording path) and the transcription pipeline (output transcript path). Optionally log when a collision was avoided.

## Acceptance criteria

- [ ] Ingest step never overwrites an existing file in the recordings directory; uses suffix when base name exists.
- [ ] Transcript output never overwrites an existing transcript file; uses suffix when base name exists.
- [ ] Behaviour is consistent and documented (e.g. in config or docs).
- [ ] No silent overwrites; at least one of: log message, config option, or doc note.
