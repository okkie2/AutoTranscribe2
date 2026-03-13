import type { AudioFile } from "../../domain/AudioFile.js";
import type { Transcript } from "../../domain/Transcript.js";
import type { TranscriptionBackend } from "./TranscriptionBackend.js";
import type { BackendConfig } from "../config/AppConfig.js";
import { spawn } from "node:child_process";

/**
 * MlxWhisperBackend is a TranscriptionBackend implementation that delegates
 * transcription to a Python subprocess running an MLX Whisper script.
 *
 * For the initial MVP wiring, this implementation can be used in "stub mode"
 * where the Python script simply echoes a fake transcript.
 */
export class MlxWhisperBackend implements TranscriptionBackend {
  constructor(private readonly config: BackendConfig) {}

  async transcribe(audioFile: AudioFile, options: { languageHint?: string | null }): Promise<Transcript> {
    const language = options.languageHint ?? this.config.languageHint ?? "";

    const args = [
      this.config.scriptPath,
      audioFile.path
    ];

    if (language) {
      args.push("--language", language);
    }

    const python = this.config.pythonExecutable;

    const content = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, args, { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to start Python backend: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Python backend exited with code ${code}. Stderr: ${stderr.trim()}`));
        }
      });
    });

    return {
      path: "", // The caller is responsible for choosing where to write the transcript.
      content
    };
  }
}

