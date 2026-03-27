import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";
import { readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import {
  isPidRunning,
  reconcileManagedWatcherStack,
  removeLegacyPidFile,
  removeStackLock,
  tryCreateStackLock,
  writeLegacyPidFile,
  writeStackLock,
  type ManagedWatcherStack,
  type ReconciledProcessState,
  type WatcherProcessState
} from "./ManagedWatcherStackReconciler.js";
import {
  readSupervisorState,
  writeSupervisorState
} from "./ManagedWatcherSupervisorState.js";
import {
  buildCompactStatusSnapshot,
  formatCompactStatusSnapshotLines,
  formatDashboardLines,
  type CompactStatusSnapshot,
  type StatusFreshness
} from "./StatusSnapshot.js";

const STARTUP_STABILIZE_MS = 400;
const STOP_TIMEOUT_MS = 180_000;
const STOP_POLL_INTERVAL_MS = 250;
const RECENT_JOB_LIMIT = 5;
const OLLAMA_HEALTHCHECK_TIMEOUT_MS = 5_000;
const TEST_MODE_ENV = "AUTOTRANSCRIBE_TEST_MODE";
const TEST_WATCH_PID = 41001;
const TEST_INGEST_PID = 41002;

export type {
  ReconciledProcessState,
  StackReconciliation,
  WatcherProcessState
} from "./ManagedWatcherStackReconciler.js";
export { reconcileManagedWatcherStack } from "./ManagedWatcherStackReconciler.js";

export interface StatusSnapshot {
  watcherProcessState: WatcherProcessState;
  runtimeActivityState: string | null;
  statusFreshness: StatusFreshness;
  latestTranscript: string | null;
  reconciledProcessState: ReconciledProcessState;
  lines: string[];
}

export interface DiagnosticStateSnapshot {
  watcherProcessState: WatcherProcessState;
  reconciledProcessState: ReconciledProcessState;
  runtimeActivityState: string | null;
  statusFreshness: StatusFreshness;
  queueLength: number;
  currentFile: string | null;
  currentJobId: string | null;
  latestTranscript: string | null;
  lastError: string | null;
  updatedAt: string | null;
  watchPid: number | null;
  ingestPid: number | null;
  hasSupervisorState: boolean;
  hasLock: boolean;
  hasLegacyPidFile: boolean;
  runtimeStatusFresh: boolean;
  unmanagedWatcherDetected: boolean;
  detail: string;
}

export interface LatestTranscript {
  transcriptPath: string;
  updatedAt: Date;
}

export interface RecentTranscriptionJob {
  finishedAt: string;
  audioFile: string;
  transcriptPath: string;
  title: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTestMode(): boolean {
  return process.env[TEST_MODE_ENV] === "1";
}

function setSimulatedManagedProcessList(watchPid: number, ingestPid: number): void {
  process.env.AUTOTRANSCRIBE_PROCESS_LIST = [
    `${watchPid} node dist/cli/index.js watch`,
    `${ingestPid} node dist/cli/ingestJustPressRecord.js`
  ].join("\n");
}

function clearSimulatedManagedProcessList(): void {
  process.env.AUTOTRANSCRIBE_PROCESS_LIST = "";
}

export function getDiagnosticStateSnapshot(config: AppConfig): DiagnosticStateSnapshot {
  const status = readStatus(config.runtimeStatusPath);
  const reconciliation = reconcileManagedWatcherStack(config);
  const latestTranscript = getLatestTranscript(config);
  const statusFreshness = formatDashboardLines(status, config.runtimeStatusPath).statusFreshness;
  const supervisorState = readSupervisorState(config);

  return {
    watcherProcessState: reconciliation.watcherProcessState,
    reconciledProcessState: reconciliation.reconciledProcessState,
    runtimeActivityState: status?.runtimeActivityState ?? null,
    statusFreshness,
    queueLength: status?.queueLength ?? 0,
    currentFile: status?.currentFile ?? null,
    currentJobId: status?.currentJobId ?? null,
    latestTranscript: latestTranscript ? path.basename(latestTranscript.transcriptPath) : null,
    lastError: status?.lastError ?? null,
    updatedAt: status?.updatedAt ?? null,
    watchPid: reconciliation.watchPid,
    ingestPid: reconciliation.ingestPid,
    hasSupervisorState: supervisorState !== null,
    hasLock: reconciliation.hasLock,
    hasLegacyPidFile: reconciliation.hasLegacyPidFile,
    runtimeStatusFresh: reconciliation.runtimeStatusFresh,
    unmanagedWatcherDetected: reconciliation.unmanagedWatcherDetected,
    detail: reconciliation.detail
  };
}

function traceObservedState(config: AppConfig, source: string, command?: string): void {
  traceEvent({
    event: "state_observed",
    source,
    command,
    observed_state: getDiagnosticStateSnapshot(config)
  });
}

function cleanupStackArtifacts(config: AppConfig): void {
  removeStackLock(config);
  removeLegacyPidFile();
}

function createManagedStackRecord(config: AppConfig, watchPid: number | null, ingestPid: number | null): ManagedWatcherStack {
  return {
    watchPid,
    ingestPid,
    createdAt: new Date().toISOString(),
    cwd: process.cwd(),
    runtimeRoot: path.dirname(config.runtimeStatusPath),
    hostname: os.hostname(),
    lockVersion: 1
  };
}

function persistManagedStack(config: AppConfig, watchPid: number, ingestPid: number): void {
  const stack = createManagedStackRecord(config, watchPid, ingestPid);
  writeStackLock(config, stack);
  writeLegacyPidFile({ watchPid, ingestPid });
}

function acquireManagedStackLock(config: AppConfig): void {
  const pendingStack = createManagedStackRecord(config, null, null);

  if (tryCreateStackLock(config, pendingStack)) {
    return;
  }

  const reconciliation = reconcileManagedWatcherStack(config);
  if (reconciliation.reconciledProcessState === "staleLock") {
    cleanupStackArtifacts(config);
    if (tryCreateStackLock(config, pendingStack)) {
      return;
    }
  }

  throw new Error(`Managed watcher stack cannot start: ${reconciliation.detail}`);
}

export async function ensureOllamaRunning(config: AppConfig): Promise<void> {
  const title = config.title;

  if (!title.enabled || title.provider !== "ollama" || !title.ollama) {
    console.log("[WatcherControl] Title provider is not Ollama; skipping Ollama check.");
    return;
  }

  const endpoint = title.ollama.endpoint;
  console.log(`[WatcherControl] Checking Ollama service at ${endpoint}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_HEALTHCHECK_TIMEOUT_MS);
  const healthcheckUrl = new URL("/api/tags", endpoint).toString();

  try {
    const res = await fetch(healthcheckUrl, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log("[WatcherControl] Ollama is reachable.");
      return;
    }
    attemptStartOllama(`health check returned HTTP ${res.status}`);
  } catch (error) {
    clearTimeout(timeout);

    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("aborted")) {
      console.log("[WatcherControl] Ollama health check timed out; continuing without restarting the service.");
      return;
    }

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("fetch failed")
    ) {
      attemptStartOllama(message);
      return;
    }

    console.log(`[WatcherControl] Ollama health check failed (${message}); continuing without restarting the service.`);
  }
}

function publishSupervisorState(
  config: AppConfig,
  watcherProcessState: WatcherProcessState,
  desiredState: "running" | "stopped",
  watchPid: number | null,
  ingestPid: number | null,
  detail: string
): void {
  writeSupervisorState(config, {
    desiredState,
    watcherProcessState,
    watchPid,
    ingestPid,
    detail
  });
}

function attemptStartOllama(reason?: string): void {
  const suffix = reason ? ` (${reason})` : "";
  console.log(`[WatcherControl] Ollama not reachable${suffix}; attempting to start via 'brew services start ollama'...`);
  try {
    const result = spawnSync("brew", ["services", "start", "ollama"], {
      stdio: "inherit"
    });
    if (result.error) {
      console.error("[WatcherControl] Failed to start Ollama via brew:", result.error.message);
    } else {
      console.log("[WatcherControl] Brew command executed. Ollama may take a moment to become ready.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[WatcherControl] Error while trying to start Ollama via brew:", message);
  }
}

export async function startWatcherControl(config: AppConfig): Promise<void> {
  const reconciliation = reconcileManagedWatcherStack(config);
  const observedState = getDiagnosticStateSnapshot(config);

  traceEvent({
    event: "start_requested",
    source: "WatcherControl",
    command: "start",
    internal_state: { requestedAction: "start" },
    observed_state: observedState
  });
  traceEvent({
    event: "transition_guard_evaluated",
    source: "WatcherControl",
    command: "start",
    observed_state: observedState,
    metadata: {
      guard: "managed_stack_start_allowed",
      evaluated_value: ["stopped", "staleLock"].includes(reconciliation.reconciledProcessState),
      source_of_truth: "reconciled_process_state"
    }
  });

  if (reconciliation.reconciledProcessState === "running") {
    traceEvent({
      event: "state_mismatch_detected",
      source: "WatcherControl",
      command: "start",
      observed_state: observedState,
      metadata: { reason: "start requested while managed stack already running" }
    });
    traceEvent({
      event: "start_skipped_already_running",
      source: "WatcherControl",
      command: "start",
      observed_state: observedState
    });
    throw new Error("Managed watcher stack is already running.");
  }
  if (["partial", "inconsistent", "error"].includes(reconciliation.reconciledProcessState)) {
    traceEvent({
      event: "state_mismatch_detected",
      source: "WatcherControl",
      command: "start",
      observed_state: observedState,
      metadata: { reason: "start requested while managed stack is inconsistent" }
    });
    traceEvent({
      event: "start_failed",
      source: "WatcherControl",
      command: "start",
      observed_state: observedState,
      metadata: { reason: reconciliation.detail }
    });
    throw new Error(`Managed watcher stack is in an inconsistent state: ${reconciliation.detail}`);
  }
  if (reconciliation.reconciledProcessState === "staleLock") {
    cleanupStackArtifacts(config);
  }

  acquireManagedStackLock(config);
  publishSupervisorState(config, "starting", "running", null, null, "Starting managed watcher stack.");

  console.log("[WatcherControl] Starting AutoTranscribe2 watcher control (Ollama + ingest:jpr + watcher)...");
  try {
    if (isTestMode()) {
      setSimulatedManagedProcessList(TEST_WATCH_PID, TEST_INGEST_PID);
      persistManagedStack(config, TEST_WATCH_PID, TEST_INGEST_PID);
      publishSupervisorState(
        config,
        "running",
        "running",
        TEST_WATCH_PID,
        TEST_INGEST_PID,
        "Managed watcher stack is running."
      );
      traceObservedState(config, "WatcherControl", "start");
      traceEvent({
        event: "start_succeeded",
        source: "WatcherControl",
        command: "start",
        observed_state: getDiagnosticStateSnapshot(config),
        metadata: { watchPid: TEST_WATCH_PID, ingestPid: TEST_INGEST_PID, simulated: true }
      });
      console.log("[WatcherControl] Started ingest:jpr (PID:", TEST_INGEST_PID, "), watcher (PID:", TEST_WATCH_PID, ").");
      return;
    }

    await ensureOllamaRunning(config);

    const ingest = spawn(process.execPath, ["dist/cli/ingestJustPressRecord.js"], {
      stdio: "ignore",
      cwd: process.cwd(),
      detached: true
    });
    ingest.unref();

    const watch = spawn(process.execPath, ["dist/cli/index.js", "watch"], {
      stdio: "ignore",
      cwd: process.cwd(),
      detached: true
    });
    watch.unref();

    if (!ingest.pid || !watch.pid) {
      throw new Error("Failed to start managed watcher stack.");
    }

    persistManagedStack(config, watch.pid, ingest.pid);
    publishSupervisorState(
      config,
      "starting",
      "running",
      watch.pid,
      ingest.pid,
      "Managed watcher stack started; waiting for stabilization."
    );
    await delay(STARTUP_STABILIZE_MS);

    const started = reconcileManagedWatcherStack(config);
    if (started.reconciledProcessState !== "running") {
      publishSupervisorState(
        config,
        "error",
        "running",
        watch.pid,
        ingest.pid,
        `Managed watcher stack failed to stabilize: ${started.detail}`
      );
      cleanupStackArtifacts(config);
      traceEvent({
        event: "start_failed",
        source: "WatcherControl",
        command: "start",
        observed_state: getDiagnosticStateSnapshot(config),
        metadata: { reason: started.detail }
      });
      throw new Error(`Managed watcher stack failed to stabilize: ${started.detail}`);
    }

    publishSupervisorState(
      config,
      "running",
      "running",
      watch.pid,
      ingest.pid,
      "Managed watcher stack is running."
    );

    traceObservedState(config, "WatcherControl", "start");
    traceEvent({
      event: "start_succeeded",
      source: "WatcherControl",
      command: "start",
      observed_state: getDiagnosticStateSnapshot(config),
      metadata: { watchPid: watch.pid, ingestPid: ingest.pid }
    });
    console.log("[WatcherControl] Started ingest:jpr (PID:", ingest.pid, "), watcher (PID:", watch.pid, ").");
  } catch (error) {
    publishSupervisorState(
      config,
      "error",
      "running",
      null,
      null,
      error instanceof Error ? error.message : String(error)
    );
    cleanupStackArtifacts(config);
    traceEvent({
      event: "start_failed",
      source: "WatcherControl",
      command: "start",
      observed_state: getDiagnosticStateSnapshot(config),
      metadata: { reason: error instanceof Error ? error.message : String(error) }
    });
    throw error;
  }
}

export async function stopWatcherControl(config: AppConfig): Promise<void> {
  console.log("[WatcherControl] Stopping AutoTranscribe2 watcher control...");
  const reconciliation = reconcileManagedWatcherStack(config);
  const observedState = getDiagnosticStateSnapshot(config);

  traceEvent({
    event: "stop_requested",
    source: "WatcherControl",
    command: "stop",
    internal_state: { requestedAction: "stop" },
    observed_state: observedState
  });
  traceEvent({
    event: "transition_guard_evaluated",
    source: "WatcherControl",
    command: "stop",
    observed_state: observedState,
    metadata: {
      guard: "managed_stack_stop_needed",
      evaluated_value: reconciliation.reconciledProcessState !== "stopped",
      source_of_truth: "reconciled_process_state"
    }
  });

  if (reconciliation.reconciledProcessState === "stopped") {
    cleanupStackArtifacts(config);
    publishSupervisorState(config, "stopped", "stopped", null, null, "Managed watcher stack is already stopped.");
    traceEvent({
      event: "stop_skipped_already_stopped",
      source: "WatcherControl",
      command: "stop",
      observed_state: observedState
    });
    return;
  }

  if (reconciliation.reconciledProcessState === "staleLock") {
    cleanupStackArtifacts(config);
    if (isTestMode()) {
      clearSimulatedManagedProcessList();
    }
    publishSupervisorState(config, "stopped", "stopped", null, null, "Cleaned up stale managed stack artifacts.");
    traceEvent({
      event: "stop_skipped_already_stopped",
      source: "WatcherControl",
      command: "stop",
      observed_state: observedState,
      metadata: { staleArtifactsCleaned: true }
    });
    console.log("[WatcherControl] Cleaned up stale stack artifacts.");
    return;
  }

  if (isTestMode()) {
    clearSimulatedManagedProcessList();
    cleanupStackArtifacts(config);
    publishSupervisorState(config, "stopped", "stopped", null, null, "Managed watcher stack stopped.");
    traceObservedState(config, "WatcherControl", "stop");
    traceEvent({
      event: "stop_succeeded",
      source: "WatcherControl",
      command: "stop",
      observed_state: getDiagnosticStateSnapshot(config),
      metadata: { simulated: true }
    });
    return;
  }

  const targets = [
    { name: "ingest:jpr", pid: reconciliation.ingestPid },
    { name: "watcher", pid: reconciliation.watchPid }
  ];

  publishSupervisorState(
    config,
    "stopping",
    "stopped",
    reconciliation.watchPid,
    reconciliation.ingestPid,
    "Stop requested; waiting for current work to finish cleanly."
  );

  for (const target of targets) {
    if (!target.pid || !isPidRunning(target.pid)) continue;
    try {
      process.kill(target.pid, "SIGINT");
      console.log(`[WatcherControl] Sent SIGINT to ${target.name} (PID:`, target.pid, ").");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WatcherControl] Failed to signal ${target.name}:`, message);
    }
  }

  console.log(
    `[WatcherControl] Waiting up to ${Math.round(STOP_TIMEOUT_MS / 1000)}s for the current transcription work to stop cleanly.`
  );

  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (
    (isPidRunning(reconciliation.watchPid) || isPidRunning(reconciliation.ingestPid)) &&
    Date.now() < deadline
  ) {
    await delay(STOP_POLL_INTERVAL_MS);
  }

  cleanupStackArtifacts(config);

  if (isPidRunning(reconciliation.watchPid) || isPidRunning(reconciliation.ingestPid)) {
    publishSupervisorState(
      config,
      "error",
      "stopped",
      reconciliation.watchPid,
      reconciliation.ingestPid,
      `Managed processes still alive after ${Math.round(STOP_TIMEOUT_MS / 1000)}s stop timeout.`
    );
    traceEvent({
      event: "stop_failed",
      source: "WatcherControl",
      command: "stop",
      observed_state: getDiagnosticStateSnapshot(config),
      metadata: { reason: "managed processes still alive after stop timeout" }
    });
    throw new Error(
      `Managed watcher stack did not stop cleanly within ${Math.round(STOP_TIMEOUT_MS / 1000)}s.`
    );
  }

  publishSupervisorState(config, "stopped", "stopped", null, null, "Managed watcher stack stopped.");
  traceObservedState(config, "WatcherControl", "stop");
  traceEvent({
    event: "stop_succeeded",
    source: "WatcherControl",
    command: "stop",
    observed_state: getDiagnosticStateSnapshot(config)
  });
}

export async function restartWatcherControl(config: AppConfig): Promise<void> {
  await stopWatcherControl(config);
  await startWatcherControl(config);
}

export function getStatusSnapshot(config: AppConfig): StatusSnapshot {
  const status = readStatus(config.runtimeStatusPath);
  const latestTranscript = getLatestTranscript(config);
  const reconciliation = reconcileManagedWatcherStack(config);
  const dashboard = formatDashboardLines(status, config.runtimeStatusPath);
  const DEFAULT_MODELS: Record<string, string> = {
    mlx_whisper: "whisper-large-v3-turbo",
    parakeet: "parakeet-tdt-0.6b-v3"
  };
  const modelDisplay = config.backend.options.modelId ?? DEFAULT_MODELS[config.backend.type];
  const backendLabel = modelDisplay
    ? `${config.backend.type} (${modelDisplay})`
    : config.backend.type;

  const lines = [
    "AutoTranscribe2 WatcherControl",
    "",
    `Watcher process: ${reconciliation.watcherProcessState}`,
    `Reconciled process state: ${reconciliation.reconciledProcessState}`,
    `Latest transcript: ${latestTranscript ? path.basename(latestTranscript.transcriptPath) : "-"}`,
    `Backend: ${backendLabel}`,
    ...dashboard.lines.filter((line) => line !== "AutoTranscribe2 status" && line !== "Press Ctrl+C to exit.")
  ];

  return {
    watcherProcessState: reconciliation.watcherProcessState,
    runtimeActivityState: status?.runtimeActivityState ?? null,
    statusFreshness: dashboard.statusFreshness,
    latestTranscript: latestTranscript ? path.basename(latestTranscript.transcriptPath) : null,
    reconciledProcessState: reconciliation.reconciledProcessState,
    lines
  };
}

export function getCompactStatusSnapshot(config: AppConfig): CompactStatusSnapshot {
  const status = readStatus(config.runtimeStatusPath);
  const latestTranscript = getLatestTranscript(config);
  const reconciliation = reconcileManagedWatcherStack(config);
  return buildCompactStatusSnapshot(reconciliation.watcherProcessState, status, latestTranscript);
}

export function getCompactStatusSnapshotLines(config: AppConfig): string[] {
  return formatCompactStatusSnapshotLines(getCompactStatusSnapshot(config));
}

function parseLogMeta(line: string): Record<string, unknown> | null {
  const jsonStart = line.indexOf("{");
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function listRecentTranscriptionJobs(config: AppConfig, limit: number = RECENT_JOB_LIMIT): RecentTranscriptionJob[] {
  const logFilePath = path.resolve(config.logging.logFile);
  if (!fs.existsSync(logFilePath)) return [];

  const lines = fs.readFileSync(logFilePath, "utf8").split(/\r?\n/).filter(Boolean);
  const jobs: RecentTranscriptionJob[] = [];

  for (let i = lines.length - 1; i >= 0 && jobs.length < limit; i -= 1) {
    const line = lines[i];
    if (!line.includes("Finished transcription job")) continue;

    const meta = parseLogMeta(line);
    if (!meta) continue;

    jobs.push({
      finishedAt: line.slice(1, 25),
      audioFile: typeof meta.audioFile === "string" ? meta.audioFile : "-",
      transcriptPath: typeof meta.transcriptPath === "string" ? meta.transcriptPath : "-",
      title: typeof meta.title === "string" ? meta.title : null
    });
  }

  return jobs;
}

function findLatestTranscriptInDirectory(directoryPath: string): LatestTranscript | null {
  if (!fs.existsSync(directoryPath)) return null;

  let latest: LatestTranscript | null = null;
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = findLatestTranscriptInDirectory(entryPath);
      if (nested && (!latest || nested.updatedAt > latest.updatedAt)) {
        latest = nested;
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const stat = fs.statSync(entryPath);
    const candidate: LatestTranscript = {
      transcriptPath: entryPath,
      updatedAt: stat.mtime
    };

    if (!latest || candidate.updatedAt > latest.updatedAt) {
      latest = candidate;
    }
  }

  return latest;
}

export function getLatestTranscript(config: AppConfig): LatestTranscript | null {
  return findLatestTranscriptInDirectory(path.resolve(config.watch.outputDirectory));
}

export function openLatestTranscript(config: AppConfig): LatestTranscript {
  const latestTranscript = getLatestTranscript(config);
  if (!latestTranscript) {
    throw new Error("No transcript found in the configured output directory.");
  }

  if (isTestMode()) {
    return latestTranscript;
  }

  if (process.platform === "darwin") {
    const result = spawnSync("open", [latestTranscript.transcriptPath], { stdio: "ignore" });
    if (result.error || result.status !== 0) {
      throw new Error(`Failed to open transcript at '${latestTranscript.transcriptPath}'.`);
    }
    return latestTranscript;
  }

  throw new Error(`Open Latest Transcript is only implemented for macOS. Current platform: ${process.platform}`);
}
