import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { getCompactStatusSnapshot, openLatestTranscript, reconcileManagedWatcherStack, restartWatcherControl, startWatcherControl, stopWatcherControl } from "../application/WatcherControl.js";
function canStartWatcher(config) {
    const reconciliation = reconcileManagedWatcherStack(config);
    const allowed = ["stopped", "staleLock"].includes(reconciliation.reconciledProcessState);
    traceEvent({
        event: "transition_guard_evaluated",
        source: "cli:menu",
        command: "Start Watcher",
        observed_state: getCompactStatusSnapshot(config),
        metadata: {
            guard: "menu_start_allowed",
            evaluated_value: allowed,
            source_of_truth: "reconciled_process_state"
        }
    });
    return allowed;
}
function canStopWatcher(config) {
    const reconciliation = reconcileManagedWatcherStack(config);
    const allowed = reconciliation.reconciledProcessState !== "stopped";
    traceEvent({
        event: "transition_guard_evaluated",
        source: "cli:menu",
        command: "Stop Watcher",
        observed_state: getCompactStatusSnapshot(config),
        metadata: {
            guard: "menu_stop_allowed",
            evaluated_value: allowed,
            source_of_truth: "reconciled_process_state"
        }
    });
    return allowed;
}
function canRestartWatcher(config) {
    const reconciliation = reconcileManagedWatcherStack(config);
    const allowed = reconciliation.reconciledProcessState !== "stopped";
    traceEvent({
        event: "transition_guard_evaluated",
        source: "cli:menu",
        command: "Restart Watcher",
        observed_state: getCompactStatusSnapshot(config),
        metadata: {
            guard: "menu_restart_allowed",
            evaluated_value: allowed,
            source_of_truth: "reconciled_process_state"
        }
    });
    return allowed;
}
async function showWatcherStatusAction({ showLiveWatcherStatus }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Show Watcher Status"
    });
    await showLiveWatcherStatus();
    return { running: true, requiresPause: false };
}
async function startWatcherAction({ config, confirmAction }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Start Watcher"
    });
    if (!canStartWatcher(config)) {
        console.clear();
        console.log("Watcher appears to be running already. Stop it first before starting again.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    if (!(await confirmAction("Start Watcher"))) {
        console.clear();
        console.log("Start Watcher cancelled.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    console.clear();
    await startWatcherControl(config);
    console.log("Start Watcher succeeded.");
    console.log("");
    return { running: true, requiresPause: true };
}
async function stopWatcherAction({ config, confirmAction }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Stop Watcher"
    });
    if (!canStopWatcher(config)) {
        console.clear();
        console.log("Watcher is already stopped. Nothing to stop.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    if (!(await confirmAction("Stop Watcher"))) {
        console.clear();
        console.log("Stop Watcher cancelled.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    console.clear();
    await stopWatcherControl(config);
    console.log("Stop Watcher succeeded.");
    console.log("");
    return { running: true, requiresPause: true };
}
async function restartWatcherAction({ config, confirmAction }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Restart Watcher"
    });
    if (!canRestartWatcher(config)) {
        console.clear();
        console.log("Watcher is already stopped. Nothing to restart.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    if (!(await confirmAction("Restart Watcher"))) {
        console.clear();
        console.log("Restart Watcher cancelled.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    console.clear();
    await restartWatcherControl(config);
    console.log("Restart Watcher succeeded.");
    console.log("");
    return { running: true, requiresPause: true };
}
async function showRecentJobsAction({ renderRecentJobs }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Show Recent TranscriptionJobs"
    });
    renderRecentJobs();
    return { running: true, requiresPause: true };
}
async function openLatestTranscriptAction({ config }) {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Open Latest Transcript"
    });
    console.clear();
    const latestTranscript = openLatestTranscript(config);
    console.log(`Opened LatestTranscript: ${latestTranscript.transcriptPath}`);
    console.log("");
    return { running: true, requiresPause: true };
}
async function exitAction() {
    traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Exit"
    });
    return { running: false, requiresPause: false };
}
export const MENU_ACTIONS = {
    "1": showWatcherStatusAction,
    "Show Watcher Status": showWatcherStatusAction,
    "2": startWatcherAction,
    "Start Watcher": startWatcherAction,
    "3": stopWatcherAction,
    "Stop Watcher": stopWatcherAction,
    "4": restartWatcherAction,
    "Restart Watcher": restartWatcherAction,
    "5": showRecentJobsAction,
    "Show Recent TranscriptionJobs": showRecentJobsAction,
    "6": openLatestTranscriptAction,
    "Open Latest Transcript": openLatestTranscriptAction,
    "7": exitAction,
    Exit: exitAction
};
