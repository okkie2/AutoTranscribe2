import fs from "node:fs";
import path from "node:path";
import type { Logger } from "../logging/Logger.js";
import { TranscriptionJobState, type TranscriptionJob } from "../../domain/TranscriptionJob.js";
import { TranscriptionJobQueue } from "../../domain/TranscriptionJobQueue.js";

const JOB_LEDGER_FILENAME = "transcription-jobs.json";

interface PersistedTranscriptionJobRecord {
  id: string;
  audioFilePath: string;
  state: TranscriptionJobState;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  languageHint?: string | null;
  targetTranscriptPath: string;
}

function toPersistedRecord(job: TranscriptionJob): PersistedTranscriptionJobRecord {
  return {
    id: job.id,
    audioFilePath: job.audioFile.path,
    state: job.state,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    errorMessage: job.errorMessage,
    languageHint: job.languageHint ?? null,
    targetTranscriptPath: job.targetTranscriptPath
  };
}

function toTranscriptionJob(record: PersistedTranscriptionJobRecord): TranscriptionJob {
  const isRecoverable = [TranscriptionJobState.Pending, TranscriptionJobState.InProgress].includes(record.state);
  return {
    id: record.id,
    audioFile: { path: record.audioFilePath },
    state: isRecoverable ? TranscriptionJobState.Pending : record.state,
    createdAt: new Date(record.createdAt),
    updatedAt: isRecoverable ? new Date() : new Date(record.updatedAt),
    errorMessage: isRecoverable ? undefined : record.errorMessage,
    languageHint: record.languageHint ?? null,
    targetTranscriptPath: record.targetTranscriptPath
  };
}

export function getDefaultTranscriptionJobLedgerPath(runtimeStatusPath: string): string {
  return path.join(path.dirname(runtimeStatusPath), JOB_LEDGER_FILENAME);
}

export class TranscriptionJobLedger {
  constructor(private readonly ledgerPath: string) {}

  private readRecords(): PersistedTranscriptionJobRecord[] {
    try {
      if (!fs.existsSync(this.ledgerPath)) {
        return [];
      }

      const raw = fs.readFileSync(this.ledgerPath, "utf8");
      const parsed = JSON.parse(raw) as PersistedTranscriptionJobRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeRecords(records: PersistedTranscriptionJobRecord[]): void {
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.writeFileSync(this.ledgerPath, JSON.stringify(records, null, 2), "utf8");
  }

  record(job: TranscriptionJob): void {
    const records = this.readRecords();
    const next = toPersistedRecord(job);
    const existingIndex = records.findIndex((record) => record.id === job.id);

    if (existingIndex >= 0) {
      records[existingIndex] = next;
    } else {
      records.push(next);
    }

    records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    this.writeRecords(records);
  }

  hasClaimForAudioPath(audioFilePath: string): boolean {
    const resolvedAudioPath = path.resolve(audioFilePath);
    return this.readRecords().some((record) => path.resolve(record.audioFilePath) === resolvedAudioPath);
  }

  claimPendingJob(job: TranscriptionJob): boolean {
    const records = this.readRecords();
    const resolvedAudioPath = path.resolve(job.audioFile.path);

    const alreadyClaimed = records.some((record) => path.resolve(record.audioFilePath) === resolvedAudioPath);
    if (alreadyClaimed) {
      return false;
    }

    records.push(toPersistedRecord(job));
    records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    this.writeRecords(records);
    return true;
  }

  listRecords(): PersistedTranscriptionJobRecord[] {
    return this.readRecords();
  }

  loadRecoverableJobs(): TranscriptionJob[] {
    return this.readRecords()
      .filter((record) =>
        [TranscriptionJobState.Pending, TranscriptionJobState.InProgress].includes(record.state)
      )
      .map(toTranscriptionJob);
  }
}

export function rehydrateRecoverableJobs(
  queue: TranscriptionJobQueue,
  ledger: TranscriptionJobLedger,
  logger?: Logger
): number {
  const recoverableJobs = ledger.loadRecoverableJobs();
  for (const job of recoverableJobs) {
    queue.enqueue(job);
  }

  if (recoverableJobs.length > 0) {
    logger?.info("Recovered transcription jobs from durable ledger", {
      count: recoverableJobs.length,
      jobIds: recoverableJobs.map((job) => job.id)
    });
  }

  return recoverableJobs.length;
}
