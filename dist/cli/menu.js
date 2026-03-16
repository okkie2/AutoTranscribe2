#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getCompactStatusSnapshotLines, getStatusSnapshot, listRecentTranscriptionJobs, openLatestTranscript, restartWatcherControl, startWatcherControl, stopWatcherControl } from "../application/WatcherControl.js";
const MENU_OPTIONS = [
    "Show Watcher Status",
    "Start Watcher",
    "Stop Watcher",
    "Restart Watcher",
    "Show Recent TranscriptionJobs",
    "Open Latest Transcript",
    "Exit"
];
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
function renderRecentJobs(config) {
    const jobs = listRecentTranscriptionJobs(config);
    console.clear();
    console.log("Recent TranscriptionJobs");
    console.log("");
    if (jobs.length === 0) {
        console.log("No recent TranscriptionJobs found.");
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
async function showResultScreen(config, selection) {
    switch (selection) {
        case "1":
        case "Show Watcher Status":
            renderDetailedStatus(config);
            return { running: true, requiresPause: true };
        case "2":
        case "Start Watcher":
            console.clear();
            await startWatcherControl(config);
            return { running: true, requiresPause: true };
        case "3":
        case "Stop Watcher":
            console.clear();
            await stopWatcherControl();
            return { running: true, requiresPause: true };
        case "4":
        case "Restart Watcher":
            console.clear();
            await restartWatcherControl(config);
            return { running: true, requiresPause: true };
        case "5":
        case "Show Recent TranscriptionJobs":
            renderRecentJobs(config);
            return { running: true, requiresPause: true };
        case "6": {
            console.clear();
            const latestTranscript = openLatestTranscript(config);
            console.log(`Opened LatestTranscript: ${latestTranscript.transcriptPath}`);
            console.log("");
            return { running: true, requiresPause: true };
        }
        case "7":
        case "Exit":
            return { running: false, requiresPause: false };
        case "":
        case "r":
        case "R":
            return { running: true, requiresPause: false };
        default:
            console.clear();
            console.log("Unknown selection. Choose 1-7, press Enter to refresh, or type 'r'.");
            console.log("");
            return { running: true, requiresPause: true };
    }
}
export async function runMenu(config) {
    const rl = readline.createInterface({ input, output });
    try {
        let running = true;
        while (running) {
            renderMenu(config);
            const selection = (await rl.question("Select an option: ")).trim();
            const result = await showResultScreen(config, selection);
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
