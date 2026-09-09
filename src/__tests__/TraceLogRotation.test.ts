import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resetTraceRotationStateForTest, traceEvent } from "../infrastructure/tracing/TraceLogger.js";

const MAX_TRACE_BYTES = 5 * 1024 * 1024;

function withTraceLog(run: (tracePath: string) => void): void {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-trace-"));
  const tracePath = path.join(rootDir, "cli-trace.jsonl");
  const previous = process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH;
  process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH = tracePath;
  resetTraceRotationStateForTest();

  try {
    run(tracePath);
  } finally {
    if (previous === undefined) {
      delete process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH;
    } else {
      process.env.AUTOTRANSCRIBE_TRACE_LOG_PATH = previous;
    }
    resetTraceRotationStateForTest();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test("traceEvent rotates the Diagnostic Trace once it exceeds the size cap", () => {
  withTraceLog((tracePath) => {
    const rotatedPath = path.join(path.dirname(tracePath), "cli-trace.1.jsonl");
    // Start just under the cap so a single event forces rotation.
    fs.writeFileSync(tracePath, "x".repeat(MAX_TRACE_BYTES - 10), "utf8");

    traceEvent({ event: "rotation_probe", source: "test" });

    assert.ok(fs.existsSync(rotatedPath), "previous generation should be retained");
    assert.ok(fs.statSync(tracePath).size < 4096, "active trace should restart small");
    assert.match(fs.readFileSync(tracePath, "utf8"), /rotation_probe/);
  });
});

test("traceEvent keeps only one rotated generation", () => {
  withTraceLog((tracePath) => {
    const rotatedPath = path.join(path.dirname(tracePath), "cli-trace.1.jsonl");
    fs.writeFileSync(rotatedPath, "stale generation", "utf8");
    fs.writeFileSync(tracePath, "x".repeat(MAX_TRACE_BYTES - 10), "utf8");

    traceEvent({ event: "rotation_probe", source: "test" });

    assert.deepEqual(fs.readdirSync(path.dirname(tracePath)).sort(), [
      "cli-trace.1.jsonl",
      "cli-trace.jsonl"
    ]);
    assert.notEqual(fs.readFileSync(rotatedPath, "utf8"), "stale generation");
  });
});

test("traceEvent appends without rotating while under the cap", () => {
  withTraceLog((tracePath) => {
    traceEvent({ event: "first", source: "test" });
    traceEvent({ event: "second", source: "test" });

    const lines = fs.readFileSync(tracePath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(!fs.existsSync(path.join(path.dirname(tracePath), "cli-trace.1.jsonl")));
  });
});
