#!/usr/bin/env node

import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { ConsoleAndFileLogger } from "../infrastructure/logging/ConsoleAndFileLogger.js";
import { MlxWhisperBackend } from "../infrastructure/backend/MlxWhisperBackend.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { JobWorker } from "../application/JobWorker.js";
import { createTitleSuggester } from "../infrastructure/title/TitleSuggesterFactory.js";
import { createStatusUpdater, readStatus, writeStatus } from "../infrastructure/status/RuntimeStatus.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import { exportDiagnosticBundle } from "../application/Diagnostics.js";
import { runMenu } from "./menu.js";

function delay(ms: number): Promise<void> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to load configuration: ${message}`);
    process.exit(1);
  }

  const logger = new ConsoleAndFileLogger(config.logging);
  const backend = new MlxWhisperBackend(config.backend);
  const titleSuggester = createTitleSuggester(config.title);
  const transcriptionService = new TranscriptionService(
    backend,
    logger,
    titleSuggester,
    config.title
  );
  const queue = new TranscriptionJobQueue();
  const statusPath = config.runtimeStatusPath;
  const statusUpdater = createStatusUpdater(statusPath);
  const poller = new FileSystemPoller(
    config.watch,
    queue,
    logger,
    config.backend.languageHint,
    statusUpdater
  );
  const worker = new JobWorker(queue, transcriptionService, logger, statusUpdater);

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
      currentPhaseDetail: null
    });

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
        statusUpdater({
          runtimeActivityState: "scanning",
          currentPhaseDetail: "watch scan",
          lastError: null
        });
        poller.scanOnce();
        const currentStatus = readStatus(statusPath);
        if (
          currentStatus &&
          ["scanning", "enqueuingJob", "completed"].includes(currentStatus.runtimeActivityState)
        ) {
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
  } else if (command === "menu") {
    traceEvent({
      event: "command_parsed",
      source: "cli:index",
      command: "menu"
    });
    await runMenu(config);
  } else if (command === "diagnostics") {
    traceEvent({
      event: "command_parsed",
      source: "cli:index",
      command: "diagnostics"
    });
    const bundle = exportDiagnosticBundle(config);
    console.log(`Diagnostic bundle exported to ${bundle.bundlePath}`);
    process.exit(0);
  } else {
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
      TranscriptionJobs, and the LatestTranscript.

  autotranscribe diagnostics
      Export a diagnostic bundle with the latest CLI trace, config,
      and reconciled state snapshot.
`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Unexpected error: ${message}`);
  process.exit(1);
});
