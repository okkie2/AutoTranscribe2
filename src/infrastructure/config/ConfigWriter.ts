import fs from "node:fs";
import path from "node:path";
import type { BackendConfig } from "./AppConfig.js";

const DEFAULT_SCRIPT_PATHS: Record<BackendConfig["type"], string> = {
  mlx_whisper: "./py-backend/mlx_whisper_backend.py",
  parakeet: "./py-backend/parakeet_backend.py"
};

/**
 * Update backend.type and backend.script_path in config.yaml in-place.
 * Uses targeted regex replacements so unrelated formatting is preserved.
 */
export function setBackendType(configPath: string, type: BackendConfig["type"]): void {
  const resolved = path.resolve(configPath);
  let text = fs.readFileSync(resolved, "utf8");

  const prevText = text;

  text = text.replace(/(\btype:\s*")[^"]*(")/m, `$1${type}$2`);
  text = text.replace(/(\bscript_path:\s*")[^"]*(")/m, `$1${DEFAULT_SCRIPT_PATHS[type]}$2`);

  if (text === prevText) {
    throw new Error(`Could not find backend type or script_path fields in ${resolved}`);
  }

  fs.writeFileSync(resolved, text, "utf8");
}
