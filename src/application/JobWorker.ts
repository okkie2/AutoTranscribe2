import type { TranscriptionJob } from "../domain/TranscriptionJob.js";
import { TranscriptionJobState } from "../domain/TranscriptionJob.js";
import { TranscriptionJobQueue } from "../domain/TranscriptionJobQueue.js";
import type { Logger } from "../infrastructure/logging/Logger.js";
import { TranscriptionService } from "./TranscriptionService.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * JobWorker continuously pulls TranscriptionJob instances from a TranscriptionJobQueue
 * and processes them using the TranscriptionService.
 */
export class JobWorker {
  constructor(
    private readonly queue: TranscriptionJobQueue,
    private readonly service: TranscriptionService,
    private readonly logger: Logger
  ) {}

  /**
   * Start processing jobs until the given AbortSignal is aborted.
   */
  async start(signal: AbortSignal): Promise<void> {
    this.logger.info("JobWorker started");

    while (!signal.aborted) {
      const job = this.queue.dequeue();

      if (!job) {
        await delay(500);
        continue;
      }

      await this.processJob(job);
    }

    this.logger.info("JobWorker stopped");
  }

  private async processJob(job: TranscriptionJob): Promise<void> {
    const startedAt = new Date();
    job.state = TranscriptionJobState.InProgress;
    job.updatedAt = startedAt;

    this.logger.info("Processing transcription job", {
      jobId: job.id,
      audioFile: job.audioFile.path,
      targetTranscriptPath: job.targetTranscriptPath
    });

    try {
      await this.service.transcribeToPath(
        job.audioFile.path,
        job.targetTranscriptPath,
        job.languageHint ?? null
      );

      job.state = TranscriptionJobState.Completed;
      job.updatedAt = new Date();

      this.logger.info("Transcription job completed", {
        jobId: job.id,
        audioFile: job.audioFile.path,
        transcriptPath: job.targetTranscriptPath
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.state = TranscriptionJobState.Failed;
      job.updatedAt = new Date();
      job.errorMessage = message;

      this.logger.error("Transcription job failed", {
        jobId: job.id,
        audioFile: job.audioFile.path,
        error: message
      });
    }
  }
}

