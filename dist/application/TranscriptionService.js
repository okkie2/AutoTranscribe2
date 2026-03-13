import fs from "node:fs";
import path from "node:path";
import { formatTranscriptWithTitle } from "./TranscriptTitleFormatter.js";
/**
 * TranscriptionService exposes high-level operations for transcribing audio.
 * For the MVP we focus on single-file transcription initiated from the CLI
 * and jobs processed by the watcher.
 */
export class TranscriptionService {
    constructor(backend, logger, defaultOutputDirectory, titleSuggester, titleConfig) {
        this.backend = backend;
        this.logger = logger;
        this.defaultOutputDirectory = defaultOutputDirectory;
        this.titleSuggester = titleSuggester;
        this.titleConfig = titleConfig;
    }
    /**
     * Transcribe a single audio file path and write the transcript to a .md file
     * in the default output directory.
     *
     * Returns the path to the written transcript file.
     */
    async transcribeSingle(audioFilePath, options) {
        const audioFile = { path: path.resolve(audioFilePath) };
        const baseName = path.basename(audioFile.path, path.extname(audioFile.path));
        const outputDir = path.resolve(this.defaultOutputDirectory);
        return await this.transcribeToDirectory(audioFile.path, outputDir, baseName, options?.languageHint ?? null);
    }
    /**
     * Transcribe the given audio file path and write a titled Markdown transcript
     * into the given directory. The filename will be derived from:
     * - originalBaseName (timestamp)
     * - suggested title (or Untitled fallback)
     *
     * Returns the full path to the written transcript file.
     */
    async transcribeToDirectory(audioFilePath, outputDirectory, originalBaseName, languageHint) {
        const audioFile = { path: path.resolve(audioFilePath) };
        const resolvedOutputDir = path.resolve(outputDirectory);
        this.logger.info("Starting transcription job", {
            audioFile: audioFile.path,
            outputDirectory: resolvedOutputDir
        });
        const transcript = await this.backend.transcribe(audioFile, {
            languageHint
        });
        if (!fs.existsSync(resolvedOutputDir)) {
            fs.mkdirSync(resolvedOutputDir, { recursive: true });
        }
        const rawText = transcript.content;
        let suggestedTitle = "";
        if (this.titleConfig.enabled && this.titleConfig.provider !== "none") {
            try {
                suggestedTitle = await this.titleSuggester.suggestTitle({
                    transcriptText: rawText,
                    fallbackTitle: originalBaseName,
                    languageHint: this.titleConfig.languageHint,
                    maxWords: this.titleConfig.maxWords
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.warn("Title suggestion failed; falling back to Untitled", { error: message });
                suggestedTitle = "";
            }
        }
        const { finalContent, finalFileName, title } = formatTranscriptWithTitle(rawText, suggestedTitle, originalBaseName);
        const resolvedTarget = path.join(resolvedOutputDir, finalFileName);
        fs.writeFileSync(resolvedTarget, finalContent, { encoding: "utf8" });
        this.logger.info("Finished transcription job", {
            audioFile: audioFile.path,
            transcriptPath: resolvedTarget,
            title
        });
        return resolvedTarget;
    }
}
