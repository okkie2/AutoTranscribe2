import fs from "node:fs";
import path from "node:path";
import type { AudioFile } from "../domain/AudioFile.js";
import type { TranscriptionBackend } from "../infrastructure/backend/TranscriptionBackend.js";
import type { Logger } from "../infrastructure/logging/Logger.js";

/**
 * TranscriptionService exposes high-level operations for transcribing audio.
 * For the MVP we focus on single-file transcription initiated from the CLI
 * and jobs processed by the watcher.
 */
export class TranscriptionService {
  constructor(
    private readonly backend: TranscriptionBackend,
    private readonly logger: Logger,
    private readonly defaultOutputDirectory: string
  ) {}

  /**
   * Transcribe a single audio file path and write the transcript to a .md file
   * in the default output directory.
   *
   * Returns the path to the written transcript file.
   */
  async transcribeSingle(audioFilePath: string, options?: { languageHint?: string | null }): Promise<string> {
    const audioFile: AudioFile = { path: path.resolve(audioFilePath) };

    const baseName = path.basename(audioFile.path, path.extname(audioFile.path));
    const targetTranscriptPath = path.join(
      path.resolve(this.defaultOutputDirectory),
      `${baseName}.md`
    );

    await this.transcribeToPath(audioFile.path, targetTranscriptPath, options?.languageHint ?? null);

    return targetTranscriptPath;
  }

  /**
   * Transcribe the given audio file path and write the transcript to the
   * specified target path. This is used both by the CLI single-file flow and
   * by the JobWorker in watcher mode.
   */
  async transcribeToPath(
    audioFilePath: string,
    targetTranscriptPath: string,
    languageHint: string | null
  ): Promise<void> {
    const audioFile: AudioFile = { path: path.resolve(audioFilePath) };
    const resolvedTarget = path.resolve(targetTranscriptPath);

    this.logger.info("Starting transcription job", {
      audioFile: audioFile.path,
      targetTranscriptPath: resolvedTarget
    });

    const transcript = await this.backend.transcribe(audioFile, {
      languageHint
    });

    const outputDir = path.dirname(resolvedTarget);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(resolvedTarget, transcript.content, { encoding: "utf8" });

    this.logger.info("Finished transcription job", {
      audioFile: audioFile.path,
      transcriptPath: resolvedTarget
    });
  }
}

