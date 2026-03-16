import { stopWatcherControl } from "../application/WatcherControl.js";
async function main() {
    await stopWatcherControl();
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stopAll] Unexpected error:", message);
    process.exit(1);
});
