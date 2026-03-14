#!/usr/bin/env node
import path from "node:path";
import chalk from "chalk";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { getDefaultStatusPath, readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { formatDashboardLines } from "./StatusDashboard.js";
const REFRESH_INTERVAL_MS = 500;
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
function renderDashboard(statusPath) {
    const status = readStatus(statusPath);
    const { lines, effectiveState } = formatDashboardLines(status, statusPath);
    const color = colorizeState(effectiveState);
    // Clear and redraw in place
    console.clear();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 2 && line.startsWith("State:")) {
            const value = line.replace(/^State:\s*/, "");
            console.log("State: " + color(value));
        }
        else {
            console.log(line);
        }
    }
}
function main() {
    let statusPath;
    try {
        const config = loadConfig(path.join(process.cwd(), "config.yaml"));
        statusPath = config.runtimeStatusPath;
    }
    catch {
        statusPath = getDefaultStatusPath();
    }
    const run = () => renderDashboard(statusPath);
    run();
    const intervalId = setInterval(run, REFRESH_INTERVAL_MS);
    const cleanup = () => {
        clearInterval(intervalId);
        console.clear();
        console.log("AutoTranscribe2 status (stopped).");
        process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
}
main();
