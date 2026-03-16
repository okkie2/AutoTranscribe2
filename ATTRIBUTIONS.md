# Attributions

This project's original source code is licensed under the MIT License. See
`LICENSE.md`.

## Bundled Node.js dependencies

These packages are installed through `npm install` and are declared in
`package.json` / `package-lock.json`.

| Package | Version | License |
| --- | --- | --- |
| `chalk` | `5.6.2` | MIT |
| `chokidar` | `3.6.0` | MIT |
| `yaml` | `2.8.2` | ISC |
| `typescript` | `5.9.3` | Apache-2.0 |
| `@types/node` | `22.19.15` | MIT |

Transitive npm dependencies recorded in `package-lock.json` include packages
under MIT and ISC licenses. If you redistribute this project with installed
dependencies or a bundled build, keep the corresponding upstream license texts
available as required by those licenses.

## External software and services used by this project

The following components are referenced by AutoTranscribe2 but are not bundled
in this repository:

| Component | Role |
| --- | --- |
| `mlx-whisper` | Python transcription package used by `py-backend/mlx_whisper_backend.py` |
| `mlx-community/whisper-large-v3-turbo` | Hugging Face model used for on-device transcription |
| `Ollama` | Optional local LLM runtime for title generation |
| `Just Press Record` | Optional recording source in the ingestion workflow |

These components remain subject to their own licenses, terms, and model usage
conditions from their respective authors/publishers. Users are responsible for
reviewing and complying with those upstream terms when installing or using
them.

## Notes

- No third-party source code appears to be vendored directly into this
  repository.
- The generated `dist/` files are build artifacts from this project's own
  TypeScript source.
- If you later add vendored code, fonts, icons, sample media, or copied license
  text from dependencies, update this file accordingly.
