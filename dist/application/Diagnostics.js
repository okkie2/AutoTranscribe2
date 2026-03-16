import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLatestTraceLogPath, traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { getDiagnosticStateSnapshot } from "./WatcherControl.js";
function sanitizeTimestamp(date) {
    return date.toISOString().replace(/[:]/g, "-");
}
function getDiagnosticBundleRoot() {
    return process.env.AUTOTRANSCRIBE_DIAGNOSTIC_BUNDLE_DIR ||
        path.join(os.homedir(), "Library", "Logs", "AutoTranscribe2");
}
export function exportDiagnosticBundle(config) {
    const bundlePath = path.join(getDiagnosticBundleRoot(), `diagnostic-bundle-${sanitizeTimestamp(new Date())}`);
    fs.mkdirSync(bundlePath, { recursive: true });
    const latestTraceLogPath = getLatestTraceLogPath();
    const configPath = path.resolve("config.yaml");
    const snapshotPath = path.join(bundlePath, "latest-state-snapshot.json");
    const bundledTracePath = path.join(bundlePath, "cli-trace.jsonl");
    const bundledConfigPath = path.join(bundlePath, "config.yaml");
    const tracePath = fs.existsSync(latestTraceLogPath) ? bundledTracePath : null;
    const copiedConfigPath = fs.existsSync(configPath) ? bundledConfigPath : null;
    if (tracePath) {
        fs.copyFileSync(latestTraceLogPath, bundledTracePath);
    }
    if (copiedConfigPath) {
        fs.copyFileSync(configPath, bundledConfigPath);
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(getDiagnosticStateSnapshot(config), null, 2), "utf8");
    traceEvent({
        event: "state_observed",
        source: "diagnostics",
        command: "diagnostics",
        observed_state: getDiagnosticStateSnapshot(config),
        metadata: { bundlePath }
    });
    return {
        bundlePath,
        tracePath,
        configPath: copiedConfigPath,
        snapshotPath
    };
}
