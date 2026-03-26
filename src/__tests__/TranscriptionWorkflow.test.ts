import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { JobWorker } from "../application/JobWorker.js";
import { TranscriptionService } from "../application/TranscriptionService.js";
import { createStatusUpdater, readStatus } from "../infrastructure/status/RuntimeStatus.js";
import type { Logger } from "../infrastructure/logging/Logger.js";
import type { TranscriptionBackend } from "../infrastructure/backend/TranscriptionBackend.js";
import type { TitleSuggester } from "../application/TitleSuggester.js";

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

test("watcher pipeline writes a timestamped transcript with a meaningful titled filename", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-workflow-"));
  const recordingsDir = path.join(rootDir, "recordings");
  const transcriptsDir = path.join(rootDir, "transcripts");
  const runtimeStatusPath = path.join(rootDir, "runtime", "status.json");
  fs.mkdirSync(recordingsDir, { recursive: true });

  const audioPath = path.join(recordingsDir, "2026-03-27_09-15-00.m4a");
  fs.writeFileSync(audioPath, "fake audio payload", "utf8");

  const backend: TranscriptionBackend = {
    async transcribe() {
      return {
        path: "",
        content: JSON.stringify({
          text: "Things to do tomorrow. Buy milk. Email Sally. Call the garage. Water the plants.",
          formatted_markdown: `# Things to do tomorrow

**[00:00] Groceries**
Buy milk, eggs, and coffee.

**[00:12] Work**
Email Sally about the project timeline and schedule a short meeting.

**[00:25] Personal**
Call the garage to ask if the car is ready.

**[00:36] House**
Remember to water the plants and take out the recycling.`,
          language: "en"
        })
      };
    }
  };

  const titleSuggester: TitleSuggester = {
    async suggestTitle() {
      return "Things to do tomorrow";
    }
  };

  const service = new TranscriptionService(backend, logger, titleSuggester, {
    enabled: true,
    provider: "heuristic",
    maxLength: 80,
    maxWords: 5,
    languageHint: null
  });

  const queue = new TranscriptionJobQueue();
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
    queue,
    logger,
    null,
    createStatusUpdater(runtimeStatusPath)
  );

  poller.scanOnce();
  assert.equal(queue.getLength(), 0);
  poller.scanOnce();
  assert.equal(queue.getLength(), 1);

  const worker = new JobWorker(
    queue,
    service,
    logger,
    createStatusUpdater(runtimeStatusPath),
    { heartbeatIntervalMs: 25, idlePollIntervalMs: 10 }
  );
  const controller = new AbortController();
  const workerPromise = worker.start(controller.signal);

  const transcriptPath = path.join(
    transcriptsDir,
    "2026-03-27_09-15-00_things-to-do-tomorrow.md"
  );
  await waitForCondition(() => fs.existsSync(transcriptPath), 1000);

  controller.abort();
  await workerPromise;

  const transcript = fs.readFileSync(transcriptPath, "utf8");
  assert.match(transcript, /^# Things to do tomorrow/m);
  assert.match(transcript, /\*\*\[00:00\] Groceries\*\*/);
  assert.match(transcript, /\*\*\[00:12\] Work\*\*/);
  assert.match(transcript, /\*\*\[00:25\] Personal\*\*/);
  assert.match(transcript, /\*\*\[00:36\] House\*\*/);

  const finalStatus = readStatus(runtimeStatusPath);
  assert.ok(finalStatus);
  assert.equal(finalStatus?.runtimeActivityState, "completed");
  assert.equal(finalStatus?.currentPhaseDetail, "2026-03-27_09-15-00_things-to-do-tomorrow.md");
});
