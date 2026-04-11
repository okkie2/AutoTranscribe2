import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { getCompactStatusSnapshot, getCompactStatusSnapshotLines, getLatestTranscript, reconcileManagedWatcherStack, startWatcherControl, stopWatcherControl, getStatusSnapshot, listRecentTranscriptionJobs } from "../application/WatcherControl.js";
import { getSupervisorStatePath, readSupervisorState, writeSupervisorState } from "../application/ManagedWatcherSupervisorState.js";
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
    const previousProcessList = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-cwd-"));
    process.chdir(rootDir);
    process.env.AUTOTRANSCRIBE_PROCESS_LIST = "";
    try {
        return await fn(rootDir);
    }
    finally {
        process.chdir(previousCwd);
        if (previousProcessList === undefined) {
            delete process.env.AUTOTRANSCRIBE_PROCESS_LIST;
        }
        else {
            process.env.AUTOTRANSCRIBE_PROCESS_LIST = previousProcessList;
        }
    }
}
function stackLockPath(config) {
    return path.join(path.dirname(config.runtimeStatusPath), "managed-stack.lock.json");
}
function writeStackArtifacts(config, pids) {
    fs.mkdirSync(path.dirname(config.runtimeStatusPath), { recursive: true });
    fs.writeFileSync(stackLockPath(config), JSON.stringify({
        watchPid: pids.watchPid ?? null,
        ingestPid: pids.ingestPid ?? null,
        createdAt: new Date().toISOString(),
        cwd: process.cwd(),
        runtimeRoot: path.dirname(config.runtimeStatusPath),
        hostname: "test-host",
        lockVersion: 1
    }, null, 2), "utf8");
    fs.writeFileSync(path.resolve(".autotranscribe2-pids.json"), JSON.stringify({
        watchPid: pids.watchPid ?? undefined,
        ingestPid: pids.ingestPid ?? undefined
    }, null, 2), "utf8");
}
test("listRecentTranscriptionJobs reads finished jobs from the log file", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-jobs-"));
    const config = createTestConfig(rootDir);
    fs.mkdirSync(path.dirname(config.logging.logFile), { recursive: true });
    fs.writeFileSync(config.logging.logFile, [
        "[2026-03-16T10:00:00.000Z] [INFO] Finished transcription job {\"audioFile\":\"/tmp/a.m4a\",\"transcriptPath\":\"/tmp/a.md\",\"title\":\"Alpha\"}",
        "[2026-03-16T11:00:00.000Z] [INFO] Finished transcription job {\"audioFile\":\"/tmp/b.m4a\",\"transcriptPath\":\"/tmp/b.md\",\"title\":\"Beta\"}"
    ].join("\n"), "utf8");
    const jobs = listRecentTranscriptionJobs(config);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]?.title, "Beta");
    assert.equal(jobs[0]?.transcriptPath, "/tmp/b.md");
    assert.equal(jobs[1]?.audioFile, "/tmp/a.m4a");
});
test("getLatestTranscript returns the newest markdown transcript", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-latest-"));
    const config = createTestConfig(rootDir);
    const transcriptDir = path.resolve(config.watch.outputDirectory);
    const nestedDir = path.join(transcriptDir, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });
    const olderPath = path.join(transcriptDir, "older.md");
    const newerPath = path.join(nestedDir, "newer.md");
    fs.writeFileSync(olderPath, "# older\n", "utf8");
    fs.writeFileSync(newerPath, "# newer\n", "utf8");
    fs.utimesSync(olderPath, new Date("2026-03-16T10:00:00.000Z"), new Date("2026-03-16T10:00:00.000Z"));
    fs.utimesSync(newerPath, new Date("2026-03-16T11:00:00.000Z"), new Date("2026-03-16T11:00:00.000Z"));
    const latestTranscript = getLatestTranscript(config);
    assert.ok(latestTranscript);
    assert.equal(latestTranscript?.transcriptPath, newerPath);
});
test("getStatusSnapshot includes watcher process state and dashboard lines", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(config.runtimeStatusPath), { recursive: true });
        fs.mkdirSync(path.resolve(config.watch.outputDirectory), { recursive: true });
        fs.writeFileSync(path.join(path.resolve(config.watch.outputDirectory), "latest.md"), "# latest\n", "utf8");
        fs.writeFileSync(config.runtimeStatusPath, JSON.stringify({
            runtimeActivityState: "idle",
            queueLength: 0,
            currentFile: null,
            lastError: null,
            updatedAt: new Date().toISOString()
        }), "utf8");
        const snapshot = getStatusSnapshot(config);
        assert.equal(snapshot.watcherProcessState, "stopped");
        assert.ok(snapshot.lines.some((line) => line.includes("Watcher process: stopped")));
        assert.equal(snapshot.latestTranscript, "latest.md");
        assert.ok(snapshot.lines.some((line) => line.includes("Latest transcript: latest.md")));
        assert.equal(snapshot.runtimeActivityState, "idle");
        assert.equal(snapshot.statusFreshness, "fresh");
        assert.ok(snapshot.lines.some((line) => line.includes("Activity: idle")));
    });
});
test("getCompactStatusSnapshot includes watcher process state, queue, and latest transcript", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(config.runtimeStatusPath), { recursive: true });
        fs.mkdirSync(path.resolve(config.watch.outputDirectory), { recursive: true });
        fs.writeFileSync(config.runtimeStatusPath, JSON.stringify({
            runtimeActivityState: "idle",
            queueLength: 3,
            currentFile: null,
            lastError: null,
            updatedAt: new Date().toISOString()
        }), "utf8");
        fs.writeFileSync(path.join(path.resolve(config.watch.outputDirectory), "latest.md"), "# latest\n", "utf8");
        const snapshot = getCompactStatusSnapshot(config);
        const lines = getCompactStatusSnapshotLines(config);
        assert.equal(snapshot.watcherProcessState, "stopped");
        assert.equal(snapshot.runtimeActivityState, "idle");
        assert.equal(snapshot.statusFreshness, "fresh");
        assert.equal(lines[0], "AutoTranscribe2");
        assert.ok(lines.some((line) => line.includes("Watcher: STOPPED")));
        assert.ok(lines.some((line) => line.includes("Activity: idle")));
        assert.ok(lines.some((line) => line.includes("Freshness: fresh")));
        assert.ok(lines.some((line) => line.includes("Queue: 3 jobs")));
        assert.ok(lines.some((line) => line.includes("Latest Transcript: latest.md")));
    });
});
test("reconcileManagedWatcherStack returns running when both managed processes are alive", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        writeStackArtifacts(config, { watchPid: process.pid, ingestPid: process.pid });
        const reconciliation = reconcileManagedWatcherStack(config);
        assert.equal(reconciliation.reconciledProcessState, "running");
        assert.equal(reconciliation.watcherProcessState, "running");
    });
});
test("reconcileManagedWatcherStack returns partial when only one managed process is alive", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        writeStackArtifacts(config, { watchPid: process.pid, ingestPid: 999999 });
        const reconciliation = reconcileManagedWatcherStack(config);
        assert.equal(reconciliation.reconciledProcessState, "partial");
        assert.equal(reconciliation.watcherProcessState, "error");
    });
});
test("reconcileManagedWatcherStack returns staleLock when artifacts remain but processes are gone", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        writeStackArtifacts(config, { watchPid: 999998, ingestPid: 999999 });
        const reconciliation = reconcileManagedWatcherStack(config);
        assert.equal(reconciliation.reconciledProcessState, "staleLock");
        assert.equal(reconciliation.watcherProcessState, "stopped");
    });
});
test("reconcileManagedWatcherStack treats a rebooted running supervisor as stale state", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(getSupervisorStatePath(config)), { recursive: true });
        writeSupervisorState(config, {
            desiredState: "running",
            watcherProcessState: "running",
            watchPid: 999998,
            ingestPid: 999999,
            detail: "Managed watcher stack is running."
        });
        const reconciliation = reconcileManagedWatcherStack(config);
        assert.equal(reconciliation.reconciledProcessState, "staleLock");
        assert.equal(reconciliation.watcherProcessState, "stopped");
    });
});
test("startWatcherControl refuses duplicate start when the managed stack is already running", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        writeStackArtifacts(config, { watchPid: process.pid, ingestPid: process.pid });
        await assert.rejects(() => startWatcherControl(config), /Managed watcher stack is already running/);
    });
});
test("stopWatcherControl cleans stale stack artifacts when no managed processes are alive", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        writeStackArtifacts(config, { watchPid: 999998, ingestPid: 999999 });
        await stopWatcherControl(config);
        assert.equal(fs.existsSync(stackLockPath(config)), false);
        assert.equal(fs.existsSync(path.resolve(".autotranscribe2-pids.json")), false);
    });
});
test("startWatcherControl writes authoritative supervisor state for status even without stack artifacts", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        const previousTestMode = process.env.AUTOTRANSCRIBE_TEST_MODE;
        process.env.AUTOTRANSCRIBE_TEST_MODE = "1";
        try {
            await startWatcherControl(config);
            fs.unlinkSync(stackLockPath(config));
            fs.unlinkSync(path.resolve(".autotranscribe2-pids.json"));
            const supervisorState = readSupervisorState(config);
            const snapshot = getStatusSnapshot(config);
            assert.ok(supervisorState);
            assert.equal(supervisorState?.watcherProcessState, "running");
            assert.equal(snapshot.watcherProcessState, "running");
            assert.ok(snapshot.lines.some((line) => line.includes("Watcher process: running")));
        }
        finally {
            if (previousTestMode === undefined) {
                delete process.env.AUTOTRANSCRIBE_TEST_MODE;
            }
            else {
                process.env.AUTOTRANSCRIBE_TEST_MODE = previousTestMode;
            }
        }
    });
});
test("startWatcherControl recovers from stale running supervisor state after reboot", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(getSupervisorStatePath(config)), { recursive: true });
        writeSupervisorState(config, {
            desiredState: "running",
            watcherProcessState: "running",
            watchPid: 999998,
            ingestPid: 999999,
            detail: "Managed watcher stack is running."
        });
        const previousTestMode = process.env.AUTOTRANSCRIBE_TEST_MODE;
        process.env.AUTOTRANSCRIBE_TEST_MODE = "1";
        try {
            await startWatcherControl(config);
            const supervisorState = readSupervisorState(config);
            assert.ok(supervisorState);
            assert.equal(supervisorState?.watcherProcessState, "running");
            assert.equal(supervisorState?.desiredState, "running");
        }
        finally {
            if (previousTestMode === undefined) {
                delete process.env.AUTOTRANSCRIBE_TEST_MODE;
            }
            else {
                process.env.AUTOTRANSCRIBE_TEST_MODE = previousTestMode;
            }
        }
    });
});
test("stopWatcherControl records stopped supervisor state after shutdown", async () => {
    await withTempCwd(async (rootDir) => {
        const config = createTestConfig(rootDir);
        const previousTestMode = process.env.AUTOTRANSCRIBE_TEST_MODE;
        process.env.AUTOTRANSCRIBE_TEST_MODE = "1";
        try {
            await startWatcherControl(config);
            await stopWatcherControl(config);
            const supervisorState = readSupervisorState(config);
            assert.ok(supervisorState);
            assert.equal(supervisorState?.watcherProcessState, "stopped");
            assert.equal(supervisorState?.desiredState, "stopped");
            assert.equal(fs.existsSync(getSupervisorStatePath(config)), true);
        }
        finally {
            if (previousTestMode === undefined) {
                delete process.env.AUTOTRANSCRIBE_TEST_MODE;
            }
            else {
                process.env.AUTOTRANSCRIBE_TEST_MODE = previousTestMode;
            }
        }
    });
});
test("compact and detailed status use reconciled process state when stack is partial", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        fs.mkdirSync(path.dirname(config.runtimeStatusPath), { recursive: true });
        fs.writeFileSync(config.runtimeStatusPath, JSON.stringify({
            runtimeActivityState: "processingTranscription",
            queueLength: 1,
            currentFile: "/tmp/example.m4a",
            lastError: null,
            updatedAt: new Date().toISOString()
        }), "utf8");
        writeStackArtifacts(config, { watchPid: process.pid, ingestPid: 999999 });
        const compact = getCompactStatusSnapshot(config);
        const detailed = getStatusSnapshot(config);
        assert.equal(compact.watcherProcessState, "error");
        assert.ok(detailed.lines.some((line) => line.includes("Reconciled process state: partial")));
        assert.ok(detailed.lines.some((line) => line.includes("Watcher process: error")));
    });
});
test("reconcileManagedWatcherStack reports error when unmanaged watcher activity exists", () => {
    return withTempCwd((rootDir) => {
        const config = createTestConfig(rootDir);
        const previousProcessList = process.env.AUTOTRANSCRIBE_PROCESS_LIST;
        process.env.AUTOTRANSCRIBE_PROCESS_LIST = [
            `${process.pid} node dist/__tests__/WatcherControl.test.js`,
            "54321 node dist/cli/index.js watch"
        ].join("\n");
        try {
            const reconciliation = reconcileManagedWatcherStack(config);
            assert.equal(reconciliation.reconciledProcessState, "error");
            assert.equal(reconciliation.watcherProcessState, "error");
            assert.equal(reconciliation.unmanagedWatcherDetected, true);
        }
        finally {
            if (previousProcessList === undefined) {
                delete process.env.AUTOTRANSCRIBE_PROCESS_LIST;
            }
            else {
                process.env.AUTOTRANSCRIBE_PROCESS_LIST = previousProcessList;
            }
        }
    });
});
