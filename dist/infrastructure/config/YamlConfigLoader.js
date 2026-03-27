import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
function toWatchConfiguration(raw) {
    if (!raw) {
        throw new Error("Missing 'watch' section in config.yaml");
    }
    return {
        enabled: Boolean(raw.enabled ?? true),
        directories: Array.isArray(raw.directories) ? raw.directories.map(String) : [],
        includeExtensions: Array.isArray(raw.include_extensions)
            ? raw.include_extensions.map(String)
            : [],
        excludePatterns: Array.isArray(raw.exclude_patterns)
            ? raw.exclude_patterns.map(String)
            : [],
        pollingIntervalSeconds: Number(raw.polling_interval_seconds ?? 10),
        outputDirectory: String(raw.output_directory ?? "./output"),
        mirrorSourceStructure: Boolean(raw.mirror_source_structure ?? true)
    };
}
function toBackendConfig(raw) {
    if (!raw) {
        throw new Error("Missing 'backend' section in config.yaml");
    }
    const type = String(raw.type ?? "mlx_whisper");
    const validTypes = ["mlx_whisper", "parakeet"];
    if (!validTypes.includes(type)) {
        throw new Error(`Unsupported backend type '${type}' in config.yaml (expected one of ${validTypes.join(", ")})`);
    }
    const options = raw.options ?? {};
    const defaultScript = type === "parakeet"
        ? "./py-backend/parakeet_backend.py"
        : "./py-backend/mlx_whisper_backend.py";
    return {
        type: type,
        pythonExecutable: String(raw.python_executable ?? "python3"),
        scriptPath: String(raw.script_path ?? defaultScript),
        languageHint: raw.language_hint === null || raw.language_hint === undefined
            ? null
            : String(raw.language_hint),
        options: {
            modelSize: String(options.model_size ?? "medium"),
            modelId: options.model_id !== undefined ? String(options.model_id) : undefined,
            ...options
        }
    };
}
function toLoggingConfig(raw) {
    if (!raw) {
        throw new Error("Missing 'logging' section in config.yaml");
    }
    const level = String(raw.level ?? "info");
    const validLevels = ["debug", "info", "warn", "error"];
    if (!validLevels.includes(level)) {
        throw new Error(`Invalid logging.level '${level}' in config.yaml (expected one of ${validLevels.join(", ")})`);
    }
    return {
        level,
        logFile: String(raw.log_file ?? "./logs/autotranscribe.log"),
        console: Boolean(raw.console ?? true),
        verboseErrors: Boolean(raw.verbose_errors ?? false)
    };
}
function toTitleConfig(raw) {
    // Title is optional; defaults keep behavior stable.
    const enabled = Boolean(raw?.enabled ?? false);
    const provider = String(raw?.provider ?? "heuristic");
    const validProviders = ["heuristic", "ollama", "none"];
    if (!validProviders.includes(provider)) {
        throw new Error(`Invalid title.provider '${provider}' in config.yaml (expected one of ${validProviders.join(", ")})`);
    }
    const languageHint = raw?.language_hint === null || raw?.language_hint === undefined
        ? null
        : String(raw.language_hint);
    const cfg = {
        enabled,
        provider,
        maxLength: Number(raw?.max_length ?? 80),
        maxWords: Number(raw?.max_words ?? 5),
        languageHint,
        ollama: undefined
    };
    if (provider === "ollama") {
        const o = raw?.ollama ?? {};
        cfg.ollama = {
            endpoint: String(o.endpoint ?? "http://127.0.0.1:11434/api/generate"),
            model: String(o.model ?? "llama3.1:8b-instruct-q4_K_M"),
            temperature: Number(o.temperature ?? 0.2),
            timeoutMs: Number(o.timeout_ms ?? 60000)
        };
    }
    return cfg;
}
function toIngestConfig(raw) {
    if (!raw) {
        throw new Error("Missing 'ingest' section in config.yaml");
    }
    return {
        jprSourceRoot: String(raw.jpr_source_root),
        recordingsRoot: String(raw.recordings_root)
    };
}
function toAutostartConfig(raw) {
    const enabled = Boolean(raw?.enabled ?? false);
    const label = String(raw?.label ?? "com.autotranscribe2.startall");
    return { enabled, label };
}
export function loadConfig(configPath = "config.yaml") {
    const resolvedPath = path.resolve(configPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found at '${resolvedPath}'`);
    }
    const rawText = fs.readFileSync(resolvedPath, "utf8");
    const raw = parse(rawText);
    const watch = toWatchConfiguration(raw.watch);
    const backend = toBackendConfig(raw.backend);
    const logging = toLoggingConfig(raw.logging);
    const title = toTitleConfig(raw.title);
    const ingest = toIngestConfig(raw.ingest);
    const autostart = toAutostartConfig(raw.autostart);
    const runtimeStatusPath = path.join(path.dirname(resolvedPath), "runtime", "status.json");
    return { watch, backend, logging, title, ingest, autostart, runtimeStatusPath };
}
