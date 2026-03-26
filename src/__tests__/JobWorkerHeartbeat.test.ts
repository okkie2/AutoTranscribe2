import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { JobWorker } from "../application/JobWorker.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import { TranscriptionJobState, type TranscriptionJob } from "../domain/TranscriptionJob.js";
import { createStatusUpdater, readStatus } from "../infrastructure/status/RuntimeStatus.js";
import { getStatusFreshness } from "../cli/StatusDashboard.js";
import type { Logger } from "../infrastructure/logging/Logger.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("JobWorker writes heartbeats while a transcription job is still running", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-heartbeat-"));
  const statusPath = path.join(rootDir, "runtime", "status.json");
  const outputDir = path.join(rootDir, "transcripts");
  const audioPath = path.join(rootDir, "recordings", "sample.m4a");
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.writeFileSync(audioPath, "fake-audio", "utf8");

  const queue = new TranscriptionJobQueue();
  const job: TranscriptionJob = {
    id: "job-1",
    audioFile: { path: audioPath },
    state: TranscriptionJobState.Pending,
    createdAt: new Date(),
    updatedAt: new Date(),
    targetTranscriptPath: path.join(outputDir, "sample.md")
  };
  queue.enqueue(job);

  const service = {
    async transcribeToDirectory(): Promise<string> {
      await delay(220);
      fs.mkdirSync(outputDir, { recursive: true });
      const transcriptPath = path.join(outputDir, "sample_title.md");
      fs.writeFileSync(transcriptPath, "# transcript\n", "utf8");
      return transcriptPath;
    }
  };

  const worker = new JobWorker(
    queue,
    service as never,
    logger,
    createStatusUpdater(statusPath),
    { heartbeatIntervalMs: 25, idlePollIntervalMs: 10 }
  );

  const controller = new AbortController();
  const workerPromise = worker.start(controller.signal);

  await delay(120);

  const inFlightStatus = readStatus(statusPath);
  assert.ok(inFlightStatus);
  assert.equal(inFlightStatus?.runtimeActivityState, "processingTranscription");
  assert.equal(inFlightStatus?.currentJobId, "job-1");
  assert.ok(inFlightStatus?.lastHeartbeatAt);
  assert.equal(getStatusFreshness(inFlightStatus ?? null, 80), "fresh");

  await delay(180);
  controller.abort();
  await workerPromise;

  const finalStatus = readStatus(statusPath);
  assert.ok(finalStatus);
  assert.equal(finalStatus?.runtimeActivityState, "completed");
  assert.equal(finalStatus?.currentPhaseDetail, "sample_title.md");
});

test("JobWorker reports draining while finishing the current transcription job after stop is requested", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-draining-"));
  const statusPath = path.join(rootDir, "runtime", "status.json");
  const outputDir = path.join(rootDir, "transcripts");
  const audioPath = path.join(rootDir, "recordings", "sample.m4a");
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  fs.writeFileSync(audioPath, "fake-audio", "utf8");

  const queue = new TranscriptionJobQueue();
  queue.enqueue({
    id: "job-drain",
    audioFile: { path: audioPath },
    state: TranscriptionJobState.Pending,
    createdAt: new Date(),
    updatedAt: new Date(),
    targetTranscriptPath: path.join(outputDir, "sample.md")
  });

  const service = {
    async transcribeToDirectory(): Promise<string> {
      await delay(220);
      fs.mkdirSync(outputDir, { recursive: true });
      const transcriptPath = path.join(outputDir, "sample_title.md");
      fs.writeFileSync(transcriptPath, "# transcript\n", "utf8");
      return transcriptPath;
    }
  };

  const worker = new JobWorker(
    queue,
    service as never,
    logger,
    createStatusUpdater(statusPath),
    { heartbeatIntervalMs: 25, idlePollIntervalMs: 10 }
  );

  const controller = new AbortController();
  const workerPromise = worker.start(controller.signal);
  await delay(80);
  controller.abort();
  await delay(60);

  const drainingStatus = readStatus(statusPath);
  assert.ok(drainingStatus);
  assert.equal(drainingStatus?.runtimeActivityState, "draining");
  assert.match(drainingStatus?.currentPhaseDetail ?? "", /stop requested/);

  await workerPromise;

  const finalStatus = readStatus(statusPath);
  assert.ok(finalStatus);
  assert.equal(finalStatus?.runtimeActivityState, "completed");
});
