import type { BackendConfig } from "../config/AppConfig.js";
import type { TranscriptionBackend } from "./TranscriptionBackend.js";
import { MlxWhisperBackend } from "./MlxWhisperBackend.js";
import { ParakeetBackend } from "./ParakeetBackend.js";

export function createBackend(config: BackendConfig): TranscriptionBackend {
  if (config.type === "parakeet") {
    return new ParakeetBackend(config);
  }
  return new MlxWhisperBackend(config);
}
