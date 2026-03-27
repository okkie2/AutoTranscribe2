import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setBackendType } from "../infrastructure/config/ConfigWriter.js";
function withTempConfig(content, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "autotranscribe-test-"));
    const filePath = path.join(tmpDir, "config.yaml");
    fs.writeFileSync(filePath, content, "utf8");
    try {
        fn(filePath);
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true });
    }
}
const SAMPLE_CONFIG = `backend:
  type: "mlx_whisper"
  script_path: "./py-backend/mlx_whisper_backend.py"
  python_executable: "python3"
`;
test("setBackendType updates type and script_path to parakeet", () => {
    withTempConfig(SAMPLE_CONFIG, (filePath) => {
        setBackendType(filePath, "parakeet");
        const updated = fs.readFileSync(filePath, "utf8");
        assert.ok(updated.includes('type: "parakeet"'), "type should be updated");
        assert.ok(updated.includes('script_path: "./py-backend/parakeet_backend.py"'), "script_path should be updated");
    });
});
test("setBackendType updates type and script_path back to mlx_whisper", () => {
    const parakeetConfig = SAMPLE_CONFIG
        .replace('type: "mlx_whisper"', 'type: "parakeet"')
        .replace("mlx_whisper_backend.py", "parakeet_backend.py");
    withTempConfig(parakeetConfig, (filePath) => {
        setBackendType(filePath, "mlx_whisper");
        const updated = fs.readFileSync(filePath, "utf8");
        assert.ok(updated.includes('type: "mlx_whisper"'), "type should be updated");
        assert.ok(updated.includes('script_path: "./py-backend/mlx_whisper_backend.py"'), "script_path should be updated");
    });
});
test("setBackendType preserves unrelated config lines", () => {
    withTempConfig(SAMPLE_CONFIG, (filePath) => {
        setBackendType(filePath, "parakeet");
        const updated = fs.readFileSync(filePath, "utf8");
        assert.ok(updated.includes('python_executable: "python3"'), "unrelated lines should be preserved");
    });
});
