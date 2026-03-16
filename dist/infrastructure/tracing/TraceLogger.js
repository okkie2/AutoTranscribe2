import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
const TRACE_DIR = path.join(os.homedir(), "Library", "Logs", "AutoTranscribe2");
const TRACE_FILENAME = "cli-trace.jsonl";
let sessionId = `${process.pid}-${randomUUID()}`;
let eventIndex = 0;
function getTraceLogPath() {
    return process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH || path.join(TRACE_DIR, TRACE_FILENAME);
}
function ensureTraceDirectory() {
    fs.mkdirSync(path.dirname(getTraceLogPath()), { recursive: true });
}
function normalize(value) {
    if (value === undefined)
        return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return String(value);
    }
}
export function setTraceSessionIdForTest(nextSessionId) {
    sessionId = nextSessionId;
    eventIndex = 0;
}
export function getTraceSessionId() {
    return sessionId;
}
export function getLatestTraceLogPath() {
    return getTraceLogPath();
}
export function traceEvent(entry) {
    try {
        ensureTraceDirectory();
        const record = {
            ts: new Date().toISOString(),
            session_id: sessionId,
            event_index: ++eventIndex,
            event: entry.event,
            source: entry.source,
            command: entry.command,
            internal_state: normalize(entry.internal_state),
            observed_state: normalize(entry.observed_state),
            metadata: normalize(entry.metadata)
        };
        fs.appendFileSync(getTraceLogPath(), JSON.stringify(record) + "\n", "utf8");
    }
    catch {
        // Diagnostic tracing must never break the runtime path.
    }
}
