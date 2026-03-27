import test from "node:test";
import assert from "node:assert/strict";
import { createBackend } from "../infrastructure/backend/BackendFactory.js";
import { MlxWhisperBackend } from "../infrastructure/backend/MlxWhisperBackend.js";
import { ParakeetBackend } from "../infrastructure/backend/ParakeetBackend.js";
import type { BackendConfig } from "../infrastructure/config/AppConfig.js";

function baseConfig(type: BackendConfig["type"]): BackendConfig {
  return {
    type,
    pythonExecutable: "python3",
    scriptPath: "./py-backend/stub.py",
    languageHint: null,
    options: { modelSize: "medium" }
  };
}

test("createBackend returns MlxWhisperBackend for type mlx_whisper", () => {
  const backend = createBackend(baseConfig("mlx_whisper"));
  assert.ok(backend instanceof MlxWhisperBackend);
});

test("createBackend returns ParakeetBackend for type parakeet", () => {
  const backend = createBackend(baseConfig("parakeet"));
  assert.ok(backend instanceof ParakeetBackend);
});
