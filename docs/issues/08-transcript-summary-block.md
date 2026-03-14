# Transcript summary block

## Problem

Transcripts are long; readers want a quick overview (topics, decisions, action items, open questions) before or instead of reading the full text. Adding an automatically generated summary above the prettified transcript would improve usability without changing the canonical Markdown output.

## Proposed solution

Add an automatically generated summary section above the transcript body in the Markdown output. Markdown transcripts remain the canonical artefact. The summary may include: main topics, decisions, action items, open questions. Integrate a summary generation step after transcription (e.g. local LLM or heuristic) and prepend the summary to the existing transcript content. Keep the pipeline backwards compatible (e.g. summary optional via config or empty when disabled).

## Acceptance criteria

- [ ] `.md` transcript contains a clearly formatted summary section.
- [ ] Summary is generated automatically from transcript text.
- [ ] Summary appears above the transcript body.
- [ ] Existing pipeline remains backwards compatible.

## Suggested TODO breakdown

- Design summary block format (Markdown structure, headings).
- Add summary generation step after transcription.
- Prepend summary to Markdown transcript in the writer.
- Add tests for summary insertion.
- Document summary behaviour in README.
