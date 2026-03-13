import fs from "node:fs";
import path from "node:path";
import type { Logger } from "./Logger.js";
import { shouldLog } from "./Logger.js";
import type { LoggingConfig } from "../config/AppConfig.js";

export class ConsoleAndFileLogger implements Logger {
  private readonly level: LoggingConfig["level"];
  private readonly logFilePath: string;
  private readonly logToConsole: boolean;

  constructor(config: LoggingConfig) {
    this.level = config.level;
    this.logFilePath = path.resolve(config.logFile);
    this.logToConsole = config.console;

    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  debug(message: string, meta?: unknown): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log("error", message, meta);
  }

  private log(level: LoggingConfig["level"], message: string, meta?: unknown): void {
    if (!shouldLog(this.level, level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaText}`;

    if (this.logToConsole) {
      // Map log level to appropriate console method.
      if (level === "error") {
        console.error(line);
      } else if (level === "warn") {
        console.warn(line);
      } else {
        console.log(line);
      }
    }

    fs.appendFileSync(this.logFilePath, line + "\n", { encoding: "utf8" });
  }
}

