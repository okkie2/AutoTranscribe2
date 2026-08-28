import type { TitleSuggester } from "../../application/TitleSuggester.js";
import type { TitleConfig } from "../config/AppConfig.js";

export class OllamaTitleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaTitleError";
  }
}

export interface OllamaTitleHealthResult {
  ok: boolean;
  endpoint: string;
  model: string;
  message: string;
  status?: number;
}

const FALLBACK_OLLAMA_MODELS = ["qwen2.5:7b", "mistral-small3.2:latest", "nemotron-3-nano:4b"] as const;

function extractJsonObject(text: string): any {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return {};
  const slice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return {};
  }
}

function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

function isGenericTitle(t: string): boolean {
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

function validateTitle(candidate: string, maxLength: number): string | "" {
  const t = normalizeTitle(candidate);
  if (!t) return "";
  if (t.length > maxLength) return "";
  // Must contain at least one letter.
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return "";
  // Avoid markdown/punctuation-heavy titles.
  if (/^#+\s*/.test(t)) return "";
  if (/```/.test(t)) return "";
  if (isGenericTitle(t)) return "";
  return t;
}

function buildPrompt(transcriptExcerpt: string, languageHint: string | null, maxLength: number): string {
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

function pickExcerpt(fullText: string): string {
  // Heuristic: skip some initial noise and keep a bounded excerpt.
  const trimmed = fullText.replace(/^\s+/, "");
  const start = Math.min(600, trimmed.length);
  const window = trimmed.slice(start, start + 2000);
  return window || trimmed.slice(0, 2000);
}

async function readResponseTextSafely(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function trimForLog(text: string, maxLength: number = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      return `${err.message}: ${cause.message}`;
    }
    if (typeof cause === "string" && cause.trim()) {
      return `${err.message}: ${cause}`;
    }
    return err.message;
  }
  return String(err);
}

async function postToOllama(
  config: TitleConfig,
  prompt: string,
  model: string
): Promise<{ responseText: string; status: number }> {
  if (!config.ollama) {
    throw new OllamaTitleError("Ollama title configuration is missing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollama.timeoutMs);

  try {
    let res: Response;

    try {
      res = await fetch(config.ollama.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: config.ollama.temperature,
            num_predict: 32
          }
        }),
        signal: controller.signal
      });
    } catch (err) {
      const message = formatErrorMessage(err);
      throw new OllamaTitleError(`Ollama request failed for ${model} at ${config.ollama.endpoint}: ${message}`);
    }

    if (!res.ok) {
      const body = trimForLog(await readResponseTextSafely(res));
      const bodySuffix = body ? ` Body: ${body}` : "";
      throw new OllamaTitleError(`Ollama returned HTTP ${res.status} for ${model} at ${config.ollama.endpoint}.${bodySuffix}`);
    }

    let data: any;
    try {
      data = await res.json();
    } catch (err) {
      const message = formatErrorMessage(err);
      throw new OllamaTitleError(`Ollama returned invalid JSON: ${message}`);
    }

    const responseText = String(data?.response ?? "");
    if (!responseText.trim()) {
      throw new OllamaTitleError("Ollama returned an empty response body.");
    }

    return { responseText, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeOllamaTitleHealth(config: TitleConfig): Promise<OllamaTitleHealthResult> {
  if (!config.ollama) {
    return {
      ok: false,
      endpoint: "",
      model: "",
      message: "title.ollama configuration is missing."
    };
  }

  const prompt = [
    "Return ONLY valid JSON with one key.",
    'Example: {"title":"Test title"}',
    "Use the title value: Health check"
  ].join("\n");

  try {
    await postToOllama(config, prompt, config.ollama.model);
    return {
      ok: true,
      endpoint: config.ollama.endpoint,
      model: config.ollama.model,
      message: "Ollama title endpoint responded successfully."
    };
  } catch (err) {
    const message = formatErrorMessage(err);
    return {
      ok: false,
      endpoint: config.ollama.endpoint,
      model: config.ollama.model,
      message
    };
  }
}

export class OllamaTitleSuggester implements TitleSuggester {
  constructor(private readonly config: TitleConfig) {
    if (!config.ollama) {
      throw new Error("OllamaTitleSuggester requires title.ollama configuration");
    }
  }

  async suggestTitle(input: {
    transcriptText: string;
    fallbackTitle: string;
    languageHint?: string | null;
    maxWords?: number;
  }): Promise<string> {
    if (!this.config.enabled || this.config.provider !== "ollama") {
      return "";
    }

    const excerpt = pickExcerpt(input.transcriptText);
    const ollama = this.config.ollama;
    if (!ollama) {
      throw new OllamaTitleError("Ollama title configuration is missing.");
    }

    const prompt = buildPrompt(excerpt, this.config.languageHint ?? input.languageHint ?? null, this.config.maxLength);

    const primaryModel = ollama.model;
    const modelCandidates = [primaryModel, ...FALLBACK_OLLAMA_MODELS].filter(
      (model, index, models) => models.indexOf(model) === index
    );

    let lastError: unknown = null;
    for (const model of modelCandidates) {
      try {
        const { responseText } = await postToOllama(this.config, prompt, model);
        const parsed = extractJsonObject(responseText);
        const title = validateTitle(String(parsed?.title ?? ""), this.config.maxLength);

        if (!title) {
          lastError = new OllamaTitleError(
            `Ollama returned no usable title for ${model} at ${ollama.endpoint}.`
          );
          continue;
        }

        return title;
      } catch (err) {
        lastError = err;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new OllamaTitleError(`Ollama returned no usable title for ${primaryModel} at ${ollama.endpoint}.`);
  }
}
