import type { RuntimeStatus } from "../infrastructure/status/RuntimeStatus.js";

export type EffectiveState = "idle" | "processing" | "error" | "stale";

const STALE_THRESHOLD_MS = 30_000;

export function getEffectiveState(
  status: RuntimeStatus | null,
  thresholdMs: number = STALE_THRESHOLD_MS
): EffectiveState | "none" {
  if (!status) return "none";
  const updated = new Date(status.updatedAt).getTime();
  if (Number.isNaN(updated) || Date.now() - updated > thresholdMs) {
    return "stale";
  }
  return status.state as EffectiveState;
}

function fallback(value: string | number | null | undefined, def: string = "-"): string {
  if (value === null || value === undefined) return def;
  if (typeof value === "string" && value.trim() === "") return def;
  return String(value);
}

export function formatDashboardLines(
  status: RuntimeStatus | null,
  statusPath: string
): { lines: string[]; effectiveState: EffectiveState | "none" } {
  const effectiveState = getEffectiveState(status);

  if (!status) {
    return {
      effectiveState: "none",
      lines: [
        "AutoTranscribe2 status",
        "",
        "State: -",
        "Queue length: -",
        "Current file: -",
        "Last update: -",
        "Last error: -",
        "",
        `Status file: ${statusPath}`,
        "(No file found or invalid. Is the watcher running?)",
        "",
        "Press Ctrl+C to exit."
      ]
    };
  }

  const stateLabel = effectiveState === "stale" ? "stale" : status.state;
  let updatedLabel = "-";
  try {
    const d = new Date(status.updatedAt);
    updatedLabel = Number.isNaN(d.getTime())
      ? "-"
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    // keep fallback
  }

  return {
    lines: [
      "AutoTranscribe2 status",
      "",
      `State: ${stateLabel}`,
      `Queue length: ${fallback(status.queueLength, "0")}`,
      `Current file: ${fallback(status.currentFile)}`,
      `Last update: ${updatedLabel}`,
      `Last error: ${fallback(status.lastError)}`,
      "",
      "Press Ctrl+C to exit."
    ],
    effectiveState
  };
}
