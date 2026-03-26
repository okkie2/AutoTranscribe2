import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionService } from "../application/TranscriptionService.js";
const logger = {
    debug() { },
    info() { },
    warn() { },
    error() { }
};
test("TranscriptionService retries suspicious auto-detected transcripts with Dutch and English fallbacks", async () => {
    const calls = [];
    const backend = {
        async transcribe(_audioFile, options) {
            calls.push(options.languageHint);
            if (options.languageHint === "nl") {
                return {
                    path: "",
                    content: JSON.stringify({
                        text: "Ja hallo dit is een normaal Nederlands gesprek over werk en afspraken met veel herkenbare woorden.",
                        formatted_markdown: "Ja hallo dit is een normaal Nederlands gesprek over werk en afspraken.",
                        language: "nl"
                    })
                };
            }
            if (options.languageHint === "en") {
                return {
                    path: "",
                    content: JSON.stringify({
                        text: "Hello this is a normal English conversation about work and scheduling with recognisable words.",
                        formatted_markdown: "Hello this is a normal English conversation about work and scheduling.",
                        language: "en"
                    })
                };
            }
            return {
                path: "",
                content: JSON.stringify({
                    text: "How how I have to have to have a hard time and naked naked naked naked naked naked.",
                    formatted_markdown: "How how I have to have to have a hard time and naked naked naked naked naked naked.",
                    language: "en"
                })
            };
        }
    };
    const titleSuggester = {
        async suggestTitle() {
            return "Testtitel";
        }
    };
    const service = new TranscriptionService(backend, logger, titleSuggester, {
        enabled: true,
        provider: "heuristic",
        maxLength: 80,
        maxWords: 5,
        languageHint: null
    });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-service-"));
    const transcriptPath = await service.transcribeToDirectory("/tmp/2026-03-26_10-18-39.m4a", outputDir, "2026-03-26_10-18-39", null);
    assert.deepEqual(calls, [null, "nl", "en"]);
    assert.equal(path.basename(transcriptPath), "2026-03-26_10-18-39_testtitel.md");
    const written = fs.readFileSync(transcriptPath, "utf8");
    assert.match(written, /(normaal Nederlands gesprek|normal English conversation)/);
    assert.doesNotMatch(written, /naked naked naked/);
});
test("TranscriptionService reports degraded title-provider state when Ollama title generation fails", async () => {
    const dependencyStates = [];
    const backend = {
        async transcribe() {
            return {
                path: "",
                content: JSON.stringify({
                    text: "We bespreken een projectupdate in het Nederlands.",
                    formatted_markdown: "We bespreken een projectupdate in het Nederlands.",
                    language: "nl"
                })
            };
        }
    };
    const titleSuggester = {
        async suggestTitle() {
            throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
        }
    };
    const service = new TranscriptionService(backend, logger, titleSuggester, {
        enabled: true,
        provider: "ollama",
        maxLength: 80,
        maxWords: 5,
        languageHint: null,
        ollama: {
            endpoint: "http://127.0.0.1:11434/api/generate",
            model: "llama3.1:8b-instruct-q4_K_M",
            temperature: 0.2,
            timeoutMs: 1000
        }
    }, ({ titleProviderState, titleProviderDetail }) => {
        dependencyStates.push({ state: titleProviderState, detail: titleProviderDetail });
    });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-service-dependency-"));
    const transcriptPath = await service.transcribeToDirectory("/tmp/2026-03-26_10-18-39.m4a", outputDir, "2026-03-26_10-18-39", null);
    assert.equal(path.basename(transcriptPath), "2026-03-26_10-18-39_Untitled.md");
    assert.deepEqual(dependencyStates, [
        {
            state: "degraded",
            detail: "connect ECONNREFUSED 127.0.0.1:11434"
        }
    ]);
});
