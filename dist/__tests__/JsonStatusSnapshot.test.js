import assert from "node:assert/strict";
import test from "node:test";
import { buildJsonStatusSnapshot } from "../application/JsonStatusSnapshot.js";
import { TranscriptionJobState } from "../domain/TranscriptionJob.js";
const recentStatus = {
    runtimeActivityState: "processingTranscription",
    queueLength: 2,
    currentFile: "/recordings/current.m4a",
    lastError: null,
    updatedAt: new Date().toISOString()
};
function job(id, state, updatedAt, overrides = {}) {
    return {
        id,
        audioFilePath: `/recordings/${id}.m4a`,
        state,
        createdAt: updatedAt,
        updatedAt,
        targetTranscriptPath: `/transcripts/${id}.md`,
        ...overrides
    };
}
test("JSON status snapshot summarizes durable transcription jobs", () => {
    const snapshot = buildJsonStatusSnapshot(recentStatus, null, [
        job("pending", TranscriptionJobState.Pending, "2026-09-01T10:00:00.000Z"),
        job("running", TranscriptionJobState.InProgress, "2026-09-01T10:01:00.000Z"),
        job("failed", TranscriptionJobState.Failed, "2026-09-01T10:02:00.000Z", {
            errorMessage: "Backend unavailable"
        }),
        job("older-completed", TranscriptionJobState.Completed, "2026-09-01T10:03:00.000Z"),
        job("latest-completed", TranscriptionJobState.Completed, "2026-09-01T10:04:00.000Z")
    ]);
    assert.equal(snapshot.statusFreshness, "fresh");
    assert.equal(snapshot.service.state, "unknown");
    assert.equal(snapshot.activity, "processingTranscription");
    assert.equal(snapshot.currentFile, "/recordings/current.m4a");
    assert.deepEqual(snapshot.queues.transcriptions, { pending: 1, running: 1, failed: 1 });
    assert.deepEqual(snapshot.queues.recordings, { pending: null, oldest: null });
    assert.equal(snapshot.latestTranscript, "/transcripts/latest-completed.md");
    assert.equal(snapshot.lastError, "Backend unavailable");
});
test("JSON status snapshot reports missing runtime state without inventing an idle service", () => {
    const snapshot = buildJsonStatusSnapshot(null, null, []);
    assert.equal(snapshot.updatedAt, null);
    assert.equal(snapshot.statusFreshness, "missing");
    assert.equal(snapshot.service.state, "unknown");
    assert.equal(snapshot.activity, null);
    assert.equal(snapshot.lastError, null);
});
