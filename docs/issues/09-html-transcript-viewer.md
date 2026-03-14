# HTML transcript viewer with clickable timestamps

## Problem

Users want to listen to the recording while following the transcript and to jump to a specific moment by clicking a timestamp. Markdown alone does not provide an embedded player or interactive timestamps. An HTML view would allow an audio player and clickable timestamps that seek playback.

## Proposed solution

Generate HTML as an additional output alongside the existing `.md` transcripts. Markdown remains the source of truth. The HTML view includes: an embedded audio player, clickable timestamps, and the transcript text. Clicking a timestamp moves playback to the correct second. Resolve the audio file path using configuration (e.g. `config.yaml`). Timestamps are derived from existing transcript timing data (segment start/end). Optionally provide a transcript index page that links to individual HTML files.

## Acceptance criteria

- [ ] `.html` transcript is generated alongside `.md` (same base name or documented naming).
- [ ] Audio player is embedded in the HTML.
- [ ] Clicking a timestamp moves playback to that moment.
- [ ] Timestamps are derived from transcript timing data.
- [ ] Works with local audio files; audio path resolved from config.

## Suggested TODO breakdown

- Extend transcript model (or pipeline output) to include timestamp seconds where needed.
- Create HTML transcript renderer (template or generator).
- Embed audio player in HTML output.
- Implement timestamp click → audio seek (e.g. `currentTime`).
- Resolve audio path from config (recordings root / file path).
- Optionally generate a transcript index page.
- Document HTML output in README/docs.
