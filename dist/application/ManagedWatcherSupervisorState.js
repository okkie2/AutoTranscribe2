import fs from "node:fs";
import path from "node:path";
const SUPERVISOR_STATE_FILENAME = "managed-watcher-supervisor.json";
export function getSupervisorStatePath(config) {
    return path.join(path.dirname(config.runtimeStatusPath), SUPERVISOR_STATE_FILENAME);
}
export function readSupervisorState(config) {
    const statePath = getSupervisorStatePath(config);
    if (!fs.existsSync(statePath)) {
        return null;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
        const desiredState = raw.desiredState;
        const watcherProcessState = raw.watcherProcessState;
        if (raw.stateVersion !== 1 ||
            (desiredState !== "running" && desiredState !== "stopped") ||
            (watcherProcessState !== "running" &&
                watcherProcessState !== "stopped" &&
                watcherProcessState !== "starting" &&
                watcherProcessState !== "stopping" &&
                watcherProcessState !== "error") ||
            typeof raw.updatedAt !== "string") {
            return null;
        }
        return {
            stateVersion: 1,
            desiredState,
            watcherProcessState,
            watchPid: typeof raw.watchPid === "number" ? raw.watchPid : null,
            ingestPid: typeof raw.ingestPid === "number" ? raw.ingestPid : null,
            detail: typeof raw.detail === "string" ? raw.detail : "",
            updatedAt: raw.updatedAt
        };
    }
    catch {
        return null;
    }
}
export function writeSupervisorState(config, next) {
    const statePath = getSupervisorStatePath(config);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const payload = {
        stateVersion: 1,
        desiredState: next.desiredState,
        watcherProcessState: next.watcherProcessState,
        watchPid: next.watchPid,
        ingestPid: next.ingestPid,
        detail: next.detail,
        updatedAt: next.updatedAt ?? new Date().toISOString()
    };
    fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), { encoding: "utf8" });
}
