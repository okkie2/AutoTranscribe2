import type { TranscriptionJob } from "./TranscriptionJob.js";

/**
 * TranscriptionJobQueue is a simple in-memory FIFO queue of TranscriptionJob
 * instances. The watcher/poller enqueues jobs; a worker dequeues and processes them.
 *
 * For the MVP this lives in memory only. A more durable queue could be introduced
 * later without changing the TranscriptionJob concept itself.
 */
export class TranscriptionJobQueue {
  private readonly queue: TranscriptionJob[] = [];

  /**
   * Add a job to the end of the queue.
   */
  enqueue(job: TranscriptionJob): void {
    this.queue.push(job);
  }

  /**
   * Remove and return the next job in the queue, or undefined if empty.
   */
  dequeue(): TranscriptionJob | undefined {
    return this.queue.shift();
  }

  /**
   * Returns true when there are no jobs waiting to be processed.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

