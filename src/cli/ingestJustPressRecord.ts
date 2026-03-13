import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";

function isHidden(p: string): boolean {
  return path.basename(p).startsWith(".");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait for file size to stabilize before copying to avoid partial writes.
async function waitForStableFile(filePath: string, attempts = 60, intervalMs = 1000): Promise<void> {
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
    } catch (err) {
      throw new Error(`File not accessible: ${filePath}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`File did not stabilize after ${attempts} attempts: ${filePath}`);
}

function maybeRemoveEmptyParent(dateDir: string, sourceRoot: string): void {
  if (!dateDir || dateDir === sourceRoot) return;
  try {
    const entries = fs.readdirSync(dateDir).filter((f) => !isHidden(f));
    if (entries.length === 0) {
      fs.rmdirSync(dateDir);
      console.log("Removed empty folder:", dateDir);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("Could not remove folder:", dateDir, message);
  }
}

async function handleFile(filePath: string, sourceRoot: string, destRoot: string): Promise<void> {
  if (isHidden(filePath)) return;
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".m4a") {
    return;
  }

  const dateFolder = path.basename(path.dirname(filePath));
  const baseName = path.basename(filePath);
  const destName = `${dateFolder}_${baseName}`;
  const destPath = path.join(destRoot, destName);
  const tempPath = path.join(destRoot, `.tmp_${process.pid}_${destName}`);

  console.log("New JPR recording detected:", filePath);
  try {
    await waitForStableFile(filePath);
    const srcStat = fs.statSync(filePath);
    console.log("Source ready, size:", srcStat.size, "path:", filePath);

    fs.copyFileSync(filePath, tempPath);
    const destStat = fs.statSync(tempPath);
    console.log("Copy complete, temp size:", destStat.size, "temp path:", tempPath);

    if (destStat.size !== srcStat.size) {
      console.warn("Size mismatch after copy, keeping source. src:", srcStat.size, "dest:", destStat.size);
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
      return;
    }

    fs.renameSync(tempPath, destPath);
    console.log("Temp renamed to destination:", destPath);

    fs.unlinkSync(filePath);
    console.log("Removed source:", filePath);
    maybeRemoveEmptyParent(path.dirname(filePath), sourceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Ingest error for", filePath, message);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore
    }
  }
}

async function main() {
  const config = loadConfig("config.yaml");
  const sourceRoot = path.resolve(config.ingest.jprSourceRoot);
  const destRoot = path.resolve(config.ingest.recordingsRoot);

  if (!fs.existsSync(destRoot)) {
    fs.mkdirSync(destRoot, { recursive: true });
  }

  console.log("Watching Just Press Record iCloud folder for new recordings:");
  console.log("  Source:", sourceRoot);
  console.log("  Destination:", destRoot);

  const watcher = chokidar.watch(sourceRoot, {
    persistent: true,
    ignoreInitial: false,
    ignored: /(^|[\/\\])\../,
    depth: 2
  });

  watcher.on("add", (filePath) => {
    void handleFile(filePath, sourceRoot, destRoot);
  });

  watcher.on("error", (err) => {
    console.error("JPR watcher error:", err);
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("ingestJustPressRecord failed:", message);
  process.exit(1);
});

