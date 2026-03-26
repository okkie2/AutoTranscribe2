import path from "node:path";
const STALE_THRESHOLD_MS = 30000;
const ACTIVE_RUNTIME_STATES = [
    "waitingForStableFile",
    "ingesting",
    "enqueuingJob",
    "draining",
    "processingTranscription",
    "writingTranscript"
];
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
    const heartbeat = status.lastHeartbeatAt && ACTIVE_RUNTIME_STATES.includes(status.runtimeActivityState)
        ? new Date(status.lastHeartbeatAt).getTime()
        : Number.NaN;
    const freshestTimestamp = Number.isNaN(heartbeat) ? updated : Math.max(updated, heartbeat);
    if (Number.isNaN(freshestTimestamp) || Date.now() - freshestTimestamp > thresholdMs) {
        return "stale";
    }
    return "fresh";
}
function formatTimestamp(value) {
    if (!value) {
        return "-";
    }
    try {
        const d = new Date(value);
        return Number.isNaN(d.getTime())
            ? "-"
            : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    catch {
        return "-";
    }
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
    const updatedLabel = formatTimestamp(status.updatedAt);
    const heartbeatLabel = formatTimestamp(status.lastHeartbeatAt);
    return {
        lines: [
            "AutoTranscribe2 status",
            "",
            `Activity: ${fallback(status.runtimeActivityState)}`,
            `Freshness: ${statusFreshness}`,
            `Queue length: ${fallback(status.queueLength, "0")}`,
            `Current job: ${fallback(status.currentFile)}`,
            `Title provider: ${fallback(status.titleProviderState)}`,
            `Title provider detail: ${fallback(status.titleProviderDetail)}`,
            `Last update: ${updatedLabel}`,
            `Last heartbeat: ${heartbeatLabel}`,
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
        `Current Transcription Job: ${fallback(snapshot.currentJob)}`,
        `Latest Transcript: ${fallback(snapshot.latestTranscript)}`,
        ""
    ];
}
