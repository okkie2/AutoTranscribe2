import fs from "node:fs";
import path from "node:path";

export type RuntimeActivityState =
  | "idle"
  | "scanning"
  | "waitingForStableFile"
  | "ingesting"
  | "enqueuingJob"
  | "processingTranscription"
  | "writingTranscript"
  | "completed"
  | "failed";

export interface RuntimeStatus {
  runtimeActivityState: RuntimeActivityState;
  queueLength: number;
  currentFile: string | null;
  lastError: string | null;
  updatedAt: string;
  currentJobId?: string | null;
  currentPhaseDetail?: string | null;
}

const VALID_ACTIVITY_STATES: RuntimeActivityState[] = [
  "idle",
  "scanning",
  "waitingForStableFile",
  "ingesting",
  "enqueuingJob",
  "processingTranscription",
  "writingTranscript",
  "completed",
  "failed"
];

const DEFAULT_STATUS_DIR = "runtime";
const STATUS_FILENAME = "status.json";

export function getDefaultStatusPath(): string {
  return path.join(process.cwd(), DEFAULT_STATUS_DIR, STATUS_FILENAME);
}

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
    runtimeActivityState:
      partial.runtimeActivityState ?? existing?.runtimeActivityState ?? "idle",
    queueLength: partial.queueLength ?? existing?.queueLength ?? 0,
    currentFile: partial.currentFile !== undefined ? partial.currentFile : existing?.currentFile ?? null,
    lastError: partial.lastError !== undefined ? partial.lastError : existing?.lastError ?? null,
    currentJobId: partial.currentJobId !== undefined ? partial.currentJobId : existing?.currentJobId ?? null,
    currentPhaseDetail:
      partial.currentPhaseDetail !== undefined
        ? partial.currentPhaseDetail
        : existing?.currentPhaseDetail ?? null,
    updatedAt
  };
  fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), { encoding: "utf8" });
}

export function createStatusUpdater(
  statusPath: string
): (partial: Partial<Omit<RuntimeStatus, "updatedAt">>) => void {
  return (partial) => {
    writeStatus(statusPath, { ...partial, updatedAt: new Date().toISOString() });
  };
}

export function readStatus(statusPath: string): RuntimeStatus | null {
  try {
    if (!fs.existsSync(statusPath)) return null;
    const raw = fs.readFileSync(statusPath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const runtimeActivityState = normalizeRuntimeActivityState(data);

    if (!runtimeActivityState || typeof data.updatedAt !== "string") {
      return null;
    }

    return {
      runtimeActivityState,
      queueLength: Number(data.queueLength) || 0,
      currentFile: typeof data.currentFile === "string" ? data.currentFile : null,
      lastError: typeof data.lastError === "string" ? data.lastError : null,
      currentJobId: typeof data.currentJobId === "string" ? data.currentJobId : null,
      currentPhaseDetail: typeof data.currentPhaseDetail === "string" ? data.currentPhaseDetail : null,
      updatedAt: data.updatedAt
    };
  } catch {
    return null;
  }
}

function normalizeRuntimeActivityState(data: Record<string, unknown>): RuntimeActivityState | null {
  const activity =
    typeof data.runtimeActivityState === "string"
      ? data.runtimeActivityState
      : typeof data.state === "string"
        ? legacyStateToRuntimeActivityState(data.state)
        : null;

  if (!activity || !VALID_ACTIVITY_STATES.includes(activity as RuntimeActivityState)) {
    return null;
  }

  return activity as RuntimeActivityState;
}

function legacyStateToRuntimeActivityState(state: string): RuntimeActivityState {
  switch (state) {
    case "processing":
      return "processingTranscription";
    case "error":
      return "failed";
    case "idle":
    default:
      return "idle";
  }
}
