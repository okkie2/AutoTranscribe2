import type readline from "node:readline/promises";
import type { AppConfig, BackendConfig } from "../infrastructure/config/AppConfig.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";
import {
  getCompactStatusSnapshot,
  listRecentTranscriptionJobs,
  openLatestTranscript,
  reconcileManagedWatcherStack,
  restartWatcherControl,
  startWatcherControl,
  stopWatcherControl
} from "../application/WatcherControl.js";

export interface MenuActionResult {
  running: boolean;
  requiresPause: boolean;
}

export interface MenuActionContext {
  config: AppConfig;
  rl: readline.Interface;
  showLiveWatcherStatus: () => Promise<void>;
  renderRecentJobs: () => void;
  confirmAction: (actionLabel: string) => Promise<boolean>;
  setBackendType: (type: BackendConfig["type"]) => void;
}

export type MenuActionHandler = (context: MenuActionContext) => Promise<MenuActionResult>;

function canStartWatcher(config: AppConfig): boolean {
  const reconciliation = reconcileManagedWatcherStack(config);
  const allowed = ["stopped", "staleLock"].includes(reconciliation.reconciledProcessState);
  traceEvent({
    event: "transition_guard_evaluated",
    source: "cli:menu",
    command: "Start Watcher",
    observed_state: getCompactStatusSnapshot(config),
    metadata: {
      guard: "menu_start_allowed",
      evaluated_value: allowed,
      source_of_truth: "reconciled_process_state"
    }
  });
  return allowed;
}

function canStopWatcher(config: AppConfig): boolean {
  const reconciliation = reconcileManagedWatcherStack(config);
  const allowed = reconciliation.reconciledProcessState !== "stopped";
  traceEvent({
    event: "transition_guard_evaluated",
    source: "cli:menu",
    command: "Stop Watcher",
    observed_state: getCompactStatusSnapshot(config),
    metadata: {
      guard: "menu_stop_allowed",
      evaluated_value: allowed,
      source_of_truth: "reconciled_process_state"
    }
  });
  return allowed;
}

function canRestartWatcher(config: AppConfig): boolean {
  const reconciliation = reconcileManagedWatcherStack(config);
  const allowed = reconciliation.reconciledProcessState !== "stopped";
  traceEvent({
    event: "transition_guard_evaluated",
    source: "cli:menu",
    command: "Restart Watcher",
    observed_state: getCompactStatusSnapshot(config),
    metadata: {
      guard: "menu_restart_allowed",
      evaluated_value: allowed,
      source_of_truth: "reconciled_process_state"
    }
  });
  return allowed;
}

async function showWatcherStatusAction({ showLiveWatcherStatus }: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Show Watcher Status"
  });
  await showLiveWatcherStatus();
  return { running: true, requiresPause: false };
}

async function startWatcherAction({
  config,
  confirmAction
}: MenuActionContext): Promise<MenuActionResult> {
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
  if (!(await confirmAction("Start Watcher"))) {
    console.clear();
    console.log("Start Watcher cancelled.");
    console.log("");
    return { running: true, requiresPause: true };
  }
  console.clear();
  await startWatcherControl(config);
  console.log("Start Watcher succeeded.");
  console.log("");
  return { running: true, requiresPause: true };
}

async function stopWatcherAction({
  config,
  confirmAction
}: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Stop Watcher"
  });
  if (!canStopWatcher(config)) {
    console.clear();
    console.log("Watcher is already stopped. Nothing to stop.");
    console.log("");
    return { running: true, requiresPause: true };
  }
  if (!(await confirmAction("Stop Watcher"))) {
    console.clear();
    console.log("Stop Watcher cancelled.");
    console.log("");
    return { running: true, requiresPause: true };
  }
  console.clear();
  await stopWatcherControl(config);
  console.log("Stop Watcher succeeded.");
  console.log("");
  return { running: true, requiresPause: true };
}

async function restartWatcherAction({
  config,
  confirmAction
}: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Restart Watcher"
  });
  if (!canRestartWatcher(config)) {
    console.clear();
    console.log("Watcher is already stopped. Nothing to restart.");
    console.log("");
    return { running: true, requiresPause: true };
  }
  if (!(await confirmAction("Restart Watcher"))) {
    console.clear();
    console.log("Restart Watcher cancelled.");
    console.log("");
    return { running: true, requiresPause: true };
  }
  console.clear();
  await restartWatcherControl(config);
  console.log("Restart Watcher succeeded.");
  console.log("");
  return { running: true, requiresPause: true };
}

async function showRecentJobsAction({ renderRecentJobs }: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Show Recent Transcription Jobs"
  });
  renderRecentJobs();
  return { running: true, requiresPause: true };
}

async function openLatestTranscriptAction({ config }: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Open Latest Transcript"
  });
  console.clear();
  const latestTranscript = openLatestTranscript(config);
  console.log(`Opened Latest Transcript: ${latestTranscript.transcriptPath}`);
  console.log("");
  return { running: true, requiresPause: true };
}

const BACKEND_TYPES: BackendConfig["type"][] = ["mlx_whisper", "parakeet"];

async function switchBackendAction({
  config,
  setBackendType,
  confirmAction
}: MenuActionContext): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Switch Backend"
  });

  const current = config.backend.type;
  const target = BACKEND_TYPES.find((t) => t !== current) ?? BACKEND_TYPES[0];

  console.clear();
  console.log(`Current backend: ${current}`);
  console.log("");

  if (!(await confirmAction(`Switch to ${target}`))) {
    console.clear();
    console.log("Switch Backend cancelled.");
    console.log("");
    return { running: true, requiresPause: true };
  }

  try {
    setBackendType(target);
    console.clear();
    console.log(`Backend switched to ${target}.`);
    console.log("Restart the watcher to apply the change.");
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.clear();
    console.log(`Failed to switch backend: ${message}`);
    console.log("");
  }

  return { running: true, requiresPause: true };
}

async function exitAction(): Promise<MenuActionResult> {
  traceEvent({
    event: "command_parsed",
    source: "cli:menu",
    command: "Exit"
  });
  return { running: false, requiresPause: false };
}

export const MENU_ACTIONS: Record<string, MenuActionHandler> = {
  "1": showWatcherStatusAction,
  "Show Watcher Status": showWatcherStatusAction,
  "2": startWatcherAction,
  "Start Watcher": startWatcherAction,
  "3": stopWatcherAction,
  "Stop Watcher": stopWatcherAction,
  "4": restartWatcherAction,
  "Restart Watcher": restartWatcherAction,
  "5": showRecentJobsAction,
  "Show Recent Transcription Jobs": showRecentJobsAction,
  "6": openLatestTranscriptAction,
  "Open Latest Transcript": openLatestTranscriptAction,
  "7": switchBackendAction,
  "Switch Backend": switchBackendAction,
  "8": exitAction,
  Exit: exitAction
};
