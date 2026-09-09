import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { archiveProcessedRecordings } from "../application/RecordingRetention.js";
const logger = {
    debug() { },
    info() { },
    warn() { },
    error() { }
};
function createFixture() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-retention-"));
    const recordingsDir = path.join(rootDir, "recordings");
    const archiveDir = path.join(rootDir, "archive");
    fs.mkdirSync(recordingsDir, { recursive: true });
    return { rootDir, recordingsDir, archiveDir };
}
/** Write a recording with an explicit mtime so ordering is deterministic. */
function writeRecording(recordingsDir, name, minutesOld) {
    const filePath = path.join(recordingsDir, name);
    fs.writeFileSync(filePath, `fake audio ${name}`, "utf8");
    const when = new Date(Date.now() - minutesOld * 60000);
    fs.utimesSync(filePath, when, when);
    return filePath;
}
function sweep(fixture, overrides = {}) {
    return archiveProcessedRecordings({
        recordingsRoot: fixture.recordingsDir,
        archiveDirectory: fixture.archiveDir,
        keepRecentRecordings: 3,
        includeExtensions: [".m4a"],
        isArchivable: () => true,
        logger,
        ...overrides
    });
}
test("archiveProcessedRecordings always leaves the newest three recordings in place", () => {
    const fixture = createFixture();
    writeRecording(fixture.recordingsDir, "newest.m4a", 1);
    writeRecording(fixture.recordingsDir, "second.m4a", 2);
    writeRecording(fixture.recordingsDir, "third.m4a", 3);
    writeRecording(fixture.recordingsDir, "fourth.m4a", 4);
    writeRecording(fixture.recordingsDir, "fifth.m4a", 5);
    const result = sweep(fixture);
    assert.equal(result.archived.length, 2);
    assert.equal(result.retained, 3);
    assert.deepEqual(fs.readdirSync(fixture.recordingsDir).sort(), [
        "newest.m4a",
        "second.m4a",
        "third.m4a"
    ]);
    assert.deepEqual(fs.readdirSync(fixture.archiveDir).sort(), ["fifth.m4a", "fourth.m4a"]);
});
test("archiveProcessedRecordings never moves recordings that are not archivable", () => {
    const fixture = createFixture();
    writeRecording(fixture.recordingsDir, "newest.m4a", 1);
    writeRecording(fixture.recordingsDir, "second.m4a", 2);
    writeRecording(fixture.recordingsDir, "third.m4a", 3);
    const completed = writeRecording(fixture.recordingsDir, "completed.m4a", 4);
    writeRecording(fixture.recordingsDir, "failed.m4a", 5);
    const result = sweep(fixture, {
        isArchivable: (audioFilePath) => path.resolve(audioFilePath) === path.resolve(completed)
    });
    assert.equal(result.archived.length, 1);
    assert.equal(result.skipped, 1);
    assert.ok(fs.existsSync(path.join(fixture.recordingsDir, "failed.m4a")));
    assert.deepEqual(fs.readdirSync(fixture.archiveDir), ["completed.m4a"]);
});
test("archiveProcessedRecordings refuses to archive into the watched recordings folder", () => {
    const fixture = createFixture();
    writeRecording(fixture.recordingsDir, "newest.m4a", 1);
    writeRecording(fixture.recordingsDir, "older.m4a", 2);
    const result = sweep(fixture, {
        keepRecentRecordings: 1,
        archiveDirectory: path.join(fixture.recordingsDir, "archive")
    });
    assert.deepEqual(result.archived, []);
    assert.ok(fs.existsSync(path.join(fixture.recordingsDir, "older.m4a")));
});
test("archiveProcessedRecordings ignores non-audio and hidden files", () => {
    const fixture = createFixture();
    writeRecording(fixture.recordingsDir, "newest.m4a", 1);
    writeRecording(fixture.recordingsDir, "older.m4a", 2);
    writeRecording(fixture.recordingsDir, ".DS_Store", 3);
    writeRecording(fixture.recordingsDir, "notes.txt", 4);
    const result = sweep(fixture, { keepRecentRecordings: 1 });
    assert.equal(result.archived.length, 1);
    assert.deepEqual(fs.readdirSync(fixture.archiveDir), ["older.m4a"]);
    assert.ok(fs.existsSync(path.join(fixture.recordingsDir, ".DS_Store")));
    assert.ok(fs.existsSync(path.join(fixture.recordingsDir, "notes.txt")));
});
test("archiveProcessedRecordings does not overwrite an existing archived recording", () => {
    const fixture = createFixture();
    fs.mkdirSync(fixture.archiveDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.archiveDir, "older.m4a"), "previously archived", "utf8");
    writeRecording(fixture.recordingsDir, "newest.m4a", 1);
    writeRecording(fixture.recordingsDir, "older.m4a", 2);
    const result = sweep(fixture, { keepRecentRecordings: 1 });
    assert.equal(result.archived.length, 1);
    assert.deepEqual(fs.readdirSync(fixture.archiveDir).sort(), ["older-1.m4a", "older.m4a"]);
    assert.equal(fs.readFileSync(path.join(fixture.archiveDir, "older.m4a"), "utf8"), "previously archived");
});
test("archiveProcessedRecordings tolerates a missing recordings folder", () => {
    const fixture = createFixture();
    fs.rmSync(fixture.recordingsDir, { recursive: true, force: true });
    const result = sweep(fixture);
    assert.deepEqual(result.archived, []);
});
