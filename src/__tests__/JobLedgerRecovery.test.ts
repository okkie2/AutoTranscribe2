import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { JobWorker } from "../application/JobWorker.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { createStatusUpdater } from "../infrastructure/status/RuntimeStatus.js";
import type { Logger } from "../infrastructure/logging/Logger.js";
import type { TranscriptionBackend } from "../infrastructure/backend/TranscriptionBackend.js";
import type { TitleSuggester } from "../application/TitleSuggester.js";
import {
  TranscriptionJobLedger,
  rehydrateRecoverableJobs
} from "../infrastructure/jobs/TranscriptionJobLedger.js";
import { TranscriptionJobState } from "../domain/TranscriptionJob.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await delay(20);
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}

test("queued transcription jobs are recovered from the durable ledger after restart", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-job-ledger-"));
  const recordingsDir = path.join(rootDir, "recordings");
  const transcriptsDir = path.join(rootDir, "transcripts");
  const runtimeDir = path.join(rootDir, "runtime");
  const statusPath = path.join(runtimeDir, "status.json");
  const ledgerPath = path.join(runtimeDir, "transcription-jobs.json");
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const audioPath = path.join(recordingsDir, "2026-03-27_10-30-00.m4a");
  fs.writeFileSync(audioPath, "fake audio payload", "utf8");

  const ledger = new TranscriptionJobLedger(ledgerPath);
  const initialQueue = new TranscriptionJobQueue();
  const poller = new FileSystemPoller(
    {
      enabled: true,
      directories: [recordingsDir],
      includeExtensions: [".m4a"],
      excludePatterns: [],
      pollingIntervalSeconds: 1,
      outputDirectory: transcriptsDir,
      mirrorSourceStructure: true
    },
    initialQueue,
    logger,
    null,
    createStatusUpdater(statusPath),
    ledger
  );

  poller.scanOnce();
  poller.scanOnce();
  assert.equal(initialQueue.getLength(), 1);
  assert.equal(ledger.listRecords().length, 1);
  assert.equal(ledger.listRecords()[0]?.state, "pending");

  const recoveredQueue = new TranscriptionJobQueue();
  const recoveredCount = rehydrateRecoverableJobs(recoveredQueue, ledger, logger);
  assert.equal(recoveredCount, 1);
  assert.equal(recoveredQueue.getLength(), 1);

  const backend: TranscriptionBackend = {
    async transcribe() {
      return {
        path: "",
        content: JSON.stringify({
          text: "Recovered transcript body",
          formatted_markdown: "**[00:00] Recovery**\nRecovered transcript body.",
          language: "en"
        })
      };
    }
  };
  const titleSuggester: TitleSuggester = {
    async suggestTitle() {
      return "Recovered title";
    }
  };
  const service = new TranscriptionService(backend, logger, titleSuggester, {
    enabled: true,
    provider: "heuristic",
    maxLength: 80,
    maxWords: 5,
    languageHint: null
  });
  const worker = new JobWorker(
    recoveredQueue,
    service,
    logger,
    createStatusUpdater(statusPath),
    { idlePollIntervalMs: 10, heartbeatIntervalMs: 25, jobLedger: ledger }
  );

  const controller = new AbortController();
  const workerPromise = worker.start(controller.signal);
  const expectedTranscriptPath = path.join(
    transcriptsDir,
    "2026-03-27_10-30-00_recovered-title.md"
  );

  await waitForCondition(() => fs.existsSync(expectedTranscriptPath), 1000);
  controller.abort();
  await workerPromise;

  const records = ledger.listRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.state, "completed");
  assert.equal(records[0]?.targetTranscriptPath, expectedTranscriptPath);
});

test("in-progress jobs are rehydrated as pending work after restart", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-job-ledger-inprogress-"));
  const ledgerPath = path.join(rootDir, "runtime", "transcription-jobs.json");
  const previousUpdatedAt = new Date(Date.now() - 60_000);
  const ledger = new TranscriptionJobLedger(ledgerPath);

  ledger.record({
    id: "job-in-progress",
    audioFile: { path: "/tmp/recover-me.m4a" },
    state: TranscriptionJobState.InProgress,
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: previousUpdatedAt,
    targetTranscriptPath: "/tmp/recover-me.md",
    languageHint: null
  });

  const queue = new TranscriptionJobQueue();
  const recoveredCount = rehydrateRecoverableJobs(queue, ledger, logger);
  assert.equal(recoveredCount, 1);

  const recoveredJob = queue.dequeue();
  assert.ok(recoveredJob);
  assert.equal(recoveredJob?.state, TranscriptionJobState.Pending);
  assert.ok(recoveredJob!.updatedAt.getTime() > previousUpdatedAt.getTime());
  assert.equal(recoveredJob?.errorMessage, undefined);
});

test("durable pending job claims prevent rediscovery after restart even without the discovery ledger", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-job-claim-restart-"));
  const recordingsDir = path.join(rootDir, "recordings");
  const transcriptsDir = path.join(rootDir, "transcripts");
  const runtimeDir = path.join(rootDir, "runtime");
  const statusPath = path.join(runtimeDir, "status.json");
  const ledgerPath = path.join(runtimeDir, "transcription-jobs.json");
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const audioPath = path.join(recordingsDir, "2026-03-27_11-30-00.m4a");
  fs.writeFileSync(audioPath, "fake audio payload", "utf8");

  const ledger = new TranscriptionJobLedger(ledgerPath);
  const initialQueue = new TranscriptionJobQueue();
  const firstPoller = new FileSystemPoller(
    {
      enabled: true,
      directories: [recordingsDir],
      includeExtensions: [".m4a"],
      excludePatterns: [],
      pollingIntervalSeconds: 1,
      outputDirectory: transcriptsDir,
      mirrorSourceStructure: true
    },
    initialQueue,
    logger,
    null,
    createStatusUpdater(statusPath),
    ledger
  );

  firstPoller.scanOnce();
  firstPoller.scanOnce();
  assert.equal(initialQueue.getLength(), 1);
  assert.equal(ledger.listRecords().length, 1);

  const legacyDiscoveryLedgerPath = path.join(transcriptsDir, "discovered-audio-files.json");
  try {
    fs.unlinkSync(legacyDiscoveryLedgerPath);
  } catch {
    // ignore
  }

  const restartedQueue = new TranscriptionJobQueue();
  const restartedPoller = new FileSystemPoller(
    {
      enabled: true,
      directories: [recordingsDir],
      includeExtensions: [".m4a"],
      excludePatterns: [],
      pollingIntervalSeconds: 1,
      outputDirectory: transcriptsDir,
      mirrorSourceStructure: true
    },
    restartedQueue,
    logger,
    null,
    createStatusUpdater(statusPath),
    ledger
  );

  restartedPoller.scanOnce();
  restartedPoller.scanOnce();

  assert.equal(restartedQueue.getLength(), 0);
  assert.equal(ledger.listRecords().length, 1);
});
