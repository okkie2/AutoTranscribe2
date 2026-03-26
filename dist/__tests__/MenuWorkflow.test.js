import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
function writeConfig(rootDir) {
    const config = `watch:
  enabled: true
  directories:
    - ./recordings
  include_extensions: [".m4a"]
  exclude_patterns: []
  polling_interval_seconds: 10
  output_directory: ./transcripts
  mirror_source_structure: true

backend:
  type: mlx_whisper
  python_executable: python3
  script_path: ./py-backend/mlx_whisper_backend.py
  language_hint: null
  options:
    model_size: medium

logging:
  level: info
  log_file: ./logs/autotranscribe.log
  console: false
  verbose_errors: false

title:
  enabled: false
  provider: none
  max_length: 80
  max_words: 5
  language_hint: null

ingest:
  jpr_source_root: ./jpr
  recordings_root: ./recordings

autostart:
  enabled: false
  label: com.example.autotranscribe2
`;
    fs.writeFileSync(path.join(rootDir, "config.yaml"), config, "utf8");
}
test("menu workflow handles status, start, restart, recent jobs, latest transcript, and stop", async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe2-menu-"));
    fs.mkdirSync(path.join(rootDir, "recordings"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "transcripts"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "logs"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "runtime"), { recursive: true });
    writeConfig(rootDir);
    const latestTranscriptPath = path.join(rootDir, "transcripts", "2026-03-27_09-15-00_things-to-do-tomorrow.md");
    fs.writeFileSync(latestTranscriptPath, "# Things to do tomorrow\n", "utf8");
    fs.writeFileSync(path.join(rootDir, "logs", "autotranscribe.log"), "[2026-03-27T09:20:00.000Z] [INFO] Finished transcription job {\"audioFile\":\"/tmp/a.m4a\",\"transcriptPath\":\"/tmp/a.md\",\"title\":\"Things to do tomorrow\"}\n", "utf8");
    fs.writeFileSync(path.join(rootDir, "runtime", "status.json"), JSON.stringify({
        runtimeActivityState: "idle",
        queueLength: 0,
        currentFile: null,
        lastError: null,
        updatedAt: new Date().toISOString()
    }), "utf8");
    const child = spawn(process.execPath, [path.join(repoRoot, "dist/cli/index.js"), "menu"], {
        cwd: rootDir,
        env: {
            ...process.env,
            AUTOTRANSCRIBE_TEST_MODE: "1",
            AUTOTRANSCRIBE_PROCESS_LIST: ""
        },
        stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let childClosed = false;
    let childExitCode = null;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk;
    });
    child.on("close", (code) => {
        childClosed = true;
        childExitCode = code ?? 0;
    });
    async function waitForOutput(pattern, startIndex = 0) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const slice = stdout.slice(startIndex);
            const match = slice.match(pattern);
            if (match && match.index !== undefined) {
                return startIndex + match.index + match[0].length;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error(`Timed out waiting for output: ${pattern}\nchildClosed=${childClosed}\nchildExitCode=${childExitCode}\nstdout=${JSON.stringify(stdout)}\nstderr=${JSON.stringify(stderr)}`);
    }
    async function sendLine(line) {
        child.stdin.write(`${line}\n`);
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    let cursor = await waitForOutput(/Select an option:/);
    await sendLine("1");
    cursor = await waitForOutput(/AutoTranscribe2 WatcherControl/, cursor);
    cursor = await waitForOutput(/Select an option:/, cursor);
    await sendLine("2");
    cursor = await waitForOutput(/Are you sure you want to start watcher\? \(y\/n\):/, cursor);
    await sendLine("y");
    cursor = await waitForOutput(/Start Watcher succeeded\./, cursor);
    cursor = await waitForOutput(/Press Enter to return to menu/, cursor);
    await sendLine("");
    cursor = await waitForOutput(/Select an option:/, cursor);
    await sendLine("4");
    cursor = await waitForOutput(/Are you sure you want to restart watcher\? \(y\/n\):/, cursor);
    await sendLine("y");
    cursor = await waitForOutput(/Restart Watcher succeeded\./, cursor);
    cursor = await waitForOutput(/Press Enter to return to menu/, cursor);
    await sendLine("");
    cursor = await waitForOutput(/Select an option:/, cursor);
    await sendLine("5");
    cursor = await waitForOutput(/Recent Transcription Jobs/, cursor);
    cursor = await waitForOutput(/Press Enter to return to menu/, cursor);
    await sendLine("");
    cursor = await waitForOutput(/Select an option:/, cursor);
    await sendLine("6");
    cursor = await waitForOutput(/Opened Latest Transcript:/, cursor);
    cursor = await waitForOutput(/Press Enter to return to menu/, cursor);
    await sendLine("");
    cursor = await waitForOutput(/Select an option:/, cursor);
    await sendLine("3");
    cursor = await waitForOutput(/Are you sure you want to stop watcher\? \(y\/n\):/, cursor);
    await sendLine("y");
    cursor = await waitForOutput(/Stop Watcher succeeded\./, cursor);
    cursor = await waitForOutput(/Press Enter to return to menu/, cursor);
    await sendLine("");
    await waitForOutput(/Select an option:/, cursor);
    await sendLine("7");
    child.stdin.end();
    const exitCode = childClosed
        ? (childExitCode ?? 0)
        : await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
                reject(new Error("Menu workflow test timed out."));
            }, 5000);
            child.on("error", (error) => {
                clearTimeout(timer);
                reject(error);
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                resolve(code ?? 0);
            });
        });
    assert.equal(stderr, "");
    assert.equal(exitCode, 0);
    assert.match(stdout, /AutoTranscribe2 WatcherControl/);
    assert.match(stdout, /Start Watcher succeeded\./);
    assert.match(stdout, /Restart Watcher succeeded\./);
    assert.match(stdout, /Recent Transcription Jobs/);
    assert.match(stdout, /Opened Latest Transcript:/);
    assert.match(stdout, /Stop Watcher succeeded\./);
});
