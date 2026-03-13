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

export interface AppConfig {
  watch: WatchConfiguration;
  backend: BackendConfig;
  logging: LoggingConfig;
}

