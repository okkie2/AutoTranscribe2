const STALE_THRESHOLD_MS = 30000;
/**
 * Determines the effective state for display (idle/processing/error/stale).
 * Status is stale when updatedAt is older than thresholdMs.
 */
export function getEffectiveState(status, thresholdMs = STALE_THRESHOLD_MS) {
    if (!status)
        return "none";
    const updated = new Date(status.updatedAt).getTime();
    if (Number.isNaN(updated) || Date.now() - updated > thresholdMs) {
        return "stale";
    }
    return status.state;
}
/**
 * Formats a single line value, using fallback when missing or invalid.
 */
function fallback(value, def = "-") {
    if (value === null || value === undefined)
        return def;
    if (typeof value === "string" && value.trim() === "")
        return def;
    return String(value);
}
/**
 * Returns dashboard lines (without colour) and the effective state for colouring.
 * Used by the live status command and by tests.
 */
export function formatDashboardLines(status, statusPath) {
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
    let updatedLabel;
    try {
        const d = new Date(status.updatedAt);
        updatedLabel = Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    catch {
        updatedLabel = "-";
    }
    const lines = [
        "AutoTranscribe2 status",
        "",
        `State: ${stateLabel}`,
        `Queue length: ${fallback(status.queueLength, "0")}`,
        `Current file: ${fallback(status.currentFile)}`,
        `Last update: ${updatedLabel}`,
        `Last error: ${fallback(status.lastError)}`,
        "",
        "Press Ctrl+C to exit."
    ];
    return { lines, effectiveState };
}
