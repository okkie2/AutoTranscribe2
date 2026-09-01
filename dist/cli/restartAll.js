import { restartWatcherControl } from "../application/WatcherControl.js";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
async function main() {
    traceEvent({
        event: "command_received",
        source: "cli:restartAll",
        command: "restart:all"
    });
    const config = loadConfig("config.yaml");
    traceEvent({
        event: "command_parsed",
        source: "cli:restartAll",
        command: "restart:all"
    });
    await restartWatcherControl(config);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[restartAll] Unexpected error:", message);
    process.exit(1);
});
