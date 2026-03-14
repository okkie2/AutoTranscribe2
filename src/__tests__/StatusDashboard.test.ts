import test from "node:test";
import assert from "node:assert/strict";
import { getEffectiveState, formatDashboardLines } from "../cli/StatusDashboard.js";
import type { RuntimeStatus } from "../infrastructure/status/RuntimeStatus.js";

test("getEffectiveState returns none when status is null", () => {
  assert.equal(getEffectiveState(null), "none");
});

test("getEffectiveState returns idle when status is idle and recent", () => {
  const status: RuntimeStatus = {
    state: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  assert.equal(getEffectiveState(status), "idle");
});

test("getEffectiveState returns processing when status is processing", () => {
  const status: RuntimeStatus = {
    state: "processing",
    queueLength: 1,
    currentFile: "file.m4a",
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  assert.equal(getEffectiveState(status), "processing");
});

test("getEffectiveState returns error when status is error", () => {
  const status: RuntimeStatus = {
    state: "error",
    queueLength: 0,
    currentFile: null,
    lastError: "Something failed",
    updatedAt: new Date().toISOString()
  };
  assert.equal(getEffectiveState(status), "error");
});

test("getEffectiveState returns stale when updatedAt is too old", () => {
  const status: RuntimeStatus = {
    state: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date(Date.now() - 60_000).toISOString()
  };
  assert.equal(getEffectiveState(status, 30_000), "stale");
});

test("getEffectiveState returns idle when within stale threshold", () => {
  const status: RuntimeStatus = {
    state: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date(Date.now() - 5_000).toISOString()
  };
  assert.equal(getEffectiveState(status, 30_000), "idle");
});

test("getEffectiveState returns stale when updatedAt is invalid", () => {
  const status: RuntimeStatus = {
    state: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: "not-a-date"
  };
  assert.equal(getEffectiveState(status, 30_000), "stale");
});

test("formatDashboardLines when status is null shows fallbacks and path", () => {
  const path = "/some/runtime/status.json";
  const { lines, effectiveState } = formatDashboardLines(null, path);
  assert.equal(effectiveState, "none");
  assert.ok(lines.some((l) => l.includes("State: -")));
  assert.ok(lines.some((l) => l.includes("Queue length: -")));
  assert.ok(lines.some((l) => l.includes(path)));
  assert.ok(lines.some((l) => l.includes("Ctrl+C")));
});

test("formatDashboardLines when status is valid shows all fields", () => {
  const status: RuntimeStatus = {
    state: "processing",
    queueLength: 2,
    currentFile: "2026-03-14_rec.m4a",
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  const { lines, effectiveState } = formatDashboardLines(status, "/path/status.json");
  assert.equal(effectiveState, "processing");
  assert.ok(lines.some((l) => l.includes("processing")));
  assert.ok(lines.some((l) => l.includes("Queue length: 2")));
  assert.ok(lines.some((l) => l.includes("2026-03-14_rec.m4a")));
  assert.ok(lines.some((l) => l.includes("Last error: -")));
});

test("formatDashboardLines uses fallback for missing optional fields", () => {
  const status: RuntimeStatus = {
    state: "idle",
    queueLength: 0,
    currentFile: null,
    lastError: null,
    updatedAt: new Date().toISOString()
  };
  const { lines } = formatDashboardLines(status, "/path/status.json");
  assert.ok(lines.some((l) => l.includes("Current file: -")));
  assert.ok(lines.some((l) => l.includes("Last error: -")));
});

test("formatDashboardLines shows lastError when present", () => {
  const status: RuntimeStatus = {
    state: "error",
    queueLength: 0,
    currentFile: null,
    lastError: "Python backend exited with code 1",
    updatedAt: new Date().toISOString()
  };
  const { lines } = formatDashboardLines(status, "/path/status.json");
  assert.ok(lines.some((l) => l.includes("Python backend exited with code 1")));
});
