import type { AudioFile } from "./AudioFile.js";

/**
 * TranscriptionJobState describes where a TranscriptionJob is in its lifecycle.
 */
export enum TranscriptionJobState {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed"
}

/**
 * TranscriptionJob models a single unit of work to transcribe one AudioFile
 * into a Transcript.
 */
export interface TranscriptionJob {
  /**
   * Unique identifier for the job. This allows us to log and
   * track a specific job across the system.
   */
  id: string;

  /**
   * The audio recording that will be transcribed.
   */
  audioFile: AudioFile;

  /**
   * Current lifecycle state of the job (pending, in_progress, ...).
   */
  state: TranscriptionJobState;

  /**
   * When the job was first created (discovered or requested).
   */
  createdAt: Date;

  /**
   * Last time any field of the job changed (state, error, etc.).
   */
  updatedAt: Date;

  /**
   * Short, human-readable description of why the job failed, if it did.
   */
  errorMessage?: string;

  /**
   * Optional language hint such as "nl" for Dutch; if omitted,
   * the backend is expected to auto-detect the language.
   */
  languageHint?: string | null;

  /**
   * Absolute or project-relative path to the transcript .md file
   * that should be written when the job completes successfully.
   */
  targetTranscriptPath: string;
}

