import fs from "node:fs";
import path from "node:path";
import type { WatchConfiguration } from "../../domain/WatchConfiguration.js";
import { TranscriptionJobQueue } from "../../domain/TranscriptionJobQueue.js";
import type { Logger } from "../logging/Logger.js";
import type { TranscriptionJob } from "../../domain/TranscriptionJob.js";
import { TranscriptionJobState } from "../../domain/TranscriptionJob.js";
import type { AudioFile } from "../../domain/AudioFile.js";

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
    private readonly defaultLanguageHint: string | null
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

  private generateJobId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

