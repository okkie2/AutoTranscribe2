import { MlxWhisperBackend } from "./MlxWhisperBackend.js";
import { ParakeetBackend } from "./ParakeetBackend.js";
export function createBackend(config) {
    if (config.type === "parakeet") {
        return new ParakeetBackend(config);
    }
    return new MlxWhisperBackend(config);
}
