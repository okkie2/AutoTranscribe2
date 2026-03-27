# Low-latency meeting assistant with delayed enrichment loop

## Problem

A meeting assistant needs low-latency transcript feedback during the meeting, but summaries, decisions, and action items usually require slower LLM processing. Putting the LLM directly in the live audio path would increase latency and make the assistant feel less responsive.

## Proposed solution

Use a two-loop pipeline. The primary loop is a real-time transcription loop: audio flows directly to speech-to-text and produces a live transcript with minimal delay. The secondary loop is a delayed enrichment loop: transcript segments are forwarded asynchronously to an LLM that generates richer outputs after the live transcript is already available. This keeps the LLM out of the live audio path while still producing meeting-oriented outputs.

Flow:

`audio -> live transcript`

`transcript -> delayed enrichment`

Delayed enrichment outputs should include: summary, decisions, and action items.

## Acceptance criteria

- [ ] The design keeps speech-to-text as the primary live path from audio to transcript.
- [ ] LLM enrichment runs asynchronously from transcript output, not inline with live audio processing.
- [ ] The system can produce a live transcript before delayed enrichment is complete.
- [ ] Delayed enrichment outputs are defined as summary, decisions, and action items.
- [ ] The design preserves traceability between the live transcript and delayed enrichment outputs.

## Suggested TODO breakdown

- Define the meeting assistant pipeline and data flow for the real-time transcription loop and delayed enrichment loop.
- Decide how transcript segments are handed off from the live path to asynchronous enrichment.
- Define output structure for live transcript, summary, decisions, and action items.
- Plan traceability between the canonical transcript and delayed enrichment outputs.
- Document latency goals and non-goals, including that the LLM stays out of the live audio path.
