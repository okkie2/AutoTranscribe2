import { stopWatcherControl } from "../application/WatcherControl.js";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
async function main() {
    traceEvent({
        event: "command_received",
        source: "cli:stopAll",
        command: "stop:all"
    });
    const config = loadConfig("config.yaml");
    traceEvent({
        event: "command_parsed",
        source: "cli:stopAll",
        command: "stop:all"
    });
    await stopWatcherControl(config);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stopAll] Unexpected error:", message);
    process.exit(1);
});
