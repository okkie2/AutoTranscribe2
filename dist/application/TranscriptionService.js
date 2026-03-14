import fs from "node:fs";
import path from "node:path";
import { formatTranscriptWithTitle } from "./TranscriptTitleFormatter.js";
/**
 * TranscriptionService exposes high-level operations for transcribing audio.
 * Transcripts are produced by the watcher: JobWorker pulls jobs from the queue
 * and calls transcribeToDirectory for each.
 */
export class TranscriptionService {
    constructor(backend, logger, titleSuggester, titleConfig) {
        this.backend = backend;
        this.logger = logger;
        this.titleSuggester = titleSuggester;
        this.titleConfig = titleConfig;
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
        const backendContent = transcript.content;
        // Allow backends to return either plain text or a JSON object with both
        // the raw text and a formatted Markdown body with timestamps and paragraphs.
        let rawText = backendContent;
        let formattedBody = backendContent;
        try {
            const parsed = JSON.parse(backendContent);
            if (parsed && typeof parsed.text === "string" && parsed.text.trim().length > 0) {
                rawText = parsed.text;
            }
            if (parsed && typeof parsed.formatted_markdown === "string" && parsed.formatted_markdown.trim().length > 0) {
                formattedBody = parsed.formatted_markdown;
            }
        }
        catch {
            // Not JSON; treat content as plain text.
        }
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
        const { finalContent, finalFileName, title } = formatTranscriptWithTitle(formattedBody, suggestedTitle, originalBaseName);
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
