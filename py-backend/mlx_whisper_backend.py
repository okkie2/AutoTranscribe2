#!/usr/bin/env python3

"""
MLX Whisper backend for AutoTranscribe2.

This script:
- accepts an audio file path and optional --language argument
- runs mlx_whisper transcription (Apple Silicon–friendly)
- prints the raw transcript text to stdout

Node/TypeScript is responsible for writing the text to a .md file.
"""

import argparse
import sys

try:
  import mlx_whisper  # type: ignore[import]
except Exception as exc:  # pragma: no cover - import-time failure path
  sys.stderr.write(
    "Failed to import mlx_whisper. Make sure the Python environment for "
    "AutoTranscribe2 has mlx-whisper installed.\n"
    f"Underlying error: {exc}\n"
  )
  raise SystemExit(1)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="MLX Whisper backend")
  parser.add_argument("audio_path", help="Path to the audio file to transcribe")
  parser.add_argument(
    "--language",
    help=(
      "Optional language hint such as 'nl' for Dutch. "
      "If omitted, the model will auto-detect the language."
    ),
    default=None,
  )
  return parser.parse_args()


def main() -> int:
  args = parse_args()

  # Build kwargs so that we only force a language when the caller requested it.
  transcribe_kwargs = {
    "path_or_hf_repo": "mlx-community/whisper-large-v3-turbo",
    "condition_on_previous_text": False,
  }
  if args.language:
    transcribe_kwargs["language"] = args.language

  try:
    result = mlx_whisper.transcribe(
      args.audio_path,
      **transcribe_kwargs,
    )
  except Exception as exc:
    # All diagnostics go to stderr; stdout must contain only transcript text.
    sys.stderr.write(f"Transcription failed: {exc}\n")
    return 1

  text = result.get("text", "")
  # Print only the transcript text to stdout; Node will capture this.
  sys.stdout.write(text)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

