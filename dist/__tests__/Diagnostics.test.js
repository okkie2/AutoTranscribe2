import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { exportDiagnosticBundle } from "../application/Diagnostics.js";
import { getLatestTraceLogPath, setTraceSessionIdForTest, traceEvent } from "../infrastructure/tracing/TraceLogger.js";
function createTestConfig(rootDir) {
    return {
        watch: {
            enabled: true,
            directories: [],
            includeExtensions: [".m4a"],
            excludePatterns: [],
            pollingIntervalSeconds: 10,
            outputDirectory: path.join(rootDir, "transcripts"),
            mirrorSourceStructure: true
        },
        backend: {
            type: "mlx_whisper",
            pythonExecutable: "python3",
            scriptPath: "./py-backend/mlx_whisper_backend.py",
            languageHint: null,
            options: { modelSize: "medium" }
        },
        logging: {
            level: "info",
            logFile: path.join(rootDir, "logs", "autotranscribe.log"),
            console: false,
            verboseErrors: false
        },
        title: {
            enabled: false,
            provider: "none",
            maxLength: 80,
            maxWords: 5,
            languageHint: null
        },
        ingest: {
            jprSourceRoot: path.join(rootDir, "jpr"),
            recordingsRoot: path.join(rootDir, "recordings")
        },
        autostart: {
            enabled: false,
            label: "com.example.autotranscribe2"
        },
        runtimeStatusPath: path.join(rootDir, "runtime", "status.json")
    };
}
async function withTempCwd(fn) {
    const previousCwd = process.cwd();
    const previousTraceLogPath = process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH;
    const previousBundleDir = process.env.AUTOTRANSCRIBE_DIAGNOSTIC_BUNDLE_DIR;
    const previousProcessList = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-diagnostics-"));
    process.chdir(rootDir);
    process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH = path.join(rootDir, "cli-trace.jsonl");
    process.env.AUTOTRANSCRIBE_DIAGNOSTIC_BUNDLE_DIR = path.join(rootDir, "diagnostic-bundles");
    process.env.AUTOTRANSCRIBE_PROCESS_LIST = "";
    setTraceSessionIdForTest("test-session");
    try {
        return await fn(rootDir);
    }
    finally {
        process.chdir(previousCwd);
        if (previousTraceLogPath === undefined) {
            delete process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH;
        }
        else {
            process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH = previousTraceLogPath;
        }
        if (previousBundleDir === undefined) {
            delete process.env.AUTOTRANSCRIBE_DIAGNOSTIC_BUNDLE_DIR;
        }
        else {
            process.env.AUTOTRANSCRIBE_DIAGNOSTIC_BUNDLE_DIR = previousBundleDir;
        }
        if (previousProcessList === undefined) {
            delete process.env.AUTOTRANSCRIBE_PROCESS_LIST;
        }
        else {
            process.env.AUTOTRANSCRIBE_PROCESS_LIST = previousProcessList;
        }
    }
}
test("traceEvent writes JSONL entries with stable session and incrementing event index", async () => {
    await withTempCwd(async () => {
        traceEvent({
            event: "command_received",
            source: "test",
            command: "menu"
        });
        traceEvent({
            event: "state_observed",
            source: "test",
            observed_state: { watcherProcessState: "stopped" }
        });
        const lines = fs.readFileSync(getLatestTraceLogPath(), "utf8").trim().split("\n").map((line) => JSON.parse(line));
        assert.equal(lines.length, 2);
        assert.equal(lines[0].session_id, "test-session");
        assert.equal(lines[1].session_id, "test-session");
        assert.equal(lines[0].event_index, 1);
        assert.equal(lines[1].event_index, 2);
        assert.equal(lines[0].event, "command_received");
        assert.equal(lines[1].event, "state_observed");
    });
});
test("exportDiagnosticBundle writes trace, config, and latest state snapshot", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(config.runtimeStatusPath), { recursive: true });
        fs.mkdirSync(path.resolve(config.watch.outputDirectory), { recursive: true });
        fs.writeFileSync("config.yaml", [
            "watch:",
            "  enabled: true",
            "runtimeStatusPath: runtime/status.json"
        ].join("\n"), "utf8");
        fs.writeFileSync(config.runtimeStatusPath, JSON.stringify({
            runtimeActivityState: "idle",
            queueLength: 0,
            currentFile: null,
            lastError: null,
            updatedAt: new Date().toISOString()
        }), "utf8");
        traceEvent({
            event: "command_received",
            source: "test",
            command: "diagnostics"
        });
        const bundle = exportDiagnosticBundle(config);
        assert.equal(fs.existsSync(bundle.bundlePath), true);
        assert.equal(fs.existsSync(bundle.snapshotPath), true);
        assert.equal(fs.existsSync(path.join(bundle.bundlePath, "config.yaml")), true);
        assert.equal(fs.existsSync(path.join(bundle.bundlePath, "cli-trace.jsonl")), true);
        const snapshot = JSON.parse(fs.readFileSync(bundle.snapshotPath, "utf8"));
        assert.equal(snapshot.watcherProcessState, "stopped");
        assert.equal(snapshot.runtimeActivityState, "idle");
    });
});
