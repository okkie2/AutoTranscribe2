#!/usr/bin/env node
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { ConsoleAndFileLogger } from "../infrastructure/logging/ConsoleAndFileLogger.js";
import { MlxWhisperBackend } from "../infrastructure/backend/MlxWhisperBackend.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { JobWorker } from "../application/JobWorker.js";
import { createTitleSuggester } from "../infrastructure/title/TitleSuggesterFactory.js";
import { createStatusUpdater, writeStatus } from "../infrastructure/status/RuntimeStatus.js";
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    const [, , command, ...args] = process.argv;
    if (!command || command === "--help" || command === "-h") {
        printHelp();
        process.exit(0);
    }
    let config;
    try {
        config = loadConfig("config.yaml");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to load configuration: ${message}`);
        process.exit(1);
    }
    const logger = new ConsoleAndFileLogger(config.logging);
    const backend = new MlxWhisperBackend(config.backend);
    const titleSuggester = createTitleSuggester(config.title);
    const transcriptionService = new TranscriptionService(backend, logger, titleSuggester, config.title);
    const queue = new TranscriptionJobQueue();
    const poller = new FileSystemPoller(config.watch, queue, logger, config.backend.languageHint);
    const statusPath = config.runtimeStatusPath;
    const statusUpdater = createStatusUpdater(statusPath);
    const worker = new JobWorker(queue, transcriptionService, logger, statusUpdater);
    if (command === "watch") {
        if (!config.watch.enabled) {
            logger.warn("Watch is disabled in configuration. Exiting.");
            process.exit(0);
        }
        writeStatus(statusPath, { state: "idle", queueLength: 0, currentFile: null, lastError: null });
        const controller = new AbortController();
        const { signal } = controller;
        process.on("SIGINT", () => {
            logger.info("Received SIGINT, shutting down watcher.");
            controller.abort();
        });
        logger.info("Starting watcher", {
            directories: config.watch.directories,
            pollingIntervalSeconds: config.watch.pollingIntervalSeconds
        });
        const pollLoop = (async () => {
            const intervalMs = config.watch.pollingIntervalSeconds * 1000;
            while (!signal.aborted) {
                poller.scanOnce();
                await delay(intervalMs);
            }
        })();
        await Promise.all([pollLoop, worker.start(signal)]);
        logger.info("Watcher stopped cleanly.");
        process.exit(0);
    }
    else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
}
function printHelp() {
    console.log(`autotranscribe - AutoTranscribe2 CLI

Usage:
  autotranscribe watch
      Start the long-running watcher that polls configured directories
      and transcribes new audio files automatically.
`);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unexpected error: ${message}`);
    process.exit(1);
});
