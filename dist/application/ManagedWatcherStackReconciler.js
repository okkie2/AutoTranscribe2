import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { readSupervisorState } from "./ManagedWatcherSupervisorState.js";
const LEGACY_PID_FILE = ".autotranscribe2-pids.json";
const STACK_LOCK_FILENAME = "managed-stack.lock.json";
const STATUS_FRESHNESS_THRESHOLD_MS = 30000;
export function getLegacyPidFilePath() {
    return path.resolve(LEGACY_PID_FILE);
}
export function getStackLockPath(config) {
    return path.join(path.dirname(config.runtimeStatusPath), STACK_LOCK_FILENAME);
}
export function readLegacyPidFile() {
    const pidFilePath = getLegacyPidFilePath();
    if (!fs.existsSync(pidFilePath))
        return null;
    try {
        const raw = fs.readFileSync(pidFilePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function writeLegacyPidFile(pids) {
    fs.writeFileSync(getLegacyPidFilePath(), JSON.stringify(pids, null, 2), { encoding: "utf8" });
}
export function removeLegacyPidFile() {
    try {
        fs.unlinkSync(getLegacyPidFilePath());
    }
    catch {
        // ignore
    }
}
export function readStackLock(config) {
    const lockPath = getStackLockPath(config);
    if (!fs.existsSync(lockPath))
        return null;
    try {
        const raw = fs.readFileSync(lockPath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function writeStackLock(config, stack) {
    const lockPath = getStackLockPath(config);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify(stack, null, 2), { encoding: "utf8" });
}
export function tryCreateStackLock(config, stack) {
    const lockPath = getStackLockPath(config);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    try {
        const handle = fs.openSync(lockPath, "wx");
        fs.writeFileSync(handle, JSON.stringify(stack, null, 2), { encoding: "utf8" });
        fs.closeSync(handle);
        return true;
    }
    catch (error) {
        if (error.code === "EEXIST") {
            return false;
        }
        throw error;
    }
}
export function removeStackLock(config) {
    try {
        fs.unlinkSync(getStackLockPath(config));
    }
    catch {
        // ignore
    }
}
export function isPidRunning(pid) {
    if (!pid)
        return false;
    const overridden = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
    if (overridden !== undefined && overridden.trim() !== "") {
        return listWatcherLikeProcesses().some((entry) => entry.pid === pid);
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function pickPid(lockPid, legacyPid) {
    return lockPid ?? legacyPid ?? null;
}
function runtimeStatusLooksAlive(config) {
    const status = readStatus(config.runtimeStatusPath);
    if (!status)
        return false;
    const updatedAt = new Date(status.updatedAt).getTime();
    if (Number.isNaN(updatedAt))
        return false;
    return Date.now() - updatedAt <= STATUS_FRESHNESS_THRESHOLD_MS;
}
function listWatcherLikeProcesses() {
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
        if (!match)
            return null;
        return { pid: Number(match[1]), command: match[2] };
    })
        .filter((entry) => entry !== null);
}
function detectUnmanagedWatcherActivity(managedPids) {
    const pidSet = new Set(managedPids.filter((pid) => typeof pid === "number"));
    return listWatcherLikeProcesses().some(({ pid, command }) => {
        if (pidSet.has(pid) || pid === process.pid) {
            return false;
        }
        return (command.includes("dist/cli/index.js watch") ||
            command.includes("dist/cli/ingestJustPressRecord.js") ||
            command.includes("node dist/cli/index.js watch") ||
            command.includes("node dist/cli/ingestJustPressRecord.js"));
    });
}
function mapReconciledStateToWatcherProcessState(reconciledProcessState) {
    switch (reconciledProcessState) {
        case "starting":
            return "starting";
        case "running":
            return "running";
        case "stopping":
            return "stopping";
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
function reconcileFromSupervisorState(config) {
    const supervisor = readSupervisorState(config);
    if (!supervisor) {
        return null;
    }
    const watchPid = supervisor.watchPid;
    const ingestPid = supervisor.ingestPid;
    const watchRunning = isPidRunning(watchPid);
    const ingestRunning = isPidRunning(ingestPid);
    const runtimeStatusFresh = runtimeStatusLooksAlive(config);
    const hasLock = readStackLock(config) !== null;
    const hasLegacyPidFile = readLegacyPidFile() !== null;
    const unmanagedWatcherDetected = detectUnmanagedWatcherActivity([watchPid, ingestPid]);
    if (unmanagedWatcherDetected) {
        return {
            reconciledProcessState: "error",
            watcherProcessState: "error",
            watchPid,
            ingestPid,
            hasLock,
            hasLegacyPidFile,
            runtimeStatusFresh,
            unmanagedWatcherDetected,
            detail: "Watcher-like runtime activity exists outside the managed supervisor state."
        };
    }
    switch (supervisor.watcherProcessState) {
        case "starting":
            if (watchRunning && ingestRunning) {
                return {
                    reconciledProcessState: "running",
                    watcherProcessState: "running",
                    watchPid,
                    ingestPid,
                    hasLock,
                    hasLegacyPidFile,
                    runtimeStatusFresh,
                    unmanagedWatcherDetected,
                    detail: "Supervisor state reached running: both managed processes are alive."
                };
            }
            return {
                reconciledProcessState: "starting",
                watcherProcessState: "starting",
                watchPid,
                ingestPid,
                hasLock,
                hasLegacyPidFile,
                runtimeStatusFresh,
                unmanagedWatcherDetected,
                detail: supervisor.detail || "Supervisor is starting the managed watcher stack."
            };
        case "stopping":
            if (watchRunning || ingestRunning) {
                return {
                    reconciledProcessState: "stopping",
                    watcherProcessState: "stopping",
                    watchPid,
                    ingestPid,
                    hasLock,
                    hasLegacyPidFile,
                    runtimeStatusFresh,
                    unmanagedWatcherDetected,
                    detail: supervisor.detail || "Supervisor is stopping the managed watcher stack."
                };
            }
            return {
                reconciledProcessState: "stopped",
                watcherProcessState: "stopped",
                watchPid,
                ingestPid,
                hasLock,
                hasLegacyPidFile,
                runtimeStatusFresh,
                unmanagedWatcherDetected,
                detail: "Supervisor state reached stopped: managed processes are no longer alive."
            };
        case "running":
            if (watchRunning && ingestRunning) {
                return {
                    reconciledProcessState: "running",
                    watcherProcessState: "running",
                    watchPid,
                    ingestPid,
                    hasLock,
                    hasLegacyPidFile,
                    runtimeStatusFresh,
                    unmanagedWatcherDetected,
                    detail: supervisor.detail || "Supervisor reports the managed watcher stack as running."
                };
            }
            if (watchRunning !== ingestRunning) {
                return {
                    reconciledProcessState: "partial",
                    watcherProcessState: "error",
                    watchPid,
                    ingestPid,
                    hasLock,
                    hasLegacyPidFile,
                    runtimeStatusFresh,
                    unmanagedWatcherDetected,
                    detail: "Supervisor expected a running stack but only one managed process is alive."
                };
            }
            return {
                reconciledProcessState: "staleLock",
                watcherProcessState: "stopped",
                watchPid,
                ingestPid,
                hasLock,
                hasLegacyPidFile,
                runtimeStatusFresh,
                unmanagedWatcherDetected,
                detail: "Supervisor expected a running stack, but the managed processes are gone; treating this as stale state."
            };
        case "stopped":
            if (!watchRunning && !ingestRunning) {
                return {
                    reconciledProcessState: "stopped",
                    watcherProcessState: "stopped",
                    watchPid,
                    ingestPid,
                    hasLock,
                    hasLegacyPidFile,
                    runtimeStatusFresh,
                    unmanagedWatcherDetected,
                    detail: supervisor.detail || "Supervisor reports the managed watcher stack as stopped."
                };
            }
            return {
                reconciledProcessState: "error",
                watcherProcessState: "error",
                watchPid,
                ingestPid,
                hasLock,
                hasLegacyPidFile,
                runtimeStatusFresh,
                unmanagedWatcherDetected,
                detail: "Supervisor reports stopped but managed processes are still alive."
            };
        case "error":
        default:
            return {
                reconciledProcessState: "error",
                watcherProcessState: "error",
                watchPid,
                ingestPid,
                hasLock,
                hasLegacyPidFile,
                runtimeStatusFresh,
                unmanagedWatcherDetected,
                detail: supervisor.detail || "Supervisor reported an error state."
            };
    }
}
export function reconcileManagedWatcherStack(config) {
    const supervisorReconciliation = reconcileFromSupervisorState(config);
    if (supervisorReconciliation) {
        return supervisorReconciliation;
    }
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
    let reconciledProcessState;
    let detail;
    if (watchRunning && ingestRunning) {
        reconciledProcessState = "running";
        detail = "Both managed processes are alive.";
    }
    else if (unmanagedWatcherDetected) {
        reconciledProcessState = "error";
        detail = "Watcher-like runtime activity exists outside the managed stack lock.";
    }
    else if (!watchRunning && !ingestRunning && (hasLock || hasLegacyPidFile)) {
        reconciledProcessState = "staleLock";
        detail = "Lock or PID artifacts exist but managed processes are gone.";
    }
    else if (!watchRunning && !ingestRunning) {
        reconciledProcessState = "stopped";
        detail = runtimeStatusFresh
            ? "No managed processes are alive; runtime status is only leftover recent activity."
            : "No managed processes or stack artifacts are active.";
    }
    else if (watchRunning !== ingestRunning) {
        reconciledProcessState = "partial";
        detail = "Only one managed process is alive.";
    }
    else {
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
