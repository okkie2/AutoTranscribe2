import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";
import { readStatus } from "../infrastructure/status/RuntimeStatus.js";

const LEGACY_PID_FILE = ".autotranscribe2-pids.json";
const STACK_LOCK_FILENAME = "managed-stack.lock.json";
const STATUS_FRESHNESS_THRESHOLD_MS = 30_000;

export type WatcherProcessState = "running" | "stopped" | "starting" | "stopping" | "error";
export type ReconciledProcessState = "running" | "stopped" | "partial" | "staleLock" | "inconsistent" | "error";

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

export function getLegacyPidFilePath(): string {
  return path.resolve(LEGACY_PID_FILE);
}

export function getStackLockPath(config: AppConfig): string {
  return path.join(path.dirname(config.runtimeStatusPath), STACK_LOCK_FILENAME);
}

export function readLegacyPidFile(): LegacyWatcherPids | null {
  const pidFilePath = getLegacyPidFilePath();
  if (!fs.existsSync(pidFilePath)) return null;

  try {
    const raw = fs.readFileSync(pidFilePath, "utf8");
    return JSON.parse(raw) as LegacyWatcherPids;
  } catch {
    return null;
  }
}

export function writeLegacyPidFile(pids: { ingestPid: number; watchPid: number }): void {
  fs.writeFileSync(getLegacyPidFilePath(), JSON.stringify(pids, null, 2), { encoding: "utf8" });
}

export function removeLegacyPidFile(): void {
  try {
    fs.unlinkSync(getLegacyPidFilePath());
  } catch {
    // ignore
  }
}

export function readStackLock(config: AppConfig): ManagedWatcherStack | null {
  const lockPath = getStackLockPath(config);
  if (!fs.existsSync(lockPath)) return null;

  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    return JSON.parse(raw) as ManagedWatcherStack;
  } catch {
    return null;
  }
}

export function writeStackLock(config: AppConfig, stack: ManagedWatcherStack): void {
  const lockPath = getStackLockPath(config);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(stack, null, 2), { encoding: "utf8" });
}

export function tryCreateStackLock(config: AppConfig, stack: ManagedWatcherStack): boolean {
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

export function removeStackLock(config: AppConfig): void {
  try {
    fs.unlinkSync(getStackLockPath(config));
  } catch {
    // ignore
  }
}

export function isPidRunning(pid: number | undefined | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pickPid(lockPid: number | null | undefined, legacyPid: number | undefined): number | null {
  return lockPid ?? legacyPid ?? null;
}

function runtimeStatusLooksAlive(config: AppConfig): boolean {
  const status = readStatus(config.runtimeStatusPath);
  if (!status) return false;
  const updatedAt = new Date(status.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt <= STATUS_FRESHNESS_THRESHOLD_MS;
}

function listWatcherLikeProcesses(): Array<{ pid: number; command: string }> {
  const overridden = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
  const raw =
    overridden ??
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
