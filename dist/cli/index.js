#!/usr/bin/env node
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { ConsoleAndFileLogger } from "../infrastructure/logging/ConsoleAndFileLogger.js";
import { createBackend } from "../infrastructure/backend/BackendFactory.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { JobWorker } from "../application/JobWorker.js";
import { createTitleSuggester } from "../infrastructure/title/TitleSuggesterFactory.js";
import { createStatusUpdater, readStatus, shouldPublishWatcherScanStatus, shouldResetWatcherPollLoopToIdle, writeStatus } from "../infrastructure/status/RuntimeStatus.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { exportDiagnosticBundle } from "../application/Diagnostics.js";
import { runMenu } from "./menu.js";
import { probeOllamaTitleHealth } from "../infrastructure/title/OllamaTitleSuggester.js";
import { getDefaultTranscriptionJobLedgerPath, rehydrateRecoverableJobs, TranscriptionJobLedger } from "../infrastructure/jobs/TranscriptionJobLedger.js";
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
    const [, , command, ...args] = process.argv;
    traceEvent({
        event: "command_received",
        source: "cli:index",
        command: command ?? "help",
        metadata: { argv: process.argv.slice(2) }
    });
    if (!command || command === "--help" || command === "-h") {
        traceEvent({
            event: "command_parsed",
            source: "cli:index",
            command: "help"
        });
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
    const backend = createBackend(config.backend);
    const titleSuggester = createTitleSuggester(config.title);
    const statusPath = config.runtimeStatusPath;
    const statusUpdater = createStatusUpdater(statusPath);
    const transcriptionService = new TranscriptionService(backend, logger, titleSuggester, config.title, ({ titleProviderState, titleProviderDetail }) => {
        statusUpdater({
            titleProviderState,
            titleProviderDetail
        });
    });
    const queue = new TranscriptionJobQueue();
    const jobLedger = new TranscriptionJobLedger(getDefaultTranscriptionJobLedgerPath(statusPath));
    const poller = new FileSystemPoller(config.watch, queue, logger, config.backend.languageHint, statusUpdater, jobLedger);
    const worker = new JobWorker(queue, transcriptionService, logger, statusUpdater, {
        jobLedger
    });
    if (command === "watch") {
        traceEvent({
            event: "command_parsed",
            source: "cli:index",
            command: "watch"
        });
        if (!config.watch.enabled) {
            logger.warn("Watch is disabled in configuration. Exiting.");
            process.exit(0);
        }
        writeStatus(statusPath, {
            runtimeActivityState: "idle",
            queueLength: 0,
            currentFile: null,
            lastError: null,
            currentJobId: null,
            currentPhaseDetail: null,
            titleProviderState: !config.title.enabled || config.title.provider === "none"
                ? "disabled"
                : config.title.provider === "ollama"
                    ? "unknown"
                    : "ready",
            titleProviderDetail: !config.title.enabled || config.title.provider === "none"
                ? "Title generation is disabled."
                : config.title.provider === "ollama"
                    ? "Ollama title provider has not been checked yet."
                    : "Heuristic title provider is active."
        });
        const recoveredJobCount = rehydrateRecoverableJobs(queue, jobLedger, logger);
        if (recoveredJobCount > 0) {
            statusUpdater({
                runtimeActivityState: "enqueuingJob",
                queueLength: queue.getLength(),
                currentFile: null,
                currentJobId: null,
                currentPhaseDetail: "recovered queued jobs",
                lastError: null
            });
        }
        const controller = new AbortController();
        const { signal } = controller;
        process.on("SIGINT", () => {
            logger.info("Received SIGINT, shutting down watcher.");
            statusUpdater({
                runtimeActivityState: "draining",
                currentPhaseDetail: "stop requested; finishing current transcription job",
                lastError: null,
                lastHeartbeatAt: new Date().toISOString()
            });
            controller.abort();
        });
        logger.info("Starting watcher", {
            directories: config.watch.directories,
            pollingIntervalSeconds: config.watch.pollingIntervalSeconds
        });
        const pollLoop = (async () => {
            const intervalMs = config.watch.pollingIntervalSeconds * 1000;
            while (!signal.aborted) {
                const statusBeforeScan = readStatus(statusPath);
                if (shouldPublishWatcherScanStatus(statusBeforeScan)) {
                    statusUpdater({
                        runtimeActivityState: "scanning",
                        currentPhaseDetail: "watch scan",
                        lastError: null
                    });
                }
                poller.scanOnce();
                const currentStatus = readStatus(statusPath);
                if (shouldResetWatcherPollLoopToIdle(currentStatus)) {
                    statusUpdater({
                        runtimeActivityState: "idle",
                        currentPhaseDetail: null,
                        currentFile: null,
                        currentJobId: null
                    });
                }
                await delay(intervalMs);
            }
        })();
        await Promise.all([pollLoop, worker.start(signal)]);
        logger.info("Watcher stopped cleanly.");
        process.exit(0);
    }
    else if (command === "menu") {
        traceEvent({
            event: "command_parsed",
            source: "cli:index",
            command: "menu"
        });
        await runMenu(config);
    }
    else if (command === "diagnostics") {
        traceEvent({
            event: "command_parsed",
            source: "cli:index",
            command: "diagnostics"
        });
        const bundle = exportDiagnosticBundle(config);
        console.log(`Diagnostic bundle exported to ${bundle.bundlePath}`);
        process.exit(0);
    }
    else if (command === "title-health") {
        traceEvent({
            event: "command_parsed",
            source: "cli:index",
            command: "title-health"
        });
        if (!config.title.enabled) {
            console.log("Title generation is disabled in config.");
            process.exit(0);
        }
        if (config.title.provider !== "ollama") {
            console.log(`Title provider is '${config.title.provider}', so no Ollama health check is needed.`);
            process.exit(0);
        }
        const result = await probeOllamaTitleHealth(config.title);
        console.log(`Title provider: ollama`);
        console.log(`Endpoint: ${result.endpoint}`);
        console.log(`Model: ${result.model}`);
        console.log(`Status: ${result.ok ? "OK" : "FAILED"}`);
        console.log(`Detail: ${result.message}`);
        process.exit(result.ok ? 0 : 1);
    }
    else {
        traceEvent({
            event: "command_rejected",
            source: "cli:index",
            command,
            metadata: { argv: args }
        });
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

  autotranscribe menu
      Open the simple operational menu for watcher control, recent
      Transcription Jobs, and the Latest Transcript.

  autotranscribe diagnostics
      Export a diagnostic bundle with the latest CLI trace, config,
      and reconciled state snapshot.

  autotranscribe title-health
      Probe the configured Ollama title endpoint and print the
      exact failure reason when title generation is unhealthy.
`);
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unexpected error: ${message}`);
    process.exit(1);
});
