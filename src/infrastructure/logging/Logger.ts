import type { LogLevel } from "../config/AppConfig.js";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export function shouldLog(currentLevel: LogLevel, messageLevel: LogLevel): boolean {
  const order: LogLevel[] = ["debug", "info", "warn", "error"];
  return order.indexOf(messageLevel) >= order.indexOf(currentLevel);
}

