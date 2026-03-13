/**
 * Transcript represents the text output produced by transcribing an AudioFile.
 * For the MVP this is always stored as a Markdown (.md) file on disk.
 */
export interface Transcript {
  /**
   * Path to the .md file containing the transcript content.
   */
  path: string;

  /**
   * Full Markdown content of the transcript as a string.
   */
  content: string;
}

