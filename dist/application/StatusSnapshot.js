import path from "node:path";
const STALE_THRESHOLD_MS = 30000;
function fallback(value, def = "-") {
    if (value === null || value === undefined)
        return def;
    if (typeof value === "string" && value.trim() === "")
        return def;
    return String(value);
}
export function getStatusFreshness(status, thresholdMs = STALE_THRESHOLD_MS) {
    if (!status)
        return "missing";
    const updated = new Date(status.updatedAt).getTime();
    if (Number.isNaN(updated) || Date.now() - updated > thresholdMs) {
        return "stale";
    }
    return "fresh";
}
export function formatDashboardLines(status, statusPath) {
    const statusFreshness = getStatusFreshness(status);
    if (!status) {
        return {
            statusFreshness: "missing",
            lines: [
                "AutoTranscribe2 status",
                "",
                "Activity: -",
                "Freshness: missing",
                "Queue length: -",
                "Current job: -",
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
    let updatedLabel = "-";
    try {
        const d = new Date(status.updatedAt);
        updatedLabel = Number.isNaN(d.getTime())
            ? "-"
            : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    catch {
        // keep fallback
    }
    return {
        lines: [
            "AutoTranscribe2 status",
            "",
            `Activity: ${fallback(status.runtimeActivityState)}`,
            `Freshness: ${statusFreshness}`,
            `Queue length: ${fallback(status.queueLength, "0")}`,
            `Current job: ${fallback(status.currentFile)}`,
            `Last update: ${updatedLabel}`,
            `Last error: ${fallback(status.lastError)}`,
            "",
            "Press Ctrl+C to exit."
        ],
        statusFreshness
    };
}
export function buildCompactStatusSnapshot(watcherProcessState, status, latestTranscript) {
    return {
        watcherProcessState,
        runtimeActivityState: status?.runtimeActivityState ?? null,
        statusFreshness: getStatusFreshness(status),
        queueLength: status?.queueLength ?? null,
        currentJob: status?.currentFile ? path.basename(status.currentFile) : null,
        latestTranscript: latestTranscript ? path.basename(latestTranscript.transcriptPath) : null
    };
}
export function formatCompactStatusSnapshotLines(snapshot) {
    return [
        "AutoTranscribe2",
        "",
        `Watcher: ${snapshot.watcherProcessState.toUpperCase()}`,
        `Activity: ${fallback(snapshot.runtimeActivityState)}`,
        `Freshness: ${snapshot.statusFreshness}`,
        `Queue: ${snapshot.queueLength !== null ? `${snapshot.queueLength} jobs` : "-"}`,
        `CurrentJob: ${fallback(snapshot.currentJob)}`,
        `LatestTranscript: ${fallback(snapshot.latestTranscript)}`,
        ""
    ];
}
