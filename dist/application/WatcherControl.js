import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { buildCompactStatusSnapshot, formatCompactStatusSnapshotLines, formatDashboardLines } from "./StatusSnapshot.js";
const PID_FILE = ".autotranscribe2-pids.json";
const STOP_TIMEOUT_MS = 10000;
const STOP_POLL_INTERVAL_MS = 250;
const RECENT_JOB_LIMIT = 5;
function getPidFilePath() {
    return path.resolve(PID_FILE);
}
function readPidFile() {
    const pidFilePath = getPidFilePath();
    if (!fs.existsSync(pidFilePath))
        return null;
    try {
        const raw = fs.readFileSync(pidFilePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function writePidFile(pids) {
    fs.writeFileSync(getPidFilePath(), JSON.stringify(pids, null, 2), { encoding: "utf8" });
}
function removePidFile() {
    try {
        fs.unlinkSync(getPidFilePath());
    }
    catch {
        // ignore
    }
}
function isPidRunning(pid) {
    if (!pid)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function ensureOllamaRunning(config) {
    const title = config.title;
    if (!title.enabled || title.provider !== "ollama" || !title.ollama) {
        console.log("[WatcherControl] Title provider is not Ollama; skipping Ollama check.");
        return;
    }
    const endpoint = title.ollama.endpoint;
    console.log(`[WatcherControl] Checking Ollama service at ${endpoint}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: title.ollama.model,
                prompt: "healthcheck",
                stream: false,
                options: { temperature: 0 }
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
            console.log("[WatcherControl] Ollama is reachable.");
            return;
        }
        attemptStartOllama();
    }
    catch {
        clearTimeout(timeout);
        attemptStartOllama();
    }
}
function attemptStartOllama() {
    console.log("[WatcherControl] Ollama not reachable; attempting to start via 'brew services start ollama'...");
    try {
        const result = spawnSync("brew", ["services", "start", "ollama"], {
            stdio: "inherit"
        });
        if (result.error) {
            console.error("[WatcherControl] Failed to start Ollama via brew:", result.error.message);
        }
        else {
            console.log("[WatcherControl] Brew command executed. Ollama may take a moment to become ready.");
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[WatcherControl] Error while trying to start Ollama via brew:", message);
    }
}
export async function startWatcherControl(config) {
    console.log("[WatcherControl] Starting AutoTranscribe2 watcher control (Ollama + ingest:jpr + watcher)...");
    await ensureOllamaRunning(config);
    const ingest = spawn(process.execPath, ["dist/cli/ingestJustPressRecord.js"], {
        stdio: "ignore",
        cwd: process.cwd(),
        detached: true
    });
    ingest.unref();
    const watch = spawn(process.execPath, ["dist/cli/index.js", "watch"], {
        stdio: "ignore",
        cwd: process.cwd(),
        detached: true
    });
    watch.unref();
    console.log("[WatcherControl] Started ingest:jpr (PID:", ingest.pid, "), watcher (PID:", watch.pid, ").");
    if (ingest.pid && watch.pid) {
        writePidFile({ ingestPid: ingest.pid, watchPid: watch.pid });
    }
}
export async function stopWatcherControl() {
    console.log("[WatcherControl] Stopping AutoTranscribe2 watcher control...");
    const pids = readPidFile();
    if (!pids) {
        console.log("[WatcherControl] No PID file found; nothing to stop.");
        return;
    }
    const { ingestPid, watchPid } = pids;
    if (ingestPid) {
        try {
            process.kill(ingestPid, "SIGINT");
            console.log("[WatcherControl] Sent SIGINT to ingest:jpr (PID:", ingestPid, ").");
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[WatcherControl] Failed to signal ingest:jpr:", message);
        }
    }
    if (watchPid) {
        try {
            process.kill(watchPid, "SIGINT");
            console.log("[WatcherControl] Sent SIGINT to watcher (PID:", watchPid, ").");
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[WatcherControl] Failed to signal watcher:", message);
        }
    }
    removePidFile();
}
export async function restartWatcherControl(config) {
    const pidsBeforeStop = readPidFile();
    await stopWatcherControl();
    const watchPid = pidsBeforeStop?.watchPid;
    const ingestPid = pidsBeforeStop?.ingestPid;
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while ((isPidRunning(watchPid) || isPidRunning(ingestPid)) && Date.now() < deadline) {
        await delay(STOP_POLL_INTERVAL_MS);
    }
    if (isPidRunning(watchPid) || isPidRunning(ingestPid)) {
        throw new Error("WatcherControl did not stop cleanly before restart.");
    }
    await startWatcherControl(config);
}
export function getStatusSnapshot(config) {
    const status = readStatus(config.runtimeStatusPath);
    const pids = readPidFile();
    const watcherProcessState = isPidRunning(pids?.watchPid) ? "running" : "stopped";
    const dashboard = formatDashboardLines(status, config.runtimeStatusPath);
    const lines = [
        "AutoTranscribe2 WatcherControl",
        "",
        `Watcher process: ${watcherProcessState}`,
        ...dashboard.lines.filter((line) => line !== "AutoTranscribe2 status" && line !== "Press Ctrl+C to exit.")
    ];
    return {
        watcherProcessState,
        runtimeActivityState: status?.runtimeActivityState ?? null,
        statusFreshness: dashboard.statusFreshness,
        lines
    };
}
export function getCompactStatusSnapshot(config) {
    const status = readStatus(config.runtimeStatusPath);
    const latestTranscript = getLatestTranscript(config);
    const pids = readPidFile();
    const watcherProcessState = isPidRunning(pids?.watchPid) ? "running" : "stopped";
    return buildCompactStatusSnapshot(watcherProcessState, status, latestTranscript);
}
export function getCompactStatusSnapshotLines(config) {
    return formatCompactStatusSnapshotLines(getCompactStatusSnapshot(config));
}
function parseLogMeta(line) {
    const jsonStart = line.indexOf("{");
    if (jsonStart === -1)
        return null;
    try {
        return JSON.parse(line.slice(jsonStart));
    }
    catch {
        return null;
    }
}
export function listRecentTranscriptionJobs(config, limit = RECENT_JOB_LIMIT) {
    const logFilePath = path.resolve(config.logging.logFile);
    if (!fs.existsSync(logFilePath))
        return [];
    const lines = fs.readFileSync(logFilePath, "utf8").split(/\r?\n/).filter(Boolean);
    const jobs = [];
    for (let i = lines.length - 1; i >= 0 && jobs.length < limit; i -= 1) {
        const line = lines[i];
        if (!line.includes("Finished transcription job"))
            continue;
        const meta = parseLogMeta(line);
        if (!meta)
            continue;
        jobs.push({
            finishedAt: line.slice(1, 25),
            audioFile: typeof meta.audioFile === "string" ? meta.audioFile : "-",
            transcriptPath: typeof meta.transcriptPath === "string" ? meta.transcriptPath : "-",
            title: typeof meta.title === "string" ? meta.title : null
        });
    }
    return jobs;
}
function findLatestTranscriptInDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath))
        return null;
    let latest = null;
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            const nested = findLatestTranscriptInDirectory(entryPath);
            if (nested && (!latest || nested.updatedAt > latest.updatedAt)) {
                latest = nested;
            }
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md"))
            continue;
        const stat = fs.statSync(entryPath);
        const candidate = {
            transcriptPath: entryPath,
            updatedAt: stat.mtime
        };
        if (!latest || candidate.updatedAt > latest.updatedAt) {
            latest = candidate;
        }
    }
    return latest;
}
export function getLatestTranscript(config) {
    return findLatestTranscriptInDirectory(path.resolve(config.watch.outputDirectory));
}
export function openLatestTranscript(config) {
    const latestTranscript = getLatestTranscript(config);
    if (!latestTranscript) {
        throw new Error("No transcript found in the configured output directory.");
    }
    if (process.platform === "darwin") {
        const result = spawnSync("open", [latestTranscript.transcriptPath], { stdio: "ignore" });
        if (result.error || result.status !== 0) {
            throw new Error(`Failed to open transcript at '${latestTranscript.transcriptPath}'.`);
        }
        return latestTranscript;
    }
    throw new Error(`Open Latest Transcript is only implemented for macOS. Current platform: ${process.platform}`);
}
