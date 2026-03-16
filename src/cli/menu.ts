#!/usr/bin/env node

import chalk from "chalk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AppConfig } from "../infrastructure/config/AppConfig.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import {
  getCompactStatusSnapshotLines,
  getCompactStatusSnapshot,
  getStatusSnapshot,
  listRecentTranscriptionJobs,
  openLatestTranscript,
  reconcileManagedWatcherStack,
  restartWatcherControl,
  startWatcherControl,
  stopWatcherControl
} from "../application/WatcherControl.js";
import type { StatusFreshness } from "../application/StatusSnapshot.js";
import type { WatcherProcessState } from "../application/WatcherControl.js";

const MENU_OPTIONS = [
  "Show Watcher Status",
  "Start Watcher",
  "Stop Watcher",
  "Restart Watcher",
  "Show Recent TranscriptionJobs",
  "Open Latest Transcript",
  "Exit"
] as const;
const STATUS_REFRESH_INTERVAL_MS = 300;

function renderMenu(config: AppConfig): void {
  console.clear();
  for (const line of getCompactStatusSnapshotLines(config)) {
    console.log(line);
  }
  for (let i = 0; i < MENU_OPTIONS.length; i += 1) {
    console.log(`${i + 1}. ${MENU_OPTIONS[i]}`);
  }
  console.log("");
  console.log("Press Enter to refresh. Type 'r' to refresh. Type 1-7 to choose an action.");
  console.log("");
}

function renderDetailedStatus(config: AppConfig): void {
  const snapshot = getStatusSnapshot(config);
  console.clear();
  for (const line of snapshot.lines) {
    console.log(line);
  }
  console.log("");
}

function colorizeFreshness(statusFreshness: StatusFreshness): (text: string) => string {
  switch (statusFreshness) {
    case "fresh":
      return chalk.green;
    case "stale":
      return chalk.dim;
    case "missing":
      return chalk.red;
    default:
      return chalk.dim;
  }
}

function colorizeWatcherProcessState(watcherProcessState: WatcherProcessState): (text: string) => string {
  switch (watcherProcessState) {
    case "running":
      return chalk.green;
    case "starting":
    case "stopping":
      return chalk.yellow;
    case "error":
      return chalk.red;
    case "stopped":
    default:
      return chalk.dim;
  }
}

function colorizeActivity(activity: string | null): (text: string) => string {
  switch (activity) {
    case "idle":
    case "completed":
      return chalk.green;
    case "failed":
      return chalk.red;
    case "scanning":
    case "waitingForStableFile":
    case "ingesting":
    case "enqueuingJob":
    case "processingTranscription":
    case "writingTranscript":
      return chalk.yellow;
    default:
      return chalk.dim;
  }
}

function renderLiveDetailedStatus(config: AppConfig): void {
  const snapshot = getStatusSnapshot(config);
  const color = colorizeFreshness(snapshot.statusFreshness);
  const watcherProcessColor = colorizeWatcherProcessState(snapshot.watcherProcessState);
  const activityColor = colorizeActivity(snapshot.runtimeActivityState);
  const nowLabel = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  console.clear();
  console.log(`Current time: ${nowLabel}`);
  console.log("");
  for (const line of snapshot.lines) {
    if (line.startsWith("Watcher process: ")) {
      const value = line.replace(/^Watcher process:\s*/, "");
      console.log("Watcher process: " + watcherProcessColor(value));
    } else if (line.startsWith("Activity: ")) {
      const value = line.replace(/^Activity:\s*/, "");
      console.log("Activity: " + activityColor(value));
    } else if (line.startsWith("Freshness: ")) {
      const value = line.replace(/^Freshness:\s*/, "");
      console.log("Freshness: " + color(value));
    } else {
      console.log(line);
    }
  }
  console.log("");
  console.log("Press Enter to return to menu");
}

async function showLiveWatcherStatus(config: AppConfig, rl: readline.Interface): Promise<void> {
  if (!input.isTTY) {
    renderDetailedStatus(config);
    return;
  }

  rl.pause();

  await new Promise<void>((resolve) => {
    const cleanup = (): void => {
      clearInterval(intervalId);
      input.off("data", onData);
      input.setRawMode(false);
      console.clear();
      resolve();
    };

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (text === "\r" || text === "\n") {
        cleanup();
      }
    };

    const intervalId = setInterval(() => renderLiveDetailedStatus(config), STATUS_REFRESH_INTERVAL_MS);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    renderLiveDetailedStatus(config);
  });

  rl.resume();
}

async function readMenuSelection(rl: readline.Interface): Promise<string> {
  if (!input.isTTY) {
    return (await rl.question("Select an option: ")).trim();
  }

  output.write("Select an option: ");
  rl.pause();

  const selection = await new Promise<string>((resolve) => {
    const cleanup = (value: string): void => {
      input.off("data", onData);
      input.setRawMode(false);
      output.write("\n");
      resolve(value);
    };

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");

      if (text === "\u0003") {
        input.setRawMode(false);
        process.exit(130);
      }

      if (text === "\r" || text === "\n") {
        cleanup("");
        return;
      }

      const key = text.trim();
      if (["1", "2", "3", "4", "5", "6", "7", "r", "R"].includes(key)) {
        output.write(key);
        cleanup(key);
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });

  rl.resume();
  return selection;
}

function renderRecentJobs(config: AppConfig): void {
  const jobs = listRecentTranscriptionJobs(config);
  console.clear();
  console.log("Recent TranscriptionJobs");
  console.log("");

  if (jobs.length === 0) {
    console.log("No recent TranscriptionJobs found.");
    console.log("");
    return;
  }

  for (const [index, job] of jobs.entries()) {
    console.log(`${index + 1}. ${job.finishedAt}${job.title ? ` - ${job.title}` : ""}`);
    console.log(`AudioFile: ${job.audioFile}`);
    console.log(`Transcript: ${job.transcriptPath}`);
    console.log("");
  }
}

async function showResultScreen(
  config: AppConfig,
  selection: string,
  rl: readline.Interface
): Promise<{ running: boolean; requiresPause: boolean }> {
  if (selection !== "") {
    traceEvent({
      event: "command_received",
      source: "cli:menu",
      command: selection
    });
  }

  switch (selection) {
    case "1":
    case "Show Watcher Status":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Show Watcher Status"
      });
      await showLiveWatcherStatus(config, rl);
      return { running: true, requiresPause: false };
    case "2":
    case "Start Watcher":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Start Watcher"
      });
      if (!canStartWatcher(config)) {
        console.clear();
        console.log("Watcher appears to be running already. Stop it first before starting again.");
        console.log("");
        return { running: true, requiresPause: true };
      }
      console.clear();
      await startWatcherControl(config);
      return { running: true, requiresPause: true };
    case "3":
    case "Stop Watcher":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Stop Watcher"
      });
      if (!(await confirmAction(rl, "Stop Watcher"))) {
        console.clear();
        console.log("Stop Watcher cancelled.");
        console.log("");
        return { running: true, requiresPause: true };
      }
      console.clear();
      await stopWatcherControl(config);
      return { running: true, requiresPause: true };
    case "4":
    case "Restart Watcher":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Restart Watcher"
      });
      if (!(await confirmAction(rl, "Restart Watcher"))) {
        console.clear();
        console.log("Restart Watcher cancelled.");
        console.log("");
        return { running: true, requiresPause: true };
      }
      console.clear();
      await restartWatcherControl(config);
      return { running: true, requiresPause: true };
    case "5":
    case "Show Recent TranscriptionJobs":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Show Recent TranscriptionJobs"
      });
      renderRecentJobs(config);
      return { running: true, requiresPause: true };
    case "6": {
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Open Latest Transcript"
      });
      console.clear();
      const latestTranscript = openLatestTranscript(config);
      console.log(`Opened LatestTranscript: ${latestTranscript.transcriptPath}`);
      console.log("");
      return { running: true, requiresPause: true };
    }
    case "7":
    case "Exit":
      traceEvent({
        event: "command_parsed",
        source: "cli:menu",
        command: "Exit"
      });
      return { running: false, requiresPause: false };
    case "":
    case "r":
    case "R":
      return { running: true, requiresPause: false };
    default:
      traceEvent({
        event: "command_rejected",
        source: "cli:menu",
        command: selection
      });
      console.clear();
      console.log("Unknown selection. Choose 1-7, press Enter to refresh, or type 'r'.");
      console.log("");
      return { running: true, requiresPause: true };
  }
}

async function confirmAction(rl: readline.Interface, actionLabel: string): Promise<boolean> {
  if (!input.isTTY) {
    while (true) {
      const answer = (
        await rl.question(`Are you sure you want to ${actionLabel.toLowerCase()}? (y/n): `)
      ).trim();
      if (answer === "y" || answer === "Y") return true;
      if (answer === "n" || answer === "N") return false;
    }
  }

  output.write(`Are you sure you want to ${actionLabel.toLowerCase()}? (y/n): `);
  rl.pause();

  const confirmed = await new Promise<boolean>((resolve) => {
    const cleanup = (value: boolean): void => {
      input.off("data", onData);
      input.setRawMode(false);
      output.write("\n");
      resolve(value);
    };

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");

      if (text === "\u0003") {
        input.setRawMode(false);
        process.exit(130);
      }

      if (text === "\r" || text === "\n") {
        return;
      }

      const key = text.trim();
      if (key === "y" || key === "Y") {
        output.write(key);
        cleanup(true);
        return;
      }

      output.write(key || "n");
      if (key === "n" || key === "N") {
        cleanup(false);
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });

  rl.resume();
  return confirmed;
}

function canStartWatcher(config: AppConfig): boolean {
  const reconciliation = reconcileManagedWatcherStack(config);
  traceEvent({
    event: "transition_guard_evaluated",
    source: "cli:menu",
    command: "Start Watcher",
    observed_state: getCompactStatusSnapshot(config),
    metadata: {
      guard: "menu_start_allowed",
      evaluated_value: ["stopped", "staleLock"].includes(reconciliation.reconciledProcessState),
      source_of_truth: "reconciled_process_state"
    }
  });
  return ["stopped", "staleLock"].includes(reconciliation.reconciledProcessState);
}

export async function runMenu(config: AppConfig): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    let running = true;

    while (running) {
      renderMenu(config);
      const selection = await readMenuSelection(rl);
      const result = await showResultScreen(config, selection, rl);
      running = result.running;

      if (running && result.requiresPause) {
        await rl.question("Press Enter to return to menu");
      }
    }
  } finally {
    rl.close();
  }
}
