#!/usr/bin/env python3

"""
Parakeet MLX backend for AutoTranscribe2.

This script:
- accepts an audio file path, optional --language, and optional --model-id
- runs parakeet_mlx transcription (Apple Silicon–friendly)
- prints a JSON payload to stdout: {"text": "...", "formatted_markdown": "...", "language": null}

Node/TypeScript is responsible for writing the text to a .md file.
"""

import argparse
import inspect
import json
import math
import re
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parakeet MLX backend")
    parser.add_argument("audio_path", help="Path to the audio file to transcribe")
    parser.add_argument(
        "--language",
        help="Optional language hint such as 'nl' for Dutch.",
        default=None,
    )
    parser.add_argument(
        "--model-id",
        dest="model_id",
        default="mlx-community/parakeet-tdt-0.6b-v3",
        help="HuggingFace model ID or short name for the Parakeet model.",
    )
    parser.add_argument(
        "--chunk-duration",
        dest="chunk_duration",
        type=float,
        default=300.0,
        help="Split audio into chunks of this many seconds before transcribing (default: 300).",
    )
    return parser.parse_args()


def _extract_text(output: object) -> str:
    """Extract plain text from the various output shapes parakeet_mlx may return."""
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, list):
        parts = [_extract_text(item) for item in output]
        return " ".join(p for p in parts if p).strip()
    for attr in ("text", "transcript", "transcription", "prediction"):
        val = getattr(output, attr, None)
        if isinstance(val, str) and val.strip():
            return val.strip()
    if isinstance(output, dict):
        for key in ("text", "transcript", "transcription", "prediction"):
            val = output.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        for key in ("result", "results", "candidates", "hypotheses"):
            if key in output:
                text = _extract_text(output[key])
                if text:
                    return text
    return ""


def _call_supported(fn, *args, **kwargs):
    """Call fn, silently dropping kwargs it does not declare."""
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return fn(*args, **kwargs)
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
        return fn(*args, **kwargs)
    supported = {k: v for k, v in kwargs.items() if k in sig.parameters}
    return fn(*args, **supported)


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(math.floor(seconds)))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _build_short_label(paragraph_text: str, max_words: int = 6) -> str:
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


def _format_sentences_as_markdown(sentences: list) -> str:
    """Format AlignedSentence list into timestamped paragraphs (same structure as Whisper output)."""
    paragraphs: list[dict] = []
    current_start: float | None = None
    current_parts: list[str] = []
    current_len = 0
    last_start: float | None = None

    def flush() -> None:
        nonlocal current_start, current_parts, current_len
        if current_start is None or not current_parts:
            return
        paragraphs.append({"start": current_start, "text": " ".join(current_parts)})
        current_start = None
        current_parts = []
        current_len = 0

    for sent in sentences:
        try:
            start = float(getattr(sent, "start", 0.0))
        except Exception:
            start = 0.0
        sent_text = str(getattr(sent, "text", "")).strip()
        if not sent_text:
            continue

        start_new = current_start is None
        if not start_new and last_start is not None and (start - last_start) >= 20.0:
            start_new = True
        if not start_new and current_len >= 500:
            start_new = True

        if start_new:
            flush()
            current_start = start

        current_parts.append(sent_text)
        current_len += len(sent_text)
        last_start = start

    flush()

    if not paragraphs:
        return ""

    lines: list[str] = []
    for para in paragraphs:
        ts = _format_timestamp(float(para["start"]))
        label = _build_short_label(str(para["text"]))
        lines.append(f"**[{ts}] {label}**" if label else f"**[{ts}]**")
        lines.append(str(para["text"]))
        lines.append("")

    return ("\n".join(lines)).rstrip() + "\n"


def _format_as_markdown(text: str) -> str:
    """Break plain text into readable paragraphs (fallback when no sentence timing available)."""
    clean = text.strip()
    if not clean:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    sentences = [s.strip() for s in sentences if s.strip()]
    paragraphs: list[str] = []
    current: list[str] = []
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
    lines: list[str] = []
    for para in paragraphs:
        lines.append(para)
        lines.append("")
    return ("\n".join(lines)).rstrip() + "\n"


def main() -> int:
    args = parse_args()

    try:
        import parakeet_mlx  # type: ignore[import]
    except Exception as exc:
        sys.stderr.write(
            "Failed to import parakeet_mlx. Make sure parakeet-mlx is installed "
            "in the AutoTranscribe2 Python environment.\n"
            f"Underlying error: {exc}\n"
        )
        return 1

    model_id = args.model_id
    candidates = [model_id]
    if "/" not in model_id:
        candidates.append(f"mlx-community/{model_id}")

    model = None
    last_error: Exception | None = None
    resolved_id = model_id
    for candidate in candidates:
        try:
            if hasattr(parakeet_mlx, "from_pretrained"):
                model = parakeet_mlx.from_pretrained(candidate)
            elif hasattr(parakeet_mlx, "ParakeetModel") and hasattr(
                parakeet_mlx.ParakeetModel, "from_pretrained"
            ):
                model = parakeet_mlx.ParakeetModel.from_pretrained(candidate)
            else:
                # Module-level transcribe API; model object not needed.
                model = None
            resolved_id = candidate
            last_error = None
            break
        except Exception as exc:
            last_error = exc

    if last_error is not None:
        sys.stderr.write(
            f"Failed to load Parakeet model '{model_id}': {last_error}\n"
        )
        return 1

    language = args.language or "nl"

    try:
        if model is not None:
            if hasattr(model, "transcribe_file"):
                out = _call_supported(
                    model.transcribe_file,
                    args.audio_path,
                    language=language,
                    chunk_duration=args.chunk_duration,
                )
            elif hasattr(model, "transcribe"):
                out = _call_supported(
                    model.transcribe,
                    args.audio_path,
                    language=language,
                    chunk_duration=args.chunk_duration,
                )
            else:
                raise RuntimeError("Loaded Parakeet model has no transcribe method")
        elif hasattr(parakeet_mlx, "transcribe"):
            out = _call_supported(
                parakeet_mlx.transcribe,
                args.audio_path,
                model=resolved_id,
                language=language,
                chunk_duration=args.chunk_duration,
            )
        else:
            raise RuntimeError("parakeet_mlx API exposes no transcribe entry point")

        text = _extract_text(out)
        if not text:
            sys.stderr.write("Parakeet returned an empty transcript.\n")
            return 1

        sentences = getattr(out, "sentences", None)
        if isinstance(sentences, list) and sentences:
            formatted = _format_sentences_as_markdown(sentences)
        else:
            formatted = ""

        if not formatted.strip():
            formatted = _format_as_markdown(text)

        if text:
            if not formatted.endswith("\n"):
                formatted += "\n"
            formatted += "\n---\n\nOriginal transcript\n\n"
            formatted += text if text.endswith("\n") else text + "\n"

    except Exception as exc:
        sys.stderr.write(f"Transcription failed: {exc}\n")
        return 1

    payload = {
        "text": text,
        "formatted_markdown": formatted,
        "language": None,  # parakeet_mlx does not expose detected language
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
