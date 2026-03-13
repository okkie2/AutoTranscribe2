#!/usr/bin/env node
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { ConsoleAndFileLogger } from "../infrastructure/logging/ConsoleAndFileLogger.js";
import { MlxWhisperBackend } from "../infrastructure/backend/MlxWhisperBackend.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { JobWorker } from "../application/JobWorker.js";
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
    const transcriptionService = new TranscriptionService(backend, logger, config.watch.outputDirectory);
    const queue = new TranscriptionJobQueue();
    const poller = new FileSystemPoller(config.watch, queue, logger, config.backend.languageHint);
    const worker = new JobWorker(queue, transcriptionService, logger);
    if (command === "transcribe") {
        const audioPath = args[0];
        if (!audioPath) {
            console.error("Usage: autotranscribe transcribe <audio-file>");
            process.exit(1);
        }
        try {
            const transcriptPath = await transcriptionService.transcribeSingle(audioPath, {
                languageHint: config.backend.languageHint
            });
            console.log(`Transcript written to: ${transcriptPath}`);
            process.exit(0);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("Transcription failed", { error: message });
            console.error(`Transcription failed: ${message}`);
            process.exit(1);
        }
    }
    else if (command === "watch") {
        if (!config.watch.enabled) {
            logger.warn("Watch is disabled in configuration. Exiting.");
            process.exit(0);
        }
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
      Start the long-running watcher (not yet implemented in this skeleton).

  autotranscribe transcribe <audio-file>
      Transcribe a single audio file and write a Markdown (.md) transcript.
`);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unexpected error: ${message}`);
    process.exit(1);
});
