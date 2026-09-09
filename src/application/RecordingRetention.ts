import fs from "node:fs";
import path from "node:path";
import type { Logger } from "../infrastructure/logging/Logger.js";
import { traceEvent } from "../infrastructure/tracing/TraceLogger.js";

export interface RecordingRetentionOptions {
  /** Directory that holds live recordings (the watched folder). */
  recordingsRoot: string;
  /** Directory that archived recordings are moved into. Must sit outside recordingsRoot. */
  archiveDirectory: string;
  /** Number of newest recordings always left in place, regardless of job state. */
  keepRecentRecordings: number;
  /**
   * Number of newest archived recordings to keep. Older ones are deleted permanently.
   * 0 keeps every archived recording.
   */
  keepArchivedRecordings: number;
  /** Audio extensions considered, e.g. [".m4a", ".mp3"]. */
  includeExtensions: string[];
  /**
   * Whether a recording may be archived. The caller supplies this from the durable job
   * ledger so that only successfully completed transcriptions are ever moved.
   */
  isArchivable: (audioFilePath: string) => boolean;
  logger: Logger;
}

export interface RecordingRetentionResult {
  /** Archived recording paths, as they now exist inside the archive directory. */
  archived: string[];
  /** Recordings deliberately left in place because they are among the newest. */
  retained: number;
  /** Recordings left in place because they are not archivable (pending or failed). */
  skipped: number;
  /** Archived recordings deleted permanently because the archive was over its limit. */
  pruned: string[];
}

const EMPTY_RESULT: RecordingRetentionResult = { archived: [], retained: 0, skipped: 0, pruned: [] };

function isNestedWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function listRecordings(recordingsRoot: string, includeExtensions: string[]): string[] {
  const normalizedExtensions = includeExtensions.map((extension) => extension.toLowerCase());
  return fs
    .readdirSync(recordingsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .filter((entry) => normalizedExtensions.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(recordingsRoot, entry.name));
}

function modifiedAt(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

/** Choose a destination that never overwrites an existing archived recording. */
function resolveDestination(archiveDirectory: string, audioFilePath: string): string {
  const extension = path.extname(audioFilePath);
  const baseName = path.basename(audioFilePath, extension);
  let candidate = path.join(archiveDirectory, `${baseName}${extension}`);
  let suffix = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(archiveDirectory, `${baseName}-${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
}

function moveFile(sourcePath: string, destinationPath: string): void {
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (err) {
    // Archive may live on a different volume; fall back to copy-then-remove.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      throw err;
    }
    fs.copyFileSync(sourcePath, destinationPath);
    fs.unlinkSync(sourcePath);
  }
}

/**
 * Delete the oldest archived recordings once the archive holds more than the configured
 * number. Only recordings that already produced a Transcript are ever archived, so the
 * durable output of this audio is kept even after the audio itself is removed.
 */
function pruneArchive(
  archiveDirectory: string,
  keepArchivedRecordings: number,
  includeExtensions: string[],
  logger: Logger
): string[] {
  if (keepArchivedRecordings <= 0) {
    return [];
  }

  let archived: string[];
  try {
    archived = listRecordings(archiveDirectory, includeExtensions);
  } catch {
    // No archive directory yet; nothing to prune.
    return [];
  }

  const ordered = archived
    .map((filePath) => ({ filePath, mtimeMs: modifiedAt(filePath) }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((entry) => entry.filePath);

  const pruned: string[] = [];
  for (const filePath of ordered.slice(keepArchivedRecordings)) {
    try {
      fs.unlinkSync(filePath);
      pruned.push(filePath);
      logger.info("Deleted archived recording over the archive limit", {
        archivedRecording: filePath,
        keepArchivedRecordings
      });
      traceEvent({
        event: "archived_recording_pruned",
        source: "RecordingRetention",
        metadata: { archivedRecording: filePath, keepArchivedRecordings }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("Could not delete archived recording", { archivedRecording: filePath, error: message });
    }
  }

  return pruned;
}

/**
 * Move already-transcribed recordings out of the watched recordings folder into the
 * archive, always leaving the newest `keepRecentRecordings` in place so a recent
 * recording can still be re-listened to or re-transcribed after a failure.
 *
 * Recordings without a completed TranscriptionJob are never moved.
 * This runs on the transcription path, so it reports failures but never throws.
 */
export function archiveProcessedRecordings(
  options: RecordingRetentionOptions
): RecordingRetentionResult {
  const recordingsRoot = path.resolve(options.recordingsRoot);
  const archiveDirectory = path.resolve(options.archiveDirectory);

  // The watcher scans recursively, so an archive inside the watched folder would be
  // rediscovered and re-transcribed on the next poll.
  if (isNestedWithin(archiveDirectory, recordingsRoot)) {
    options.logger.error("Archive directory must not sit inside the recordings folder; skipping retention sweep", {
      recordingsRoot,
      archiveDirectory
    });
    traceEvent({
      event: "recording_retention_skipped",
      source: "RecordingRetention",
      metadata: { reason: "archive_nested_in_recordings", recordingsRoot, archiveDirectory }
    });
    return EMPTY_RESULT;
  }

  let recordings: string[];
  try {
    recordings = listRecordings(recordingsRoot, options.includeExtensions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.logger.warn("Could not read recordings folder for retention sweep", {
      recordingsRoot,
      error: message
    });
    return EMPTY_RESULT;
  }

  // Newest first, so the newest keepRecentRecordings are always retained.
  const ordered = recordings
    .map((filePath) => ({ filePath, mtimeMs: modifiedAt(filePath) }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((entry) => entry.filePath);

  const keepCount = Math.max(0, options.keepRecentRecordings);
  const retainedRecordings = ordered.slice(0, keepCount);
  const candidates = ordered.slice(keepCount);

  const archived: string[] = [];
  let skipped = 0;

  for (const audioFilePath of candidates) {
    if (!options.isArchivable(audioFilePath)) {
      skipped += 1;
      continue;
    }

    try {
      fs.mkdirSync(archiveDirectory, { recursive: true });
      const destinationPath = resolveDestination(archiveDirectory, audioFilePath);
      moveFile(audioFilePath, destinationPath);
      archived.push(destinationPath);

      options.logger.info("Archived transcribed recording", {
        audioFile: audioFilePath,
        archivedTo: destinationPath
      });
      traceEvent({
        event: "recording_archived",
        source: "RecordingRetention",
        metadata: { audioFile: audioFilePath, archivedTo: destinationPath }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped += 1;
      options.logger.warn("Could not archive transcribed recording", {
        audioFile: audioFilePath,
        archiveDirectory,
        error: message
      });
      traceEvent({
        event: "recording_archive_failed",
        source: "RecordingRetention",
        metadata: { audioFile: audioFilePath, archiveDirectory, error: message }
      });
    }
  }

  const pruned = pruneArchive(
    archiveDirectory,
    options.keepArchivedRecordings,
    options.includeExtensions,
    options.logger
  );

  return { archived, retained: retainedRecordings.length, skipped, pruned };
}
