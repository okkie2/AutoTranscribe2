import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { startWatcherControl } from "../application/WatcherControl.js";

async function main() {
  traceEvent({
    event: "command_received",
    source: "cli:startAll",
    command: "start:all"
  });
  const config = loadConfig("config.yaml");
  traceEvent({
    event: "command_parsed",
    source: "cli:startAll",
    command: "start:all"
  });
  await startWatcherControl(config);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[startAll] Unexpected error:", message);
  process.exit(1);
});
