import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { createStatusUpdater } from "../infrastructure/status/RuntimeStatus.js";
const POLL_INTERVAL_MS = 3000;
function isHidden(p) {
    return path.basename(p).startsWith(".");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// Wait for file size to stabilize before copying to avoid partial writes.
async function waitForStableFile(filePath, attempts = 60, intervalMs = 1000) {
    let lastSize = -1;
    for (let i = 0; i < attempts; i++) {
        try {
            const { size } = fs.statSync(filePath);
            const attemptStr = `${i + 1}/${attempts}`;
            if (size > 0 && size === lastSize) {
                console.log(`File stabilized after ${attemptStr} checks (${size} bytes):`, filePath);
                return;
            }
            if (i === 0 || size !== lastSize || (i + 1) % 10 === 0) {
                const change = size !== lastSize ? "size changed" : "waiting";
                console.log(`Waiting for stable file (${attemptStr}, ${change}, size=${size}):`, filePath);
            }
            lastSize = size;
        }
        catch (err) {
            throw new Error(`File not accessible: ${filePath}`);
        }
        await sleep(intervalMs);
    }
    throw new Error(`File did not stabilize after ${attempts} attempts: ${filePath}`);
}
function maybeRemoveEmptyParent(dateDir, sourceRoot) {
    if (!dateDir || dateDir === sourceRoot)
        return;
    try {
        const entries = fs.readdirSync(dateDir).filter((f) => !isHidden(f));
        if (entries.length === 0) {
            fs.rmdirSync(dateDir);
            console.log("Removed empty folder:", dateDir);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log("Could not remove folder:", dateDir, message);
    }
}
function listAudioFiles(root) {
    if (!fs.existsSync(root)) {
        return [];
    }
    const files = [];
    const stack = [root];
    while (stack.length > 0) {
        const currentDir = stack.pop();
        if (!currentDir) {
            continue;
        }
        let entries = [];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Could not read source directory:", currentDir, message);
            continue;
        }
        for (const entry of entries) {
            if (isHidden(entry.name)) {
                continue;
            }
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (path.extname(entry.name).toLowerCase() === ".m4a") {
                files.push(fullPath);
            }
        }
    }
    return files.sort();
}
async function handleFile(filePath, sourceRoot, destRoot, inFlight, statusUpdater) {
    if (isHidden(filePath))
        return;
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".m4a") {
        return;
    }
    const resolvedPath = path.resolve(filePath);
    if (inFlight.has(resolvedPath)) {
        return;
    }
    inFlight.add(resolvedPath);
    const dateFolder = path.basename(path.dirname(filePath));
    const baseName = path.basename(filePath);
    const destName = `${dateFolder}_${baseName}`;
    const destPath = path.join(destRoot, destName);
    const tempPath = path.join(destRoot, `.tmp_${process.pid}_${destName}`);
    console.log("New JPR recording detected:", filePath);
    try {
        statusUpdater({
            runtimeActivityState: "waitingForStableFile",
            currentFile: path.basename(filePath),
            currentPhaseDetail: "stable file check",
            lastError: null
        });
        await waitForStableFile(filePath);
        const srcStat = fs.statSync(filePath);
        console.log("Source ready, size:", srcStat.size, "path:", filePath);
        statusUpdater({
            runtimeActivityState: "ingesting",
            currentFile: path.basename(filePath),
            currentPhaseDetail: "copying recording",
            lastError: null
        });
        fs.copyFileSync(filePath, tempPath);
        const destStat = fs.statSync(tempPath);
        console.log("Copy complete, temp size:", destStat.size, "temp path:", tempPath);
        if (destStat.size !== srcStat.size) {
            console.warn("Size mismatch after copy, keeping source. src:", srcStat.size, "dest:", destStat.size);
            try {
                fs.unlinkSync(tempPath);
            }
            catch {
                // ignore
            }
            return;
        }
        fs.renameSync(tempPath, destPath);
        console.log("Temp renamed to destination:", destPath);
        fs.unlinkSync(filePath);
        console.log("Removed source:", filePath);
        maybeRemoveEmptyParent(path.dirname(filePath), sourceRoot);
        statusUpdater({
            runtimeActivityState: "completed",
            currentFile: null,
            currentPhaseDetail: path.basename(destPath),
            lastError: null
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Ingest error for", filePath, message);
        statusUpdater({
            runtimeActivityState: "failed",
            currentFile: path.basename(filePath),
            currentPhaseDetail: "ingest failed",
            lastError: message
        });
        try {
            fs.unlinkSync(tempPath);
        }
        catch {
            // ignore
        }
    }
    finally {
        inFlight.delete(resolvedPath);
    }
}
async function main() {
    const config = loadConfig("config.yaml");
    const sourceRoot = path.resolve(config.ingest.jprSourceRoot);
    const destRoot = path.resolve(config.ingest.recordingsRoot);
    const statusUpdater = createStatusUpdater(config.runtimeStatusPath);
    if (!fs.existsSync(destRoot)) {
        fs.mkdirSync(destRoot, { recursive: true });
    }
    console.log("Watching Just Press Record iCloud folder for new recordings:");
    console.log("  Source:", sourceRoot);
    console.log("  Destination:", destRoot);
    console.log("  Poll interval:", `${POLL_INTERVAL_MS}ms`);
    const inFlight = new Set();
    const processDiscoveredFiles = () => {
        for (const filePath of listAudioFiles(sourceRoot)) {
            void handleFile(filePath, sourceRoot, destRoot, inFlight, statusUpdater);
        }
    };
    processDiscoveredFiles();
    setInterval(processDiscoveredFiles, POLL_INTERVAL_MS);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ingestJustPressRecord failed:", message);
    process.exit(1);
});
