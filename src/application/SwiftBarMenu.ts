import path from "node:path";
import type { JsonStatusSnapshot } from "./JsonStatusSnapshot.js";

const ACTIVE_STATES = new Set([
  "waitingForStableFile",
  "ingesting",
  "enqueuingJob",
  "draining",
  "processingTranscription",
  "writingTranscript"
]);
const MAX_ERROR_LENGTH = 120;
const STATUS_SYMBOL = "pencil.and.ellipsis.rectangle";

export function renderSwiftBarMenu(snapshot: JsonStatusSnapshot, pluginPath: string): string {
  const lines = [menuBarLabel(snapshot), "---"];

  lines.push(`Service: ${safeValue(snapshot.service.state)}`);
  lines.push(`Activity: ${safeValue(snapshot.activity)}`);
  lines.push(`Freshness: ${safeValue(snapshot.statusFreshness)}`);
  lines.push(`Current file: ${safeValue(snapshot.currentFile)}`);
  lines.push(`Transcription jobs: ${snapshot.queues.transcriptions.pending} pending, ${snapshot.queues.transcriptions.running} running, ${snapshot.queues.transcriptions.failed} failed`);
  lines.push(`Recordings awaiting discovery: ${safeValue(snapshot.queues.recordings.pending)}`);
  lines.push(`Latest transcript: ${latestTranscriptName(snapshot.latestTranscript)}`);
  lines.push(`Last error: ${truncateError(snapshot.lastError)}`);
  lines.push("---");
  lines.push(actionLine("Start", pluginPath, "start"));
  lines.push(actionLine("Stop", pluginPath, "stop"));
  lines.push(actionLine("Restart", pluginPath, "restart"));
  if (snapshot.latestTranscript) {
    lines.push(actionLine("Open latest transcript", pluginPath, "open-transcripts"));
  }
  lines.push("Refresh | refresh=true");

  return lines.join("\n");
}

export function renderSwiftBarUnavailable(reason: string): string {
  return [
    statusIconLine("orange"),
    "---",
    `Status unavailable: ${safeValue(reason)}`,
    "Refresh | refresh=true"
  ].join("\n");
}

function menuBarLabel(snapshot: JsonStatusSnapshot): string {
  if (snapshot.statusFreshness !== "fresh") {
    return statusIconLine("orange");
  }

  if (snapshot.service.state === "error" || snapshot.activity === "failed") {
    return statusIconLine("red");
  }

  if (snapshot.service.state === "stopped") {
    return statusIconLine("gray");
  }

  if (
    snapshot.service.state === "starting" ||
    snapshot.service.state === "stopping" ||
    (snapshot.activity !== null && ACTIVE_STATES.has(snapshot.activity))
  ) {
    return statusIconLine("green");
  }

  return statusIconLine("gray");
}

function statusIconLine(color: string): string {
  return `| sfimage=${STATUS_SYMBOL} sfcolor=${color}`;
}

function actionLine(label: string, pluginPath: string, action: string): string {
  return `${label} | bash=${swiftBarQuoted(pluginPath)} param1=action param2=${action} terminal=false refresh=true`;
}

function swiftBarQuoted(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

function safeValue(value: string | number | null): string {
  if (value === null) {
    return "-";
  }

  return String(value).replace(/[\r\n|]/g, " ");
}

function latestTranscriptName(transcriptPath: string | null): string {
  return transcriptPath === null ? "-" : safeValue(path.basename(transcriptPath));
}

function truncateError(error: string | null): string {
  const value = safeValue(error);
  return value.length <= MAX_ERROR_LENGTH
    ? value
    : `${value.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}
