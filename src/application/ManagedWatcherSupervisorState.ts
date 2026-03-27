import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";

export type SupervisorDesiredState = "running" | "stopped";
export type SupervisorWatcherProcessState = "running" | "stopped" | "starting" | "stopping" | "error";

export interface ManagedWatcherSupervisorState {
  stateVersion: 1;
  desiredState: SupervisorDesiredState;
  watcherProcessState: SupervisorWatcherProcessState;
  watchPid: number | null;
  ingestPid: number | null;
  detail: string;
  updatedAt: string;
}

const SUPERVISOR_STATE_FILENAME = "managed-watcher-supervisor.json";

export function getSupervisorStatePath(config: AppConfig): string {
  return path.join(path.dirname(config.runtimeStatusPath), SUPERVISOR_STATE_FILENAME);
}

export function readSupervisorState(config: AppConfig): ManagedWatcherSupervisorState | null {
  const statePath = getSupervisorStatePath(config);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, unknown>;
    const desiredState = raw.desiredState;
    const watcherProcessState = raw.watcherProcessState;

    if (
      raw.stateVersion !== 1 ||
      (desiredState !== "running" && desiredState !== "stopped") ||
      (watcherProcessState !== "running" &&
        watcherProcessState !== "stopped" &&
        watcherProcessState !== "starting" &&
        watcherProcessState !== "stopping" &&
        watcherProcessState !== "error") ||
      typeof raw.updatedAt !== "string"
    ) {
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
  } catch {
    return null;
  }
}

export function writeSupervisorState(
  config: AppConfig,
  next: Omit<ManagedWatcherSupervisorState, "stateVersion" | "updatedAt"> & { updatedAt?: string }
): void {
  const statePath = getSupervisorStatePath(config);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const payload: ManagedWatcherSupervisorState = {
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
