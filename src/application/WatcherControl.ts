import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";
import { readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import {
  buildCompactStatusSnapshot,
  formatCompactStatusSnapshotLines,
  formatDashboardLines,
  type CompactStatusSnapshot,
  type StatusFreshness
} from "./StatusSnapshot.js";

const LEGACY_PID_FILE = ".autotranscribe2-pids.json";
const STACK_LOCK_FILENAME = "managed-stack.lock.json";
const STARTUP_STABILIZE_MS = 400;
const STOP_TIMEOUT_MS = 10_000;
const STOP_POLL_INTERVAL_MS = 250;
const RECENT_JOB_LIMIT = 5;

export type WatcherProcessState = "running" | "stopped" | "starting" | "stopping" | "error";
export type ReconciledProcessState = "running" | "stopped" | "partial" | "staleLock" | "inconsistent" | "error";

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

export interface ManagedWatcherStack {
  watchPid: number | null;
  ingestPid: number | null;
  createdAt: string;
  cwd: string;
  runtimeRoot: string;
  hostname: string;
  lockVersion: number;
}

interface LegacyWatcherPids {
  ingestPid?: number;
  watchPid?: number;
}

export interface StackReconciliation {
  reconciledProcessState: ReconciledProcessState;
  watcherProcessState: WatcherProcessState;
  watchPid: number | null;
  ingestPid: number | null;
  hasLock: boolean;
  hasLegacyPidFile: boolean;
  runtimeStatusFresh: boolean;
  unmanagedWatcherDetected: boolean;
  detail: string;
}

function getLegacyPidFilePath(): string {
  return path.resolve(LEGACY_PID_FILE);
}

function getStackLockPath(config: AppConfig): string {
  return path.join(path.dirname(config.runtimeStatusPath), STACK_LOCK_FILENAME);
}

function readLegacyPidFile(): LegacyWatcherPids | null {
  const pidFilePath = getLegacyPidFilePath();
  if (!fs.existsSync(pidFilePath)) return null;

  try {
    const raw = fs.readFileSync(pidFilePath, "utf8");
    return JSON.parse(raw) as LegacyWatcherPids;
  } catch {
    return null;
  }
}

function writeLegacyPidFile(pids: { ingestPid: number; watchPid: number }): void {
  fs.writeFileSync(getLegacyPidFilePath(), JSON.stringify(pids, null, 2), { encoding: "utf8" });
}

function removeLegacyPidFile(): void {
  try {
    fs.unlinkSync(getLegacyPidFilePath());
  } catch {
    // ignore
  }
}

function readStackLock(config: AppConfig): ManagedWatcherStack | null {
  const lockPath = getStackLockPath(config);
  if (!fs.existsSync(lockPath)) return null;

  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    return JSON.parse(raw) as ManagedWatcherStack;
  } catch {
    return null;
  }
}

function writeStackLock(config: AppConfig, stack: ManagedWatcherStack): void {
  const lockPath = getStackLockPath(config);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(stack, null, 2), { encoding: "utf8" });
}

function tryCreateStackLock(config: AppConfig, stack: ManagedWatcherStack): boolean {
  const lockPath = getStackLockPath(config);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  try {
    const handle = fs.openSync(lockPath, "wx");
    fs.writeFileSync(handle, JSON.stringify(stack, null, 2), { encoding: "utf8" });
    fs.closeSync(handle);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function removeStackLock(config: AppConfig): void {
  try {
    fs.unlinkSync(getStackLockPath(config));
  } catch {
    // ignore
  }
}

function isPidRunning(pid: number | undefined | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickPid(lockPid: number | null | undefined, legacyPid: number | undefined): number | null {
  return lockPid ?? legacyPid ?? null;
}

function runtimeStatusLooksAlive(config: AppConfig): boolean {
  const status = readStatus(config.runtimeStatusPath);
  if (!status) return false;
  const updatedAt = new Date(status.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt <= 30_000;
}

function listWatcherLikeProcesses(): Array<{ pid: number; command: string }> {
  const overridden = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
  const raw = overridden ??
    spawnSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).stdout ??
    "";

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), command: match[2] };
    })
    .filter((entry): entry is { pid: number; command: string } => entry !== null);
}

function detectUnmanagedWatcherActivity(managedPids: Array<number | null>): boolean {
  const pidSet = new Set(managedPids.filter((pid): pid is number => typeof pid === "number"));

  return listWatcherLikeProcesses().some(({ pid, command }) => {
    if (pidSet.has(pid) || pid === process.pid) {
      return false;
    }

    return (
      command.includes("dist/cli/index.js watch") ||
      command.includes("dist/cli/ingestJustPressRecord.js") ||
      command.includes("node dist/cli/index.js watch") ||
      command.includes("node dist/cli/ingestJustPressRecord.js")
    );
  });
}

export function reconcileManagedWatcherStack(config: AppConfig): StackReconciliation {
  const lock = readStackLock(config);
  const legacy = readLegacyPidFile();
  const watchPid = pickPid(lock?.watchPid, legacy?.watchPid);
  const ingestPid = pickPid(lock?.ingestPid, legacy?.ingestPid);
  const watchRunning = isPidRunning(watchPid);
  const ingestRunning = isPidRunning(ingestPid);
  const hasLock = lock !== null;
  const hasLegacyPidFile = legacy !== null;
  const runtimeStatusFresh = runtimeStatusLooksAlive(config);
  const unmanagedWatcherDetected = detectUnmanagedWatcherActivity([watchPid, ingestPid]);

  let reconciledProcessState: ReconciledProcessState;
  let detail: string;

  if (watchRunning && ingestRunning) {
    reconciledProcessState = "running";
    detail = "Both managed processes are alive.";
  } else if (unmanagedWatcherDetected) {
    reconciledProcessState = "error";
    detail = "Watcher-like runtime activity exists outside the managed stack lock.";
  } else if (!watchRunning && !ingestRunning && (hasLock || hasLegacyPidFile)) {
    reconciledProcessState = "staleLock";
    detail = "Lock or PID artifacts exist but managed processes are gone.";
  } else if (!watchRunning && !ingestRunning) {
    reconciledProcessState = "stopped";
    detail = runtimeStatusFresh
      ? "No managed processes are alive; runtime status is only leftover recent activity."
      : "No managed processes or stack artifacts are active.";
  } else if (watchRunning !== ingestRunning) {
    reconciledProcessState = "partial";
    detail = "Only one managed process is alive.";
  } else {
    reconciledProcessState = "error";
    detail = "Managed stack could not be reconciled safely.";
  }

  return {
    reconciledProcessState,
    watcherProcessState: mapReconciledStateToWatcherProcessState(reconciledProcessState),
    watchPid,
    ingestPid,
    hasLock,
    hasLegacyPidFile,
    runtimeStatusFresh,
    unmanagedWatcherDetected,
    detail
  };
}

export function getDiagnosticStateSnapshot(config: AppConfig): DiagnosticStateSnapshot {
  const status = readStatus(config.runtimeStatusPath);
  const reconciliation = reconcileManagedWatcherStack(config);
  const latestTranscript = getLatestTranscript(config);
  const statusFreshness = formatDashboardLines(status, config.runtimeStatusPath).statusFreshness;

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

function mapReconciledStateToWatcherProcessState(
  reconciledProcessState: ReconciledProcessState
): WatcherProcessState {
  switch (reconciledProcessState) {
    case "running":
      return "running";
    case "stopped":
    case "staleLock":
      return "stopped";
    case "partial":
    case "inconsistent":
    case "error":
    default:
      return "error";
  }
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
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: title.ollama.model,
        prompt: "healthcheck",
        stream: false,
        options: { temperature: 0 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log("[WatcherControl] Ollama is reachable.");
      return;
    }
    attemptStartOllama();
  } catch {
    clearTimeout(timeout);
    attemptStartOllama();
  }
}

function attemptStartOllama(): void {
  console.log("[WatcherControl] Ollama not reachable; attempting to start via 'brew services start ollama'...");
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

  console.log("[WatcherControl] Starting AutoTranscribe2 watcher control (Ollama + ingest:jpr + watcher)...");
  try {
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
    await delay(STARTUP_STABILIZE_MS);

    const started = reconcileManagedWatcherStack(config);
    if (started.reconciledProcessState !== "running") {
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

  const targets = [
    { name: "ingest:jpr", pid: reconciliation.ingestPid },
    { name: "watcher", pid: reconciliation.watchPid }
  ];

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

  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (
    (isPidRunning(reconciliation.watchPid) || isPidRunning(reconciliation.ingestPid)) &&
    Date.now() < deadline
  ) {
    await delay(STOP_POLL_INTERVAL_MS);
  }

  cleanupStackArtifacts(config);

  if (isPidRunning(reconciliation.watchPid) || isPidRunning(reconciliation.ingestPid)) {
    traceEvent({
      event: "stop_failed",
      source: "WatcherControl",
      command: "stop",
      observed_state: getDiagnosticStateSnapshot(config),
      metadata: { reason: "managed processes still alive after stop timeout" }
    });
    throw new Error("Managed watcher stack did not stop cleanly.");
  }

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
  const lines = [
    "AutoTranscribe2 WatcherControl",
    "",
    `Watcher process: ${reconciliation.watcherProcessState}`,
    `Reconciled process state: ${reconciliation.reconciledProcessState}`,
    `Latest transcript: ${latestTranscript ? path.basename(latestTranscript.transcriptPath) : "-"}`,
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

  if (process.platform === "darwin") {
    const result = spawnSync("open", [latestTranscript.transcriptPath], { stdio: "ignore" });
    if (result.error || result.status !== 0) {
      throw new Error(`Failed to open transcript at '${latestTranscript.transcriptPath}'.`);
    }
    return latestTranscript;
  }

  throw new Error(`Open Latest Transcript is only implemented for macOS. Current platform: ${process.platform}`);
}
