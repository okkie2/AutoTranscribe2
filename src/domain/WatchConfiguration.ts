/**
 * WatchConfiguration describes how the watcher should scan the filesystem
 * for new AudioFile instances to transcribe.
 *
 * This is the in-memory representation of the "watch" section in config.yaml.
 */
export interface WatchConfiguration {
  /**
   * When false, the watcher will not run even if the command is invoked.
   */
  enabled: boolean;

  /**
   * Directories that will be polled periodically for new audio files.
   */
  directories: string[];

  /**
   * File extensions (including the leading dot) that are considered valid
   * audio inputs, e.g. [".m4a", ".mp3"].
   */
  includeExtensions: string[];

  /**
   * Simple patterns or path fragments that should be ignored when scanning.
   */
  excludePatterns: string[];

  /**
   * How often to poll the directories, expressed in seconds.
   */
  pollingIntervalSeconds: number;

  /**
   * Base directory where transcript .md files will be written.
   */
  outputDirectory: string;

  /**
   * When true, the directory structure under outputDirectory will mirror
   * the structure of the source directories (useful for organization).
   */
  mirrorSourceStructure: boolean;
}

