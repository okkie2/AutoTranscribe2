import fs from "node:fs";
import path from "node:path";

export type RuntimeState = "idle" | "processing" | "error";

export interface RuntimeStatus {
  state: RuntimeState;
  queueLength: number;
  currentFile: string | null;
  lastError: string | null;
  updatedAt: string;
}

const DEFAULT_STATUS_DIR = "runtime";
const STATUS_FILENAME = "status.json";

/**
 * Returns the default path for the runtime status file (relative to cwd).
 */
export function getDefaultStatusPath(): string {
  return path.join(process.cwd(), DEFAULT_STATUS_DIR, STATUS_FILENAME);
}

/**
 * Writes the given status to the runtime status file. Merges with existing
 * so callers can update only the fields they care about.
 */
export function writeStatus(
  statusPath: string,
  partial: Partial<Omit<RuntimeStatus, "updatedAt">> & { updatedAt?: string }
): void {
  const dir = path.dirname(statusPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existing = readStatus(statusPath);
  const updatedAt = partial.updatedAt ?? new Date().toISOString();
  const next: RuntimeStatus = {
    state: partial.state ?? existing?.state ?? "idle",
    queueLength: partial.queueLength ?? existing?.queueLength ?? 0,
    currentFile: partial.currentFile !== undefined ? partial.currentFile : existing?.currentFile ?? null,
    lastError: partial.lastError !== undefined ? partial.lastError : existing?.lastError ?? null,
    updatedAt
  };
  fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), { encoding: "utf8" });
}

/**
 * Creates an updater that writes to the given status path. Use this to pass
 * into components that need to report status (e.g. JobWorker).
 */
export function createStatusUpdater(statusPath: string): (partial: Partial<Omit<RuntimeStatus, "updatedAt">>) => void {
  return (partial) => {
    writeStatus(statusPath, { ...partial, updatedAt: new Date().toISOString() });
  };
}

/**
 * Reads the current runtime status from disk, or null if missing/invalid.
 */
export function readStatus(statusPath: string): RuntimeStatus | null {
  const validStates: RuntimeState[] = ["idle", "processing", "error"];
  try {
    if (!fs.existsSync(statusPath)) return null;
    const raw = fs.readFileSync(statusPath, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && "state" in data && "updatedAt" in data) {
      const state = String((data as RuntimeStatus).state);
      return {
        state: validStates.includes(state as RuntimeState) ? (state as RuntimeState) : "idle",
        queueLength: Number((data as RuntimeStatus).queueLength) || 0,
        currentFile: (data as RuntimeStatus).currentFile ?? null,
        lastError: (data as RuntimeStatus).lastError ?? null,
        updatedAt: String((data as RuntimeStatus).updatedAt)
      };
    }
  } catch {
    // ignore
  }
  return null;
}
