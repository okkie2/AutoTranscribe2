#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { extractFirstAllowedKey } from "./menuInput.js";
import { getCompactStatusSnapshotLines, getStatusSnapshot, listRecentTranscriptionJobs } from "../application/WatcherControl.js";
import { MENU_ACTIONS } from "./menuActions.js";
const MENU_OPTIONS = [
    "Show Watcher Status",
    "Start Watcher",
    "Stop Watcher",
    "Restart Watcher",
    "Show Recent Transcription Jobs",
    "Open Latest Transcript",
    "Exit"
];
const STATUS_REFRESH_INTERVAL_MS = 300;
function renderMenu(config) {
    console.clear();
    for (const line of getCompactStatusSnapshotLines(config)) {
        console.log(line);
    }
    for (let i = 0; i < MENU_OPTIONS.length; i += 1) {
        console.log(`${i + 1}. ${MENU_OPTIONS[i]}`);
    }
    console.log("");
    console.log("Press Enter to refresh. Type 'r' to refresh. Type 1-7 to choose an action.");
    console.log("");
}
function renderDetailedStatus(config) {
    const snapshot = getStatusSnapshot(config);
    console.clear();
    for (const line of snapshot.lines) {
        console.log(line);
    }
    console.log("");
}
function colorizeFreshness(statusFreshness) {
    switch (statusFreshness) {
        case "fresh":
            return chalk.green;
        case "stale":
            return chalk.dim;
        case "missing":
            return chalk.red;
        default:
            return chalk.dim;
    }
}
function colorizeWatcherProcessState(watcherProcessState) {
    switch (watcherProcessState) {
        case "running":
            return chalk.green;
        case "starting":
        case "stopping":
            return chalk.yellow;
        case "error":
            return chalk.red;
        case "stopped":
        default:
            return chalk.dim;
    }
}
function colorizeActivity(activity) {
    switch (activity) {
        case "idle":
        case "completed":
            return chalk.green;
        case "failed":
            return chalk.red;
        case "scanning":
        case "waitingForStableFile":
        case "ingesting":
        case "enqueuingJob":
        case "draining":
        case "processingTranscription":
        case "writingTranscript":
            return chalk.yellow;
        default:
            return chalk.dim;
    }
}
function renderLiveDetailedStatus(config) {
    const snapshot = getStatusSnapshot(config);
    const color = colorizeFreshness(snapshot.statusFreshness);
    const watcherProcessColor = colorizeWatcherProcessState(snapshot.watcherProcessState);
    const activityColor = colorizeActivity(snapshot.runtimeActivityState);
    const nowLabel = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    console.clear();
    console.log(`Current time: ${nowLabel}`);
    console.log("");
    for (const line of snapshot.lines) {
        if (line.startsWith("Watcher process: ")) {
            const value = line.replace(/^Watcher process:\s*/, "");
            console.log("Watcher process: " + watcherProcessColor(value));
        }
        else if (line.startsWith("Activity: ")) {
            const value = line.replace(/^Activity:\s*/, "");
            console.log("Activity: " + activityColor(value));
        }
        else if (line.startsWith("Freshness: ")) {
            const value = line.replace(/^Freshness:\s*/, "");
            console.log("Freshness: " + color(value));
        }
        else {
            console.log(line);
        }
    }
    console.log("");
    console.log("Press Enter to return to menu");
}
async function showLiveWatcherStatus(config, rl) {
    if (!input.isTTY) {
        renderDetailedStatus(config);
        return;
    }
    rl.pause();
    await new Promise((resolve) => {
        const cleanup = () => {
            clearInterval(intervalId);
            input.off("data", onData);
            input.setRawMode(false);
            console.clear();
            resolve();
        };
        const onData = (chunk) => {
            const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            if (text === "\r" || text === "\n") {
                cleanup();
            }
        };
        const intervalId = setInterval(() => renderLiveDetailedStatus(config), STATUS_REFRESH_INTERVAL_MS);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
        renderLiveDetailedStatus(config);
    });
    rl.resume();
}
async function readMenuSelection(rl) {
    if (!input.isTTY) {
        return (await rl.question("Select an option: ")).trim();
    }
    const allowedKeys = ["1", "2", "3", "4", "5", "6", "7", "r", "R"];
    output.write("Select an option: ");
    rl.pause();
    const selection = await new Promise((resolve) => {
        const cleanup = (value) => {
            input.off("data", onData);
            input.setRawMode(false);
            output.write("\n");
            resolve(value);
        };
        const onData = (chunk) => {
            const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            if (text === "\u0003") {
                input.setRawMode(false);
                process.exit(130);
            }
            if (text === "\r" || text === "\n") {
                cleanup("");
                return;
            }
            const key = extractFirstAllowedKey(text, allowedKeys);
            if (key) {
                cleanup(key);
            }
        };
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
    rl.resume();
    return selection;
}
function renderRecentJobs(config) {
    const jobs = listRecentTranscriptionJobs(config);
    console.clear();
    console.log("Recent Transcription Jobs");
    console.log("");
    if (jobs.length === 0) {
        console.log("No recent Transcription Jobs found.");
        console.log("");
        return;
    }
    for (const [index, job] of jobs.entries()) {
        console.log(`${index + 1}. ${job.finishedAt}${job.title ? ` - ${job.title}` : ""}`);
        console.log(`AudioFile: ${job.audioFile}`);
        console.log(`Transcript: ${job.transcriptPath}`);
        console.log("");
    }
}
async function showResultScreen(config, selection, rl) {
    if (selection !== "") {
        traceEvent({
            event: "command_received",
            source: "cli:menu",
            command: selection
        });
    }
    if (selection === "" || selection === "r" || selection === "R") {
        return { running: true, requiresPause: false };
    }
    const actionHandler = MENU_ACTIONS[selection];
    if (!actionHandler) {
        traceEvent({
            event: "command_rejected",
            source: "cli:menu",
            command: selection
        });
        console.clear();
        console.log("Unknown selection. Choose 1-7, press Enter to refresh, or type 'r'.");
        console.log("");
        return { running: true, requiresPause: true };
    }
    return actionHandler({
        config,
        rl,
        showLiveWatcherStatus: () => showLiveWatcherStatus(config, rl),
        renderRecentJobs: () => renderRecentJobs(config),
        confirmAction: (actionLabel) => confirmAction(rl, actionLabel)
    });
}
async function confirmAction(rl, actionLabel) {
    if (!input.isTTY) {
        while (true) {
            const answer = (await rl.question(`Are you sure you want to ${actionLabel.toLowerCase()}? (y/n): `)).trim();
            if (answer === "y" || answer === "Y")
                return true;
            if (answer === "n" || answer === "N")
                return false;
        }
    }
    output.write(`Are you sure you want to ${actionLabel.toLowerCase()}? (y/n): `);
    rl.pause();
    const confirmed = await new Promise((resolve) => {
        const allowedKeys = ["y", "Y", "n", "N"];
        const cleanup = (value) => {
            input.off("data", onData);
            input.setRawMode(false);
            output.write("\n");
            resolve(value);
        };
        const onData = (chunk) => {
            const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            if (text === "\u0003") {
                input.setRawMode(false);
                process.exit(130);
            }
            if (text === "\r" || text === "\n") {
                return;
            }
            const key = extractFirstAllowedKey(text, allowedKeys);
            if (!key) {
                return;
            }
            if (key === "y" || key === "Y") {
                cleanup(true);
                return;
            }
            if (key === "n" || key === "N") {
                cleanup(false);
            }
        };
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
    rl.resume();
    return confirmed;
}
export async function runMenu(config) {
    const rl = readline.createInterface({ input, output });
    try {
        let running = true;
        while (running) {
            renderMenu(config);
            const selection = await readMenuSelection(rl);
            const result = await showResultScreen(config, selection, rl);
            running = result.running;
            if (running && result.requiresPause) {
                await rl.question("Press Enter to return to menu");
            }
        }
    }
    finally {
        rl.close();
    }
}
