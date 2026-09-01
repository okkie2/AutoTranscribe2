#!/usr/bin/env node

import path from "node:path";
import { buildJsonStatusSnapshot } from "../application/JsonStatusSnapshot.js";
import { readSupervisorState } from "../application/ManagedWatcherSupervisorState.js";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import {
  getDefaultTranscriptionJobLedgerPath,
  TranscriptionJobLedger
} from "../infrastructure/jobs/TranscriptionJobLedger.js";
import { getDefaultStatusPath, readStatus } from "../infrastructure/status/RuntimeStatus.js";

function main(): void {
  let statusPath = getDefaultStatusPath();
  let supervisor = null;

  try {
    const config = loadConfig(path.join(process.cwd(), "config.yaml"));
    statusPath = config.runtimeStatusPath;
    supervisor = readSupervisorState(config);
  } catch {
    // A missing or invalid config still allows an honest snapshot of default runtime state.
  }

  const status = readStatus(statusPath);
  const jobs = new TranscriptionJobLedger(getDefaultTranscriptionJobLedgerPath(statusPath)).listRecords();
  console.log(JSON.stringify(buildJsonStatusSnapshot(status, supervisor, jobs)));
}

main();
