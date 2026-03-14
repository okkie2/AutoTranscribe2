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
import json
import math
import re
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
    # All diagnostics go to stderr; stdout must contain only structured result.
    sys.stderr.write(f"Transcription failed: {exc}\n")
    return 1

  text = result.get("text", "") or ""
  segments = result.get("segments") or []

  def format_timestamp(seconds: float) -> str:
    total = max(0, int(math.floor(seconds)))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours > 0:
      return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

  def build_short_label(paragraph_text: str, max_words: int = 6) -> str:
    clean = paragraph_text.strip()
    if not clean:
      return ""
    first_sent = re.split(r"(?<=[.!?])\s+", clean)[0]
    words = first_sent.split()
    if not words:
      return ""
    clipped = " ".join(words[:max_words])
    clipped = clipped.rstrip(".,!?;:…")
    return clipped

  def build_markdown_from_segments_with_timestamps(seg_list):
    paragraphs = []
    current_start = None
    current_text_parts = []
    current_len = 0
    last_start = None

    def flush_current():
      nonlocal current_start, current_text_parts, current_len
      if current_start is None:
        return
      text_block = " ".join(part.strip() for part in current_text_parts if part.strip())
      if text_block:
        paragraphs.append({"start": current_start, "text": text_block})
      current_start = None
      current_text_parts = []
      current_len = 0

    for seg in seg_list:
      try:
        start = float(seg.get("start", 0.0))
      except Exception:
        start = 0.0
      seg_text = str(seg.get("text", "")).strip()
      if not seg_text:
        continue

      start_new = False
      if current_start is None:
        start_new = True
      else:
        if last_start is not None and (start - last_start) >= 20.0:
          start_new = True
        elif current_len >= 500:
          start_new = True

      if start_new:
        flush_current()
        current_start = start

      current_text_parts.append(seg_text)
      current_len += len(seg_text)
      last_start = start

    flush_current()

    if not paragraphs:
      return ""

    lines = []
    for para in paragraphs:
      ts = format_timestamp(float(para["start"]))
      label = build_short_label(str(para["text"]))
      if label:
        lines.append(f"**[{ts}] {label}**")
      else:
        lines.append(f"**[{ts}]**")
      lines.append(str(para["text"]))
      lines.append("")

    return ("\n".join(lines)).rstrip() + "\n"

  def build_markdown_from_text(full_text: str) -> str:
    clean = (full_text or "").strip()
    if not clean:
      return ""
    raw_sentences = re.split(r"(?<=[.!?])\s+", clean)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    paragraphs = []
    current = []
    current_len = 0
    for sent in sentences:
      current.append(sent)
      current_len += len(sent)
      if current_len >= 500:
        paragraphs.append(" ".join(current))
        current = []
        current_len = 0
    if current:
      paragraphs.append(" ".join(current))

    lines = []
    for para in paragraphs:
      lines.append(para)
      lines.append("")
    return ("\n".join(lines)).rstrip() + "\n"

  formatted = ""
  if isinstance(segments, list) and segments:
    formatted = build_markdown_from_segments_with_timestamps(segments)
  if not formatted.strip():
    formatted = build_markdown_from_text(text)

  if text:
    if not formatted.endswith("\n"):
      formatted += "\n"
    formatted += "\n---\n\nOriginal transcript\n\n"
    formatted += text if text.endswith("\n") else text + "\n"

  payload = {
    "text": text,
    "formatted_markdown": formatted,
  }
  sys.stdout.write(json.dumps(payload, ensure_ascii=False))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

