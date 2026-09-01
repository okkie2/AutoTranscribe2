import { TranscriptionJobState } from "../domain/TranscriptionJob.js";
import { getStatusFreshness } from "./StatusSnapshot.js";
export function buildJsonStatusSnapshot(status, supervisor, jobs) {
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
function countJobs(jobs, state) {
    return jobs.filter((job) => job.state === state).length;
}
function latestJob(jobs, state) {
    return jobs
        .filter((job) => job.state === state)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}
