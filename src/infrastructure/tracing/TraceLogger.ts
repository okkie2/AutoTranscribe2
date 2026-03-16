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

let sessionId = `${process.pid}-${randomUUID()}`;
let eventIndex = 0;

function getTraceLogPath(): string {
  return process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH || path.join(TRACE_DIR, TRACE_FILENAME);
}

function ensureTraceDirectory(): void {
  fs.mkdirSync(path.dirname(getTraceLogPath()), { recursive: true });
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
    fs.appendFileSync(getTraceLogPath(), JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Diagnostic tracing must never break the runtime path.
  }
}
