import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";
import {
  getCompactStatusSnapshot,
  getCompactStatusSnapshotLines,
  getLatestTranscript,
  getStatusSnapshot,
  listRecentTranscriptionJobs
} from "../application/WatcherControl.js";

function createTestConfig(rootDir: string): AppConfig {
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

async function withTempCwd<T>(fn: (rootDir: string) => T | Promise<T>): Promise<T> {
  const previousCwd = process.cwd();
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-cwd-"));
  process.chdir(rootDir);
  try {
    return await fn(rootDir);
  } finally {
    process.chdir(previousCwd);
  }
}

test("listRecentTranscriptionJobs reads finished jobs from the log file", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-jobs-"));
  const config = createTestConfig(rootDir);

  fs.mkdirSync(path.dirname(config.logging.logFile), { recursive: true });
  fs.writeFileSync(
    config.logging.logFile,
    [
      "[2026-03-16T10:00:00.000Z] [INFO] Finished transcription job {\"audioFile\":\"/tmp/a.m4a\",\"transcriptPath\":\"/tmp/a.md\",\"title\":\"Alpha\"}",
      "[2026-03-16T11:00:00.000Z] [INFO] Finished transcription job {\"audioFile\":\"/tmp/b.m4a\",\"transcriptPath\":\"/tmp/b.md\",\"title\":\"Beta\"}"
    ].join("\n"),
    "utf8"
  );

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
    fs.writeFileSync(
      config.runtimeStatusPath,
      JSON.stringify({
        runtimeActivityState: "idle",
        queueLength: 0,
        currentFile: null,
        lastError: null,
        updatedAt: new Date().toISOString()
      }),
      "utf8"
    );

    const snapshot = getStatusSnapshot(config);

    assert.equal(snapshot.watcherProcessState, "stopped");
    assert.ok(snapshot.lines.some((line) => line.includes("Watcher process: stopped")));
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
    fs.writeFileSync(
      config.runtimeStatusPath,
      JSON.stringify({
        runtimeActivityState: "idle",
        queueLength: 3,
        currentFile: null,
        lastError: null,
        updatedAt: new Date().toISOString()
      }),
      "utf8"
    );
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
    assert.ok(lines.some((line) => line.includes("LatestTranscript: latest.md")));
  });
});
