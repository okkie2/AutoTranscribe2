import fs from "node:fs";
import path from "node:path";
import { shouldLog } from "./Logger.js";
export class ConsoleAndFileLogger {
    constructor(config) {
        this.level = config.level;
        this.logFilePath = path.resolve(config.logFile);
        this.logToConsole = config.console;
        const logDir = path.dirname(this.logFilePath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }
    debug(message, meta) {
        this.log("debug", message, meta);
    }
    info(message, meta) {
        this.log("info", message, meta);
    }
    warn(message, meta) {
        this.log("warn", message, meta);
    }
    error(message, meta) {
        this.log("error", message, meta);
    }
    log(level, message, meta) {
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
            }
            else if (level === "warn") {
                console.warn(line);
            }
            else {
                console.log(line);
            }
        }
        fs.appendFileSync(this.logFilePath, line + "\n", { encoding: "utf8" });
    }
}
