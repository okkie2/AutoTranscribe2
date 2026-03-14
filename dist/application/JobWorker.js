import { TranscriptionJobState } from "../domain/TranscriptionJob.js";
import path from "node:path";
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * JobWorker continuously pulls TranscriptionJob instances from a TranscriptionJobQueue
 * and processes them using the TranscriptionService.
 */
export class JobWorker {
    constructor(queue, service, logger, statusUpdater) {
        this.queue = queue;
        this.service = service;
        this.logger = logger;
        this.statusUpdater = statusUpdater;
    }
    /**
     * Start processing jobs until the given AbortSignal is aborted.
     */
    async start(signal) {
        this.logger.info("JobWorker started");
        while (!signal.aborted) {
            const job = this.queue.dequeue();
            if (!job) {
                await delay(500);
                continue;
            }
            this.statusUpdater?.({
                state: "processing",
                currentFile: path.basename(job.audioFile.path),
                queueLength: this.queue.getLength(),
                lastError: null
            });
            await this.processJob(job);
        }
        this.logger.info("JobWorker stopped");
    }
    async processJob(job) {
        const startedAt = new Date();
        job.state = TranscriptionJobState.InProgress;
        job.updatedAt = startedAt;
        this.logger.info("Processing transcription job", {
            jobId: job.id,
            audioFile: job.audioFile.path,
            targetTranscriptPath: job.targetTranscriptPath
        });
        try {
            const outputDir = path.dirname(job.targetTranscriptPath);
            const originalBaseName = path.basename(job.audioFile.path, path.extname(job.audioFile.path));
            const transcriptPath = await this.service.transcribeToDirectory(job.audioFile.path, outputDir, originalBaseName, job.languageHint ?? null);
            job.state = TranscriptionJobState.Completed;
            job.updatedAt = new Date();
            job.targetTranscriptPath = transcriptPath;
            this.logger.info("Transcription job completed", {
                jobId: job.id,
                audioFile: job.audioFile.path,
                transcriptPath
            });
            this.statusUpdater?.({
                state: "idle",
                currentFile: null,
                queueLength: this.queue.getLength(),
                lastError: null
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            job.state = TranscriptionJobState.Failed;
            job.updatedAt = new Date();
            job.errorMessage = message;
            this.logger.error("Transcription job failed", {
                jobId: job.id,
                audioFile: job.audioFile.path,
                error: message
            });
            this.statusUpdater?.({
                state: "error",
                currentFile: null,
                queueLength: this.queue.getLength(),
                lastError: message
            });
        }
    }
}
