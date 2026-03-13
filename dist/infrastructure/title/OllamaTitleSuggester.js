function extractJsonObject(text) {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
        return {};
    const slice = candidate.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(slice);
    }
    catch {
        return {};
    }
}
function normalizeTitle(t) {
    return t.replace(/\s+/g, " ").trim();
}
function isGenericTitle(t) {
    const lower = t.toLowerCase();
    return [
        "meeting",
        "gesprek",
        "transcript",
        "transcription",
        "samenvatting",
        "notities",
        "notes"
    ].includes(lower);
}
function validateTitle(candidate, maxLength) {
    const t = normalizeTitle(candidate);
    if (!t)
        return "";
    if (t.length > maxLength)
        return "";
    // Must contain at least one letter.
    if (!/[A-Za-zÀ-ÿ]/.test(t))
        return "";
    // Avoid markdown/punctuation-heavy titles.
    if (/^#+\s*/.test(t))
        return "";
    if (/```/.test(t))
        return "";
    if (isGenericTitle(t))
        return "";
    return t;
}
function buildPrompt(transcriptExcerpt, languageHint, maxLength) {
    const langLine = languageHint ? `Language hint: ${languageHint}` : "Language hint: (auto)";
    return [
        "Task: Create a short, descriptive title for the following transcript excerpt.",
        "Rules:",
        `- Output ONLY valid JSON: {"title":"..."} (no markdown fences, no extra keys, no extra text).`,
        `- The title must be in the SAME language as the transcript (respect the language hint if provided).`,
        `- Max ${maxLength} characters.`,
        `- No leading/trailing quotes, no colon at the end, no Markdown (#).`,
        `- Prefer 2–6 words that describe the topic.`,
        langLine,
        "",
        "Transcript excerpt:",
        '"""',
        transcriptExcerpt,
        '"""'
    ].join("\n");
}
function pickExcerpt(fullText) {
    // Heuristic: skip some initial noise and keep a bounded excerpt.
    const trimmed = fullText.replace(/^\s+/, "");
    const start = Math.min(1200, trimmed.length);
    const window = trimmed.slice(start, start + 4000);
    return window || trimmed.slice(0, 4000);
}
export class OllamaTitleSuggester {
    constructor(config) {
        this.config = config;
        if (!config.ollama) {
            throw new Error("OllamaTitleSuggester requires title.ollama configuration");
        }
    }
    async suggestTitle(input) {
        if (!this.config.enabled || this.config.provider !== "ollama") {
            return "";
        }
        const ollama = this.config.ollama;
        const excerpt = pickExcerpt(input.transcriptText);
        const prompt = buildPrompt(excerpt, this.config.languageHint ?? input.languageHint ?? null, this.config.maxLength);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ollama.timeoutMs);
        try {
            const res = await fetch(ollama.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: ollama.model,
                    prompt,
                    stream: false,
                    options: { temperature: ollama.temperature }
                }),
                signal: controller.signal
            });
            if (!res.ok) {
                return "";
            }
            const data = await res.json();
            const responseText = String(data?.response ?? "");
            const parsed = extractJsonObject(responseText);
            const title = validateTitle(String(parsed?.title ?? ""), this.config.maxLength);
            return title;
        }
        catch {
            return "";
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
