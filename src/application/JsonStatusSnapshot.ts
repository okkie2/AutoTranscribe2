import { TranscriptionJobState } from "../domain/TranscriptionJob.js";
import type { PersistedTranscriptionJobRecord } from "../infrastructure/jobs/TranscriptionJobLedger.js";
import type { RuntimeStatus } from "../infrastructure/status/RuntimeStatus.js";
import type { ManagedWatcherSupervisorState } from "./ManagedWatcherSupervisorState.js";
import { getStatusFreshness, type StatusFreshness } from "./StatusSnapshot.js";

export interface JsonStatusSnapshot {
  updatedAt: string | null;
  statusFreshness: StatusFreshness;
  service: {
    state: ManagedWatcherSupervisorState["watcherProcessState"] | "unknown";
    detail: string | null;
  };
  activity: RuntimeStatus["runtimeActivityState"] | null;
  currentFile: string | null;
  queues: {
    recordings: {
      pending: null;
      oldest: null;
    };
    transcriptions: {
      pending: number;
      running: number;
      failed: number;
    };
  };
  latestTranscript: string | null;
  lastError: string | null;
}

export function buildJsonStatusSnapshot(
  status: RuntimeStatus | null,
  supervisor: ManagedWatcherSupervisorState | null,
  jobs: PersistedTranscriptionJobRecord[]
): JsonStatusSnapshot {
  const latestCompleted = latestJob(jobs, TranscriptionJobState.Completed);
  const latestFailed = latestJob(jobs, TranscriptionJobState.Failed);

  return {
    updatedAt: status?.updatedAt ?? null,
    statusFreshness: getStatusFreshness(status),
    service: {
      state: supervisor?.watcherProcessState ?? "unknown",
      detail: supervisor?.detail || null
    },
    activity: status?.runtimeActivityState ?? null,
    currentFile: status?.currentFile ?? null,
    queues: {
      recordings: {
        pending: null,
        oldest: null
      },
      transcriptions: {
        pending: countJobs(jobs, TranscriptionJobState.Pending),
        running: countJobs(jobs, TranscriptionJobState.InProgress),
        failed: countJobs(jobs, TranscriptionJobState.Failed)
      }
    },
    latestTranscript: latestCompleted?.targetTranscriptPath ?? null,
    lastError: status?.lastError ?? latestFailed?.errorMessage ?? null
  };
}

function countJobs(jobs: PersistedTranscriptionJobRecord[], state: TranscriptionJobState): number {
  return jobs.filter((job) => job.state === state).length;
}

function latestJob(
  jobs: PersistedTranscriptionJobRecord[],
  state: TranscriptionJobState
): PersistedTranscriptionJobRecord | null {
  return jobs
    .filter((job) => job.state === state)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}
