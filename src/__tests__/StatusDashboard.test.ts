import test from "node:test";
import assert from "node:assert/strict";
import { formatDashboardLines, getStatusFreshness } from "../cli/StatusDashboard.js";
import type { RuntimeStatus } from "../infrastructure/status/RuntimeStatus.js";

test("getStatusFreshness returns missing when status is null", () => {
  assert.equal(getStatusFreshness(null), "missing");
});

test("getStatusFreshness returns fresh when status is recent", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  assert.equal(getStatusFreshness(status), "fresh");
});

test("getStatusFreshness returns stale when updatedAt is too old", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "processingTranscription",
    queueLength: 1,
    currentFile: "file.m4a",
    lastError: null,
    updatedAt: new Date(Date.now() - 60_000).toISOString()
  };
  assert.equal(getStatusFreshness(status, 30_000), "stale");
});

test("getStatusFreshness returns stale when updatedAt is invalid", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: "not-a-date"
  };
  assert.equal(getStatusFreshness(status, 30_000), "stale");
});

test("formatDashboardLines when status is null shows fallbacks and path", () => {
  const statusPath = "/some/runtime/status.json";
  const { lines, statusFreshness } = formatDashboardLines(null, statusPath);
  assert.equal(statusFreshness, "missing");
  assert.ok(lines.some((line) => line.includes("Activity: -")));
  assert.ok(lines.some((line) => line.includes("Freshness: missing")));
  assert.ok(lines.some((line) => line.includes("Queue length: -")));
  assert.ok(lines.some((line) => line.includes(statusPath)));
});

test("formatDashboardLines when status is valid shows activity and freshness separately", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "processingTranscription",
    queueLength: 2,
    currentFile: "2026-03-14_rec.m4a",
    lastError: null,
    updatedAt: new Date().toISOString(),
    currentJobId: "job-1",
    currentPhaseDetail: "transcription"
  };
  const { lines, statusFreshness } = formatDashboardLines(status, "/path/status.json");
  assert.equal(statusFreshness, "fresh");
  assert.ok(lines.some((line) => line.includes("Activity: processingTranscription")));
  assert.ok(lines.some((line) => line.includes("Freshness: fresh")));
  assert.ok(lines.some((line) => line.includes("Queue length: 2")));
  assert.ok(lines.some((line) => line.includes("Current job: 2026-03-14_rec.m4a")));
});

test("formatDashboardLines uses fallback for missing optional fields", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  const { lines } = formatDashboardLines(status, "/path/status.json");
  assert.ok(lines.some((line) => line.includes("Current job: -")));
  assert.ok(lines.some((line) => line.includes("Last error: -")));
});

test("formatDashboardLines shows lastError when present", () => {
  const status: RuntimeStatus = {
    runtimeActivityState: "failed",
    queueLength: 0,
    currentFile: null,
    lastError: "Python backend exited with code 1",
    updatedAt: new Date().toISOString()
  };
  const { lines } = formatDashboardLines(status, "/path/status.json");
  assert.ok(lines.some((line) => line.includes("Python backend exited with code 1")));
});
