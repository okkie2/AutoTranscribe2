import test from "node:test";
import assert from "node:assert/strict";
import { OllamaTitleError, OllamaTitleSuggester, probeOllamaTitleHealth } from "../infrastructure/title/OllamaTitleSuggester.js";
const baseConfig = {
    enabled: true,
    provider: "ollama",
    maxLength: 80,
    maxWords: 5,
    languageHint: "nl",
    ollama: {
        endpoint: "http://127.0.0.1:11434/api/generate",
        model: "llama3.1:8b-instruct-q4_K_M",
        temperature: 0.2,
        timeoutMs: 1000
    }
};
function installFetchStub(stub) {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = stub;
    return () => {
        globalThis.fetch = previousFetch;
    };
}
test("OllamaTitleSuggester returns a validated title from Ollama JSON", async () => {
    const restoreFetch = installFetchStub(async () => new Response(JSON.stringify({
        response: '{"title":"Cloud migratie discussie"}'
    }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    }));
    try {
        const suggester = new OllamaTitleSuggester(baseConfig);
        const title = await suggester.suggestTitle({
            transcriptText: "We bespreken de migratie van systemen naar de cloud.",
            fallbackTitle: "2026-03-26_10-18-36"
        });
        assert.equal(title, "Cloud migratie discussie");
    }
    finally {
        restoreFetch();
    }
});
test("OllamaTitleSuggester throws a detailed error on HTTP failure", async () => {
    const restoreFetch = installFetchStub(async () => new Response("model 'llama3.1:8b-instruct-q4_K_M' not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" }
    }));
    try {
        const suggester = new OllamaTitleSuggester(baseConfig);
        await assert.rejects(suggester.suggestTitle({
            transcriptText: "test transcript",
            fallbackTitle: "fallback"
        }), (err) => {
            assert.ok(err instanceof OllamaTitleError);
            assert.match(err.message, /HTTP 404.*model 'llama3\.1:8b-instruct-q4_K_M' not found/);
            return true;
        });
    }
    finally {
        restoreFetch();
    }
});
test("probeOllamaTitleHealth reports failures without throwing", async () => {
    const restoreFetch = installFetchStub(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    });
    try {
        const result = await probeOllamaTitleHealth(baseConfig);
        assert.equal(result.ok, false);
        assert.equal(result.endpoint, "http://127.0.0.1:11434/api/generate");
        assert.match(result.message, /ECONNREFUSED/);
    }
    finally {
        restoreFetch();
    }
});
