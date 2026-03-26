import fs from "node:fs";
import path from "node:path";
import { TranscriptionJobState } from "../../domain/TranscriptionJob.js";
const JOB_LEDGER_FILENAME = "transcription-jobs.json";
function toPersistedRecord(job) {
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
function toTranscriptionJob(record) {
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
export function getDefaultTranscriptionJobLedgerPath(runtimeStatusPath) {
    return path.join(path.dirname(runtimeStatusPath), JOB_LEDGER_FILENAME);
}
export class TranscriptionJobLedger {
    constructor(ledgerPath) {
        this.ledgerPath = ledgerPath;
    }
    readRecords() {
        try {
            if (!fs.existsSync(this.ledgerPath)) {
                return [];
            }
            const raw = fs.readFileSync(this.ledgerPath, "utf8");
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            return [];
        }
    }
    writeRecords(records) {
        fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
        fs.writeFileSync(this.ledgerPath, JSON.stringify(records, null, 2), "utf8");
    }
    record(job) {
        const records = this.readRecords();
        const next = toPersistedRecord(job);
        const existingIndex = records.findIndex((record) => record.id === job.id);
        if (existingIndex >= 0) {
            records[existingIndex] = next;
        }
        else {
            records.push(next);
        }
        records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        this.writeRecords(records);
    }
    listRecords() {
        return this.readRecords();
    }
    loadRecoverableJobs() {
        return this.readRecords()
            .filter((record) => [TranscriptionJobState.Pending, TranscriptionJobState.InProgress].includes(record.state))
            .map(toTranscriptionJob);
    }
}
export function rehydrateRecoverableJobs(queue, ledger, logger) {
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
