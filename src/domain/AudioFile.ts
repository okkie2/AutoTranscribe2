/**
 * AudioFile represents a single audio recording on disk that can be transcribed.
 * It is the main input to a TranscriptionJob.
 */
export interface AudioFile {
  /**
   * Absolute or project-relative path to the audio file on disk.
   * Example: "/Users/you/Recordings/meeting.m4a"
   */
  path: string;
}

