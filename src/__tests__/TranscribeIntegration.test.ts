import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";

// Integration test for CLI `transcribe` using the weather forecast fixture.
// This test is intentionally simple and is expected to be run manually.

test("CLI transcribe creates a titled markdown transcript for the fixture", (t) => {
  const baseName = "2001-01-01_01-02-01";
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), "..", "..");

  // Load config to find transcripts directory.
  const config = loadConfig(path.join(projectRoot, "config.yaml"));
  const transcriptsDir = path.resolve(projectRoot, config.watch.outputDirectory);

  // Ensure transcripts directory exists.
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }

  // Clean up any previous test transcripts for this base name.
  const existing = fs.readdirSync(transcriptsDir);
  for (const name of existing) {
    if (name.startsWith(baseName) && name.toLowerCase().endsWith(".md")) {
      fs.unlinkSync(path.join(transcriptsDir, name));
    }
  }

  const fixturePath = path.resolve(
    projectRoot,
    "test",
    "fixtures",
    `${baseName}.m4a`
  );
  assert.ok(fs.existsSync(fixturePath), "Fixture audio file must exist");

  // Run the CLI transcribe command.
  const result = spawnSync("node", ["dist/cli/index.js", "transcribe", fixturePath], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    // In sandboxed environments we may not be allowed to write the logfile; skip in that case.
    if (/EPERM: operation not permitted, open .*autotranscribe\.log/.test(stderr)) {
      t.skip("Skipping integration test due to sandbox logfile permissions (EPERM).");
      return;
    }
    assert.equal(result.status, 0, `CLI transcribe exited with non-zero status: ${result.status}\n${stderr}`);
  }

  const after = fs.readdirSync(transcriptsDir);
  const transcriptsForBase = after.filter(
    (name) => name.startsWith(baseName) && name.toLowerCase().endsWith(".md")
  );

  assert.equal(
    transcriptsForBase.length,
    1,
    `Expected exactly one transcript for ${baseName}, found ${transcriptsForBase.length}`
  );

  const transcriptPath = path.join(transcriptsDir, transcriptsForBase[0]);
  const content = fs.readFileSync(transcriptPath, "utf8");
  const firstLine = content.split(/\r?\n/, 1)[0];

  assert.ok(
    firstLine.startsWith("# "),
    `Expected first line to start with '# ', got: ${firstLine}`
  );
});

