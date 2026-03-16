import { stopWatcherControl } from "../application/WatcherControl.js";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";

async function main() {
  const config = loadConfig("config.yaml");
  await stopWatcherControl(config);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[stopAll] Unexpected error:", message);
  process.exit(1);
});
