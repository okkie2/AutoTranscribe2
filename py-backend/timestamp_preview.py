#!/usr/bin/env python3

"""
One-off timestamped transcript preview for AutoTranscribe2.

Usage (from project root, inside the AutoTranscribe2 virtualenv):

  python py-backend/timestamp_preview.py /path/to/audio.m4a > preview.md

This script does NOT integrate with the Node/TypeScript pipeline yet.
It is just for experimenting with timestamped Markdown for a single file.
"""

import argparse
import math
import re
import sys
from typing import Any, Dict, List

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
  parser = argparse.ArgumentParser(
    description="Preview timestamped Markdown transcript for a single audio file."
  )
  parser.add_argument("audio_path", help="Path to the audio file to transcribe")
  parser.add_argument(
    "--language",
    help="Optional language hint such as 'nl' for Dutch.",
    default=None,
  )
  return parser.parse_args()


def format_timestamp(seconds: float) -> str:
  """
  Convert raw seconds to a concise HH:MM:SS or MM:SS timestamp string.
  """
  total = max(0, int(math.floor(seconds)))
  hours, rem = divmod(total, 3600)
  minutes, secs = divmod(rem, 60)

  if hours > 0:
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
  return f"{minutes:02d}:{secs:02d}"


def build_short_label(text: str, max_words: int = 6) -> str:
  """
  Derive a very short "essence" label from a paragraph.

  Heuristic:
  - Take the first sentence.
  - Take the first few words.
  - Strip trailing punctuation.
  """
  clean = text.strip()
  if not clean:
    return ""

  # Take up to the first sentence.
  first_sent = re.split(r"(?<=[.!?])\s+", clean)[0]
  words = first_sent.split()
  if not words:
    return ""

  clipped = " ".join(words[:max_words])
  # Remove trailing punctuation characters.
  clipped = clipped.rstrip(".,!?;:…")
  return clipped


def build_markdown_from_text(text: str) -> str:
  """
  Build "normal" alineas (paragraphs) without per-line timestamps.

  Heuristic:
  - Take the full transcript text.
  - Split into sentences on '.', '?', '!' boundaries.
  - Group sentences into paragraphs until we reach ~400–600 characters,
    then insert a blank line and start a new paragraph.

  This favors readability over exact timing; timestamps can be reintroduced
  later at section boundaries if we like this shape.
  """
  full_text = text.strip()
  if not full_text:
    return ""

  # Very simple sentence splitter; good enough for preview.
  raw_sentences = re.split(r"(?<=[.!?])\s+", full_text)
  sentences = [s.strip() for s in raw_sentences if s.strip()]

  paragraphs: List[str] = []
  current: List[str] = []
  current_len = 0

  for sent in sentences:
    # Always add at least one sentence to a paragraph.
    current.append(sent)
    current_len += len(sent)

    # When paragraph is "long enough", start a new one.
    if current_len >= 500:
      paragraphs.append(" ".join(current))
      current = []
      current_len = 0

  if current:
    paragraphs.append(" ".join(current))

  lines: List[str] = []
  for para in paragraphs:
    lines.append(para)
    lines.append("")  # blank line between paragraphs

  return "\n".join(lines).rstrip() + "\n"


def build_markdown_from_segments_with_timestamps(
  segments: List[Dict[str, Any]],
) -> str:
  """
  Build alineas with a timestamp per paragraph, using segment start times.

  Heuristic:
  - Walk through segments in order.
  - Start a new paragraph when:
    * there is a pause of >= 20 seconds between segments, OR
    * the paragraph length exceeds ~500 characters.
  - Use the start time of the first segment in each paragraph as its timestamp.
  """
  paragraphs: List[Dict[str, Any]] = []
  current_start: float | None = None
  current_text_parts: List[str] = []
  current_len = 0
  last_start: float | None = None

  def flush_current() -> None:
    nonlocal current_start, current_text_parts, current_len
    if current_start is None:
      return
    text = " ".join(part.strip() for part in current_text_parts if part.strip())
    if text:
      paragraphs.append({"start": current_start, "text": text})
    current_start = None
    current_text_parts = []
    current_len = 0

  for seg in segments:
    start = float(seg.get("start", 0.0))
    text = str(seg.get("text", "")).strip()
    if not text:
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

    current_text_parts.append(text)
    current_len += len(text)
    last_start = start

  flush_current()

  if not paragraphs:
    return ""

  lines: List[str] = []
  for para in paragraphs:
    ts = format_timestamp(float(para["start"]))
    label = build_short_label(str(para["text"]))
    if label:
      lines.append(f"**[{ts}] {label}**")
    else:
      lines.append(f"**[{ts}]**")
    lines.append(str(para["text"]))
    lines.append("")  # blank line between paragraphs

  return "\n".join(lines).rstrip() + "\n"


def main() -> int:
  args = parse_args()

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
    sys.stderr.write(f"Transcription failed: {exc}\n")
    return 1

  # Prefer segment-based paragraphs with timestamps, but fall back robustly
  # to plain-text paragraphs if anything goes wrong.
  markdown = ""
  full_text = result.get("text", "")
  segments = result.get("segments")
  if isinstance(segments, list) and segments:
    markdown = build_markdown_from_segments_with_timestamps(segments)

  if not markdown.strip():
    if full_text:
      markdown = build_markdown_from_text(full_text)

  if not markdown:
    # Last-resort fallback: just dump raw text.
    markdown = full_text if full_text.endswith("\n") else full_text + "\n"

  # Append original, unformatted transcript so nothing is lost.
  if full_text:
    if not markdown.endswith("\n"):
      markdown += "\n"
    markdown += "\n---\n\nOriginal transcript\n\n"
    markdown += full_text if full_text.endswith("\n") else full_text + "\n"

  sys.stdout.write(markdown)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

