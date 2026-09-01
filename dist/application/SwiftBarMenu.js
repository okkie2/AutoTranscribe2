const ACTIVE_STATES = new Set([
    "waitingForStableFile",
    "ingesting",
    "enqueuingJob",
    "draining",
    "processingTranscription",
    "writingTranscript"
]);
export function renderSwiftBarMenu(snapshot, pluginPath) {
    const lines = [menuBarLabel(snapshot), "---"];
    lines.push(`Service: ${safeValue(snapshot.service.state)}`);
    lines.push(`Activity: ${safeValue(snapshot.activity)}`);
    lines.push(`Freshness: ${safeValue(snapshot.statusFreshness)}`);
    lines.push(`Current file: ${safeValue(snapshot.currentFile)}`);
    lines.push(`Transcription jobs: ${snapshot.queues.transcriptions.pending} pending, ${snapshot.queues.transcriptions.running} running, ${snapshot.queues.transcriptions.failed} failed`);
    lines.push(`Recordings awaiting discovery: ${safeValue(snapshot.queues.recordings.pending)}`);
    lines.push(`Latest transcript: ${safeValue(snapshot.latestTranscript)}`);
    lines.push(`Last error: ${safeValue(snapshot.lastError)}`);
    lines.push("---");
    lines.push(actionLine("Start", pluginPath, "start"));
    lines.push(actionLine("Stop", pluginPath, "stop"));
    lines.push(actionLine("Restart", pluginPath, "restart"));
    if (snapshot.latestTranscript) {
        lines.push(actionLine("Open transcript folder", pluginPath, "open-transcripts"));
    }
    lines.push("Refresh | refresh=true");
    return lines.join("\n");
}
export function renderSwiftBarUnavailable(reason) {
    return [
        "AT stale | color=orange",
        "---",
        `Status unavailable: ${safeValue(reason)}`,
        "Refresh | refresh=true"
    ].join("\n");
}
function menuBarLabel(snapshot) {
    if (snapshot.statusFreshness !== "fresh") {
        return "AT stale | color=orange";
    }
    if (snapshot.service.state === "error" || snapshot.activity === "failed") {
        return "AT error | color=red";
    }
    if (snapshot.service.state === "stopped") {
        return "AT idle | color=gray";
    }
    if (snapshot.service.state === "starting" ||
        snapshot.service.state === "stopping" ||
        (snapshot.activity !== null && ACTIVE_STATES.has(snapshot.activity))) {
        return "AT working | color=green";
    }
    return "AT idle | color=gray";
}
function actionLine(label, pluginPath, action) {
    return `${label} | bash=${swiftBarQuoted(pluginPath)} param1=action param2=${action} terminal=false refresh=true`;
}
function swiftBarQuoted(value) {
    return `'${value.replace(/'/g, "\\'")}'`;
}
function safeValue(value) {
    if (value === null) {
        return "-";
    }
    return String(value).replace(/[\r\n|]/g, " ");
}
