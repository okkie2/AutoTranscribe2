import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";

const PID_FILE = ".autotranscribe2-pids.json";

async function ensureOllamaRunning(): Promise<void> {
  const config = loadConfig("config.yaml");
  const title = config.title;

  if (!title.enabled || title.provider !== "ollama" || !title.ollama) {
    console.log("[startAll] Title provider is not Ollama; skipping Ollama check.");
    return;
  }

  const endpoint = title.ollama.endpoint;
  console.log(`[startAll] Checking Ollama service at ${endpoint}...`);

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
      console.log("[startAll] Ollama is reachable.");
      return;
    }
  } catch {
    // fall through to attempt starting via brew
  } finally {
    clearTimeout(timeout);
  }

  console.log("[startAll] Ollama not reachable; attempting to start via 'brew services start ollama'...");
  try {
    const result = spawnSync("brew", ["services", "start", "ollama"], {
      stdio: "inherit"
    });
    if (result.error) {
      console.error("[startAll] Failed to start Ollama via brew:", result.error.message);
    } else {
      console.log("[startAll] Brew command executed. Ollama may take a moment to become ready.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[startAll] Error while trying to start Ollama via brew:", message);
  }
}

function writePidFile(pids: { ingestPid: number; watchPid: number }): void {
  const filePath = path.resolve(PID_FILE);
  fs.writeFileSync(filePath, JSON.stringify(pids, null, 2), { encoding: "utf8" });
  console.log("[startAll] Wrote PID file:", filePath, pids);
}

async function main() {
  console.log("[startAll] Starting AutoTranscribe2 stack (Ollama + ingest:jpr + watcher)...");

  await ensureOllamaRunning();

  // Start ingest:jpr
  const ingest = spawn("npm", ["run", "ingest:jpr"], {
    stdio: "inherit",
    cwd: process.cwd()
  });

  // Start watcher
  const watch = spawn("node", ["dist/cli/index.js", "watch"], {
    stdio: "inherit",
    cwd: process.cwd()
  });

  console.log("[startAll] Started ingest:jpr (PID:", ingest.pid, "), watcher (PID:", watch.pid, ").");
  if (ingest.pid && watch.pid) {
    writePidFile({ ingestPid: ingest.pid, watchPid: watch.pid });
  }

  const shutdown = () => {
    console.log("[startAll] Received shutdown signal, stopping children...");
    try {
      if (ingest.pid) process.kill(ingest.pid, "SIGINT");
    } catch {
      // ignore
    }
    try {
      if (watch.pid) process.kill(watch.pid, "SIGINT");
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(path.resolve(PID_FILE));
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[startAll] Unexpected error:", message);
  process.exit(1);
});

