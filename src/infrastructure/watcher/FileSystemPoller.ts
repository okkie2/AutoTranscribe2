import fs from "node:fs";
import path from "node:path";
import type { WatchConfiguration } from "../../domain/WatchConfiguration.js";
import { TranscriptionJobQueue } from "../../domain/TranscriptionJobQueue.js";
import type { Logger } from "../logging/Logger.js";
import type { TranscriptionJob } from "../../domain/TranscriptionJob.js";
import { TranscriptionJobState } from "../../domain/TranscriptionJob.js";
import type { AudioFile } from "../../domain/AudioFile.js";
import type { RuntimeStatus } from "../status/RuntimeStatus.js";
import { traceEvent } from "../tracing/TraceLogger.js";

type StatusUpdater = (partial: Partial<Omit<RuntimeStatus, "updatedAt">>) => void;

/**
 * FileSystemPoller scans configured directories for new audio files and
 * enqueues TranscriptionJob instances into a TranscriptionJobQueue.
 *
 * It tracks seen files in-memory for the lifetime of the process.
 */
export class FileSystemPoller {
  private readonly seenFiles = new Set<string>();

  constructor(
    private readonly config: WatchConfiguration,
    private readonly queue: TranscriptionJobQueue,
    private readonly logger: Logger,
    private readonly defaultLanguageHint: string | null,
    private readonly statusUpdater?: StatusUpdater
  ) {}

  /**
   * Perform a single scan of all configured directories.
   */
  scanOnce(): void {
    if (!this.config.enabled) {
      return;
    }

    for (const dir of this.config.directories) {
      const root = path.resolve(dir);
      if (!fs.existsSync(root)) {
        this.logger.info("Creating missing watch directory", { directory: root });
        fs.mkdirSync(root, { recursive: true });
      } else if (!fs.statSync(root).isDirectory()) {
        this.logger.warn("Watch path exists but is not a directory; skipping", { directory: root });
        continue;
      }
      this.scanDirectory(root, root);
    }
  }

  private getFileMetadata(filePath: string): Record<string, unknown> {
    try {
      const stat = fs.statSync(filePath);
      return {
        path: filePath,
        size: stat.size,
        mtime: stat.mtime.toISOString()
      };
    } catch {
      return { path: filePath };
    }
  }

  private scanDirectory(rootDir: string, currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(rootDir, fullPath);
        continue;
      }

      if (!this.isIncluded(fullPath)) {
        continue;
      }

      const resolved = path.resolve(fullPath);
      if (this.seenFiles.has(resolved)) {
        traceEvent({
          event: "transcript_duplicate_ignored",
          source: "FileSystemPoller",
          metadata: {
            reason: "already_seen_in_this_process",
            ...this.getFileMetadata(resolved)
          }
        });
        continue;
      }

      if (this.transcriptAlreadyExists(rootDir, resolved)) {
        this.logger.info("Skipping audio file because transcript already exists", {
          audioFile: resolved
        });
        traceEvent({
          event: "transcript_duplicate_ignored",
          source: "FileSystemPoller",
          metadata: {
            reason: "transcript_already_exists",
            ...this.getFileMetadata(resolved)
          }
        });
        this.seenFiles.add(resolved);
        continue;
      }

      this.seenFiles.add(resolved);

      const audioFile: AudioFile = { path: resolved };
      const targetTranscriptPath = this.computeTargetTranscriptPath(rootDir, resolved);

      const job: TranscriptionJob = {
        id: this.generateJobId(),
        audioFile,
        state: TranscriptionJobState.Pending,
        createdAt: new Date(),
        updatedAt: new Date(),
        languageHint: this.defaultLanguageHint,
        targetTranscriptPath
      };

      this.logger.info("Enqueuing transcription job for discovered audio file", {
        jobId: job.id,
        audioFile: job.audioFile.path,
        targetTranscriptPath: job.targetTranscriptPath
      });
      traceEvent({
        event: "transcript_detected",
        source: "FileSystemPoller",
        metadata: {
          jobId: job.id,
          targetTranscriptPath: job.targetTranscriptPath,
          ...this.getFileMetadata(job.audioFile.path)
        }
      });

      this.statusUpdater?.({
        runtimeActivityState: "enqueuingJob",
        queueLength: this.queue.getLength() + 1,
        currentFile: path.basename(job.audioFile.path),
        currentJobId: job.id,
        currentPhaseDetail: "watch enqueue",
        lastError: null
      });
      this.queue.enqueue(job);
    }
  }

  private isIncluded(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.config.includeExtensions.map((e) => e.toLowerCase()).includes(ext)) {
      return false;
    }

    const normalizedPath = filePath.replace(/\\/g, "/");
    for (const pattern of this.config.excludePatterns) {
      if (normalizedPath.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  private computeTargetTranscriptPath(rootDir: string, audioFilePath: string): string {
    const outputRoot = path.resolve(this.config.outputDirectory);

    if (this.config.mirrorSourceStructure) {
      const relative = path.relative(rootDir, audioFilePath);
      const withoutExt = relative.slice(0, -path.extname(relative).length);
      return path.join(outputRoot, `${withoutExt}.md`);
    }

    const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
    return path.join(outputRoot, `${baseName}.md`);
  }

  /**
   * Check whether a transcript already exists for the given audio file.
   * We look for any .md file in the expected transcript directory whose
   * name starts with the audio timestamp (base name) plus an underscore,
   * or exactly equals the timestamp.
   */
  private transcriptAlreadyExists(rootDir: string, audioFilePath: string): boolean {
    try {
      const outputRoot = path.resolve(this.config.outputDirectory);
      const baseName = path.basename(audioFilePath, path.extname(audioFilePath));

      let transcriptDir = outputRoot;
      if (this.config.mirrorSourceStructure) {
        const relative = path.relative(rootDir, audioFilePath);
        const dirPart = path.dirname(relative);
        transcriptDir = path.join(outputRoot, dirPart);
      }

      if (!fs.existsSync(transcriptDir) || !fs.statSync(transcriptDir).isDirectory()) {
        return false;
      }

      const entries = fs.readdirSync(transcriptDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith(".md")) continue;
        if (entry.name === `${baseName}.md` || entry.name.startsWith(`${baseName}_`)) {
          return true;
        }
      }
    } catch {
      // On any error, fall back to "not existing" so we don't miss work.
    }

    return false;
  }

  private generateJobId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
