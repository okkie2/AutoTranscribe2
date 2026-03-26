import fs from "node:fs";
import path from "node:path";
import { formatTranscriptWithTitle } from "./TranscriptTitleFormatter.js";
const FALLBACK_LANGUAGES = ["nl", "en"];
const DUTCH_STOPWORDS = new Set([
    "de", "het", "een", "en", "ik", "je", "jij", "we", "wij", "van", "dat", "die", "in", "is", "op",
    "te", "niet", "met", "voor", "maar", "om", "wat", "er", "als", "dan", "ja", "nog", "ook", "heb",
    "hebt", "hebben", "zijn", "was", "waren", "dit", "dus", "wel", "aan", "bij", "naar", "hoe", "gaat"
]);
const ENGLISH_STOPWORDS = new Set([
    "the", "and", "a", "an", "i", "you", "we", "they", "it", "is", "are", "to", "of", "in", "that",
    "for", "on", "with", "this", "was", "were", "be", "have", "has", "do", "does", "not", "but", "so",
    "what", "how", "can", "will", "okay", "yes", "no", "about", "my", "your", "our"
]);
function parseBackendTranscript(backendContent) {
    let rawText = backendContent;
    let formattedBody = backendContent;
    let detectedLanguage = null;
    try {
        const parsed = JSON.parse(backendContent);
        if (parsed && typeof parsed.text === "string" && parsed.text.trim().length > 0) {
            rawText = parsed.text;
        }
        if (parsed && typeof parsed.formatted_markdown === "string" && parsed.formatted_markdown.trim().length > 0) {
            formattedBody = parsed.formatted_markdown;
        }
        if (parsed && typeof parsed.language === "string" && parsed.language.trim().length > 0) {
            detectedLanguage = parsed.language.trim().toLowerCase();
        }
    }
    catch {
        // Not JSON; treat content as plain text.
    }
    return {
        rawText,
        formattedBody,
        detectedLanguage
    };
}
function tokenizeWords(text) {
    const matches = text.toLowerCase().match(/\p{L}+/gu);
    return matches ?? [];
}
function computeLongestRepeatedRun(tokens) {
    if (tokens.length === 0) {
        return 0;
    }
    let longestRun = 1;
    let currentRun = 1;
    for (let i = 1; i < tokens.length; i += 1) {
        if (tokens[i] === tokens[i - 1]) {
            currentRun += 1;
            longestRun = Math.max(longestRun, currentRun);
        }
        else {
            currentRun = 1;
        }
    }
    return longestRun;
}
function computeRepeatedTrigramRatio(tokens) {
    if (tokens.length < 6) {
        return 0;
    }
    const seen = new Map();
    for (let i = 0; i <= tokens.length - 3; i += 1) {
        const trigram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
        seen.set(trigram, (seen.get(trigram) ?? 0) + 1);
    }
    let repeated = 0;
    for (const count of seen.values()) {
        if (count > 1) {
            repeated += count - 1;
        }
    }
    return repeated / Math.max(1, tokens.length - 2);
}
function computeStopwordRatio(tokens, language) {
    if (tokens.length === 0) {
        return 0;
    }
    const stopwords = language === "nl" ? DUTCH_STOPWORDS : ENGLISH_STOPWORDS;
    const hits = tokens.filter((token) => stopwords.has(token)).length;
    return hits / tokens.length;
}
function scoreTranscriptText(text, preferredLanguage) {
    const tokens = tokenizeWords(text);
    if (tokens.length === 0) {
        return Number.NEGATIVE_INFINITY;
    }
    const uniqueRatio = new Set(tokens).size / tokens.length;
    const longestRun = computeLongestRepeatedRun(tokens);
    const repeatedTrigramRatio = computeRepeatedTrigramRatio(tokens);
    const stopwordRatio = computeStopwordRatio(tokens, preferredLanguage);
    return (Math.min(tokens.length, 400) * 0.03 +
        stopwordRatio * 60 +
        uniqueRatio * 18 -
        Math.max(0, longestRun - 2) * 5 -
        repeatedTrigramRatio * 120);
}
function bestLanguageAgnosticScore(text) {
    return Math.max(scoreTranscriptText(text, "nl"), scoreTranscriptText(text, "en"));
}
function shouldRetryWithLanguageFallback(text) {
    const tokens = tokenizeWords(text);
    if (tokens.length < 12) {
        return false;
    }
    const longestRun = computeLongestRepeatedRun(tokens);
    const repeatedTrigramRatio = computeRepeatedTrigramRatio(tokens);
    const uniqueRatio = new Set(tokens).size / tokens.length;
    const bestStopwordRatio = Math.max(computeStopwordRatio(tokens, "nl"), computeStopwordRatio(tokens, "en"));
    return (longestRun >= 4 ||
        repeatedTrigramRatio >= 0.02 ||
        uniqueRatio < 0.55 ||
        bestStopwordRatio < 0.06);
}
/**
 * TranscriptionService exposes high-level operations for transcribing audio.
 * Transcripts are produced by the watcher: JobWorker pulls jobs from the queue
 * and calls transcribeToDirectory for each.
 */
export class TranscriptionService {
    constructor(backend, logger, titleSuggester, titleConfig, updateTitleProviderStatus) {
        this.backend = backend;
        this.logger = logger;
        this.titleSuggester = titleSuggester;
        this.titleConfig = titleConfig;
        this.updateTitleProviderStatus = updateTitleProviderStatus;
    }
    async transcribeVariant(audioFile, languageHint) {
        const transcript = await this.backend.transcribe(audioFile, {
            languageHint
        });
        const parsed = parseBackendTranscript(transcript.content);
        return {
            languageHint,
            parsed,
            score: bestLanguageAgnosticScore(parsed.rawText)
        };
    }
    async selectTranscriptVariant(audioFile, languageHint) {
        const primary = await this.transcribeVariant(audioFile, languageHint);
        if (languageHint || !shouldRetryWithLanguageFallback(primary.parsed.rawText)) {
            return primary;
        }
        this.logger.info("Auto language detection produced a suspicious transcript; retrying with language fallback", {
            audioFile: audioFile.path,
            detectedLanguage: primary.parsed.detectedLanguage,
            initialScore: primary.score
        });
        const candidates = [primary];
        for (const fallbackLanguage of FALLBACK_LANGUAGES) {
            const retried = await this.transcribeVariant(audioFile, fallbackLanguage);
            candidates.push({
                ...retried,
                score: scoreTranscriptText(retried.parsed.rawText, fallbackLanguage)
            });
        }
        const best = candidates.reduce((currentBest, candidate) => candidate.score > currentBest.score ? candidate : currentBest);
        this.logger.info("Selected best transcript after language fallback", {
            audioFile: audioFile.path,
            chosenLanguageHint: best.languageHint,
            chosenDetectedLanguage: best.parsed.detectedLanguage,
            chosenScore: best.score
        });
        return best;
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
        const selectedVariant = await this.selectTranscriptVariant(audioFile, languageHint);
        if (!fs.existsSync(resolvedOutputDir)) {
            fs.mkdirSync(resolvedOutputDir, { recursive: true });
        }
        const { rawText, formattedBody } = selectedVariant.parsed;
        let suggestedTitle = "";
        if (!this.titleConfig.enabled || this.titleConfig.provider === "none") {
            this.updateTitleProviderStatus?.({
                titleProviderState: "disabled",
                titleProviderDetail: "Title generation is disabled."
            });
        }
        else if (this.titleConfig.provider === "heuristic") {
            this.updateTitleProviderStatus?.({
                titleProviderState: "ready",
                titleProviderDetail: "Heuristic title provider is active."
            });
        }
        if (this.titleConfig.enabled && this.titleConfig.provider !== "none") {
            try {
                suggestedTitle = await this.titleSuggester.suggestTitle({
                    transcriptText: rawText,
                    fallbackTitle: originalBaseName,
                    languageHint: this.titleConfig.languageHint,
                    maxWords: this.titleConfig.maxWords
                });
                this.updateTitleProviderStatus?.({
                    titleProviderState: "ready",
                    titleProviderDetail: this.titleConfig.provider === "ollama"
                        ? "Ollama title provider is reachable."
                        : "Title provider is active."
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.warn("Title suggestion failed; falling back to Untitled", { error: message });
                this.updateTitleProviderStatus?.({
                    titleProviderState: "degraded",
                    titleProviderDetail: message
                });
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
