#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getCompactStatusSnapshot, getStatusSnapshot, listRecentTranscriptionJobs, openLatestTranscript, restartWatcherControl, startWatcherControl, stopWatcherControl } from "../application/WatcherControl.js";
const MENU_OPTIONS = [
    "Show Watcher Status",
    "Start Watcher",
    "Stop Watcher",
    "Restart Watcher",
    "Show Recent TranscriptionJobs",
    "Open Latest Transcript",
    "Exit"
];
const STATUS_REFRESH_INTERVAL_MS = 300;
function printHeader() {
    console.log("");
}
function printMenu() {
    for (let i = 0; i < MENU_OPTIONS.length; i += 1) {
        console.log(`${i + 1}. ${MENU_OPTIONS[i]}`);
    }
    console.log("");
}
function printCompactStatusSnapshot(config) {
    for (const line of getCompactStatusSnapshot(config)) {
        console.log(line);
    }
}
function printStatusSnapshot(config) {
    const snapshot = getStatusSnapshot(config);
    console.log("");
    for (const line of snapshot.lines) {
        console.log(line);
    }
}
function colorizeState(state) {
    switch (state) {
        case "idle":
            return chalk.green;
        case "processing":
            return chalk.yellow;
        case "error":
            return chalk.red;
        case "stale":
        case "none":
            return chalk.dim;
        default:
            return chalk.dim;
    }
}
function renderLiveStatus(config) {
    const snapshot = getStatusSnapshot(config);
    const color = colorizeState(snapshot.effectiveState);
    console.clear();
    for (const line of snapshot.lines) {
        if (line.startsWith("State: ")) {
            console.log(`State: ${color(line.slice("State: ".length))}`);
        }
        else {
            console.log(line);
        }
    }
    console.log("");
    console.log("Press any key to return to the menu.");
}
async function showLiveWatcherStatus(config, rl) {
    if (!input.isTTY) {
        printStatusSnapshot(config);
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
        const onData = () => cleanup();
        const intervalId = setInterval(() => renderLiveStatus(config), STATUS_REFRESH_INTERVAL_MS);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
        renderLiveStatus(config);
    });
    rl.resume();
}
function printRecentJobs(config) {
    const jobs = listRecentTranscriptionJobs(config);
    console.log("");
    console.log("Recent TranscriptionJobs");
    console.log("");
    if (jobs.length === 0) {
        console.log("No recent TranscriptionJobs found.");
        return;
    }
    for (const [index, job] of jobs.entries()) {
        console.log(`${index + 1}. ${job.finishedAt} ${job.title ? `- ${job.title}` : ""}`.trimEnd());
        console.log(`   AudioFile: ${job.audioFile}`);
        console.log(`   Transcript: ${job.transcriptPath}`);
    }
}
async function handleSelection(selection, config, rl) {
    switch (selection) {
        case "1":
        case "Show Watcher Status":
            await showLiveWatcherStatus(config, rl);
            return { running: true, skipPause: true };
        case "2":
        case "Start Watcher":
            await startWatcherControl(config);
            return { running: true };
        case "3":
        case "Stop Watcher":
            await stopWatcherControl();
            return { running: true };
        case "4":
        case "Restart Watcher":
            await restartWatcherControl(config);
            return { running: true };
        case "5":
        case "Show Recent TranscriptionJobs":
            printRecentJobs(config);
            return { running: true };
        case "6":
        case "Open Latest Transcript": {
            const latestTranscript = openLatestTranscript(config);
            console.log(`Opened LatestTranscript: ${latestTranscript.transcriptPath}`);
            return { running: true };
        }
        case "7":
        case "Exit":
            return { running: false, skipPause: true };
        default:
            console.log("Unknown selection. Choose 1-7 or type the exact menu label.");
            return { running: true };
    }
}
export async function runMenu(config) {
    const rl = readline.createInterface({ input, output });
    try {
        let running = true;
        while (running) {
            printHeader();
            printCompactStatusSnapshot(config);
            printMenu();
            const selection = await rl.question("Select an option: ");
            console.log("");
            try {
                const result = await handleSelection(selection.trim(), config, rl);
                running = result.running;
                if (running && !result.skipPause) {
                    await rl.question("\nPress Enter to continue...");
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Menu action failed: ${message}`);
                await rl.question("\nPress Enter to continue...");
            }
        }
    }
    finally {
        rl.close();
    }
}
