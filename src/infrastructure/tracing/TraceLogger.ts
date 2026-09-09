import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface TraceEntry {
  ts: string;
  session_id: string;
  event_index: number;
  event: string;
  source: string;
  command?: string;
  internal_state?: unknown;
  observed_state?: unknown;
  metadata?: Record<string, unknown>;
}

const TRACE_DIR = path.join(os.homedir(), "Library", "Logs", "AutoTranscribe2");
const TRACE_FILENAME = "cli-trace.jsonl";

/** Rotate once the active trace exceeds this size; one previous generation is kept. */
const MAX_TRACE_BYTES = 5 * 1024 * 1024;

let sessionId = `${process.pid}-${randomUUID()}`;
let eventIndex = 0;

// Tracked in-process so the common path costs no extra stat call per event.
let trackedTracePath: string | null = null;
let trackedTraceBytes = 0;

function getTraceLogPath(): string {
  return process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH || path.join(TRACE_DIR, TRACE_FILENAME);
}

function ensureTraceDirectory(): void {
  fs.mkdirSync(path.dirname(getTraceLogPath()), { recursive: true });
}

function getRotatedTracePath(tracePath: string): string {
  const extension = path.extname(tracePath);
  const baseName = path.basename(tracePath, extension);
  return path.join(path.dirname(tracePath), `${baseName}.1${extension}`);
}

/**
 * Keep the Diagnostic Trace bounded. Once the active file passes MAX_TRACE_BYTES it
 * becomes the single retained previous generation, replacing any older one, so total
 * trace usage stays under roughly twice the cap instead of growing without limit.
 *
 * Known limitation: the watcher and the Just Press Record ingester are separate processes
 * that share this file, and each tracks its own byte count. The file can therefore grow to
 * roughly the cap per writing process before one of them rotates, and a rotation by one
 * process leaves the other's counter stale-high until its next rotation. That is acceptable
 * for diagnostics; cross-process coordination is not worth the complexity here.
 */
function rotateTraceIfOversized(tracePath: string, incomingBytes: number): void {
  if (trackedTracePath !== tracePath) {
    trackedTracePath = tracePath;
    try {
      trackedTraceBytes = fs.statSync(tracePath).size;
    } catch {
      trackedTraceBytes = 0;
    }
  }

  if (trackedTraceBytes + incomingBytes <= MAX_TRACE_BYTES) {
    trackedTraceBytes += incomingBytes;
    return;
  }

  try {
    fs.rmSync(getRotatedTracePath(tracePath), { force: true });
    fs.renameSync(tracePath, getRotatedTracePath(tracePath));
    trackedTraceBytes = incomingBytes;
  } catch {
    // If rotation fails, keep appending rather than losing the event; re-stat next time.
    trackedTracePath = null;
  }
}

export function resetTraceRotationStateForTest(): void {
  trackedTracePath = null;
  trackedTraceBytes = 0;
}

function normalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function setTraceSessionIdForTest(nextSessionId: string): void {
  sessionId = nextSessionId;
  eventIndex = 0;
}

export function getTraceSessionId(): string {
  return sessionId;
}

export function getLatestTraceLogPath(): string {
  return getTraceLogPath();
}

export function traceEvent(entry: Omit<TraceEntry, "ts" | "session_id" | "event_index">): void {
  try {
    ensureTraceDirectory();
    const record: TraceEntry = {
      ts: new Date().toISOString(),
      session_id: sessionId,
      event_index: ++eventIndex,
      event: entry.event,
      source: entry.source,
      command: entry.command,
      internal_state: normalize(entry.internal_state),
      observed_state: normalize(entry.observed_state),
      metadata: normalize(entry.metadata) as Record<string, unknown> | undefined
    };
    const tracePath = getTraceLogPath();
    const line = JSON.stringify(record) + "\n";
    rotateTraceIfOversized(tracePath, Buffer.byteLength(line, "utf8"));
    fs.appendFileSync(tracePath, line, "utf8");
  } catch {
    // Diagnostic tracing must never break the runtime path.
  }
}
