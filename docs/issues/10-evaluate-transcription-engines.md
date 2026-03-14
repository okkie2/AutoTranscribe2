# Evaluate improved transcription engines

## Problem

The current transcription engine may not be the best trade-off for accuracy, speed, or resource use. Evaluating alternatives keeps the pipeline competitive and allows swapping engines via configuration.

## Proposed solution

Experiment with newer or higher-quality speech-to-text engines. Goals: test alternatives to the current engine; compare accuracy, speed, and resource usage; keep the pipeline modular so different engines can be swapped. Plan an abstraction layer (e.g. `TranscriptionBackend` interface already exists; ensure config-driven engine selection). Identify at least two alternative engines for testing and document comparison criteria: accuracy, speed, hardware use. Plan engine selection via `config.yaml`. Possible candidates: Faster-Whisper, Whisper large-v3, MLX Whisper (current) for Apple Silicon, whisper.cpp newer models, other local STT engines as appropriate.

## Acceptance criteria

- [ ] Transcription engine abstraction layer is planned (or confirmed and extended).
- [ ] At least two alternative engines are identified for testing.
- [ ] Comparison criteria are documented: accuracy, speed, hardware use.
- [ ] Engine selection via `config.yaml` is planned.

## Suggested TODO breakdown

- Abstract or confirm transcription engine interface for pluggable backends.
- Add support for at least one alternative engine (spike or full integration).
- Benchmark transcription quality and speed across engines.
- Document results (e.g. in docs or wiki).
- Allow engine selection via `config.yaml`.
