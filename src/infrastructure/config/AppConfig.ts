import type { WatchConfiguration } from "../../domain/WatchConfiguration.js";

export interface BackendConfig {
  type: "mlx_whisper";
  pythonExecutable: string;
  scriptPath: string;
  languageHint: string | null;
  // Backend-specific options, e.g. model size.
  options: {
    modelSize: string;
    // Allow other keys as needed in the future.
    [key: string]: unknown;
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggingConfig {
  level: LogLevel;
  logFile: string;
  console: boolean;
  verboseErrors: boolean;
}

export type TitleProvider = "heuristic" | "ollama" | "none";

export interface TitleConfig {
  enabled: boolean;
  provider: TitleProvider;
  maxLength: number;
  maxWords: number;
  languageHint: string | null;

  // Ollama-only settings
  ollama?: {
    endpoint: string; // e.g. http://127.0.0.1:11434/api/generate
    model: string; // e.g. llama3.1:8b-instruct-q4_K_M
    temperature: number;
    timeoutMs: number;
  };
}

export interface AppConfig {
  watch: WatchConfiguration;
  backend: BackendConfig;
  logging: LoggingConfig;
  title: TitleConfig;
}

