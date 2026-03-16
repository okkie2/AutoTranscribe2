import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { startWatcherControl } from "../application/WatcherControl.js";
async function main() {
    const config = loadConfig("config.yaml");
    await startWatcherControl(config);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[startAll] Unexpected error:", message);
    process.exit(1);
});
