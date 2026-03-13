import fs from "node:fs";
import path from "node:path";

const PID_FILE = ".autotranscribe2-pids.json";

function readPidFile(): { ingestPid?: number; watchPid?: number } | null {
  const filePath = path.resolve(PID_FILE);
  if (!fs.existsSync(filePath)) {
    console.log("[stopAll] No PID file found; nothing to stop.");
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stopAll] Failed to read PID file:", message);
    return null;
  }
}

async function main() {
  console.log("[stopAll] Stopping AutoTranscribe2 stack (ingest:jpr + watcher)...");
  const pids = readPidFile();
  if (!pids) {
    return;
  }

  const { ingestPid, watchPid } = pids;

  if (ingestPid) {
    try {
      process.kill(ingestPid, "SIGINT");
      console.log("[stopAll] Sent SIGINT to ingest:jpr (PID:", ingestPid, ").");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[stopAll] Failed to signal ingest:jpr:", message);
    }
  }

  if (watchPid) {
    try {
      process.kill(watchPid, "SIGINT");
      console.log("[stopAll] Sent SIGINT to watcher (PID:", watchPid, ").");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[stopAll] Failed to signal watcher:", message);
    }
  }

  try {
    fs.unlinkSync(path.resolve(PID_FILE));
    console.log("[stopAll] Removed PID file.");
  } catch {
    // ignore
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[stopAll] Unexpected error:", message);
  process.exit(1);
});

