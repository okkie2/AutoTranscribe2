import assert from "node:assert/strict";
import test from "node:test";
import { renderSwiftBarMenu, renderSwiftBarUnavailable } from "../application/SwiftBarMenu.js";
const snapshot = {
    updatedAt: "2026-09-01T12:00:00.000Z",
    statusFreshness: "fresh",
    service: { state: "running", detail: "Managed watcher stack is running." },
    activity: "processingTranscription",
    currentFile: "/recordings/current.m4a",
    queues: {
        recordings: { pending: null, oldest: null },
        transcriptions: { pending: 1, running: 1, failed: 2 }
    },
    latestTranscript: "/transcripts/latest.md",
    lastError: "A previous job failed"
};
test("SwiftBar menu renders an active snapshot with existing lifecycle actions", () => {
    const output = renderSwiftBarMenu(snapshot, "/plugins/autotranscribe.5s.sh");
    assert.match(output, /^AT working \| color=green/m);
    assert.match(output, /Transcription jobs: 1 pending, 1 running, 2 failed/);
    assert.match(output, /Start \| bash='\/plugins\/autotranscribe\.5s\.sh' param1=action param2=start/);
    assert.match(output, /Restart .*param2=restart/);
    assert.match(output, /Open transcript folder .*param2=open-transcripts/);
});
test("SwiftBar menu reports missing or stale status without claiming the service is idle", () => {
    const output = renderSwiftBarMenu({ ...snapshot, statusFreshness: "missing", activity: null, latestTranscript: null }, "/plugins/autotranscribe.5s.sh");
    assert.match(output, /^AT stale \| color=orange/m);
    assert.doesNotMatch(output, /Open transcript folder/);
    assert.match(renderSwiftBarUnavailable("bad|output\n"), /Status unavailable: bad output /);
});
