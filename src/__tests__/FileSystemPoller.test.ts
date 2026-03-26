import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { FileSystemPoller } from "../infrastructure/watcher/FileSystemPoller.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import type { Logger } from "../infrastructure/logging/Logger.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

test("FileSystemPoller does not rediscover the same audio file after restart when ledger exists", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-poller-"));
  const recordingsDir = path.join(rootDir, "recordings");
  const transcriptsDir = path.join(rootDir, "transcripts");
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.mkdirSync(transcriptsDir, { recursive: true });

  const audioPath = path.join(recordingsDir, "2026-03-16_16-00-00.m4a");
  fs.writeFileSync(audioPath, "fake audio", "utf8");

  const config = {
    enabled: true,
    directories: [recordingsDir],
    includeExtensions: [".m4a"],
    excludePatterns: [],
    pollingIntervalSeconds: 10,
    outputDirectory: transcriptsDir,
    mirrorSourceStructure: true
  };

  const firstQueue = new TranscriptionJobQueue();
  const firstPoller = new FileSystemPoller(config, firstQueue, logger, null);
  firstPoller.scanOnce();
  firstPoller.scanOnce();
  assert.equal(firstQueue.getLength(), 1);

  const secondQueue = new TranscriptionJobQueue();
  const restartedPoller = new FileSystemPoller(config, secondQueue, logger, null);
  restartedPoller.scanOnce();
  assert.equal(secondQueue.getLength(), 0);

  const ledgerPath = path.join(transcriptsDir, "discovered-audio-files.json");
  assert.equal(fs.existsSync(ledgerPath), true);
  const ledgerEntries = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as string[];
  assert.deepEqual(ledgerEntries, [path.resolve(audioPath)]);
});

test("FileSystemPoller waits for a file to remain unchanged across scans before enqueueing it", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-poller-stable-"));
  const recordingsDir = path.join(rootDir, "recordings");
  const transcriptsDir = path.join(rootDir, "transcripts");
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.mkdirSync(transcriptsDir, { recursive: true });

  const audioPath = path.join(recordingsDir, "2026-03-26_15-00-00.m4a");
  fs.writeFileSync(audioPath, "part-one", "utf8");

  const config = {
    enabled: true,
    directories: [recordingsDir],
    includeExtensions: [".m4a"],
    excludePatterns: [],
    pollingIntervalSeconds: 10,
    outputDirectory: transcriptsDir,
    mirrorSourceStructure: true
  };

  const queue = new TranscriptionJobQueue();
  const poller = new FileSystemPoller(config, queue, logger, null);

  poller.scanOnce();
  assert.equal(queue.getLength(), 0);

  fs.writeFileSync(audioPath, "part-two-with-more-bytes", "utf8");
  poller.scanOnce();
  assert.equal(queue.getLength(), 0);

  poller.scanOnce();
  assert.equal(queue.getLength(), 1);
});
