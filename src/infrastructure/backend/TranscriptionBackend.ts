import type { AudioFile } from "../../domain/AudioFile.js";
import type { Transcript } from "../../domain/Transcript.js";

export interface TranscriptionBackend {
  /**
   * Transcribe the given AudioFile into a Transcript.
   *
   * The backend is responsible for ensuring that the resulting transcript
   * uses the same language as the input audio unless explicitly configured
   * otherwise via languageHint.
   */
  transcribe(audioFile: AudioFile, options: { languageHint?: string | null }): Promise<Transcript>;
}

