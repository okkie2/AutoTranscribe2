#!/usr/bin/env node
import path from "node:path";
import chalk from "chalk";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { getDefaultStatusPath, readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { formatDashboardLines } from "./StatusDashboard.js";
const REFRESH_INTERVAL_MS = 500;
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
function renderDashboard(statusPath) {
    const status = readStatus(statusPath);
    const { lines, statusFreshness } = formatDashboardLines(status, statusPath);
    const color = colorizeFreshness(statusFreshness);
    // Clear and redraw in place
    console.clear();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("Freshness: ")) {
            const value = line.replace(/^Freshness:\s*/, "");
            console.log("Freshness: " + color(value));
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
