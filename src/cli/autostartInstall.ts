import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";

function buildPlist(label: string, projectRoot: string): string {
  const shell = "/bin/zsh";
  const command = `cd ${projectRoot} && npm run start:all`;
  const pathEnv = process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${shell}</string>
    <string>-lc</string>
    <string>${command}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathEnv}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(os.homedir(), "Library/Logs/autotranscribe2.out.log")}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(os.homedir(), "Library/Logs/autotranscribe2.err.log")}</string>
</dict>
</plist>
`;
}

async function main() {
  const config = loadConfig("config.yaml");
  const { autostart } = config;

  if (!autostart.enabled) {
    console.log("[autostart:install] autostart.enabled is false in config.yaml; not installing launch agent.");
    console.log("[autostart:install] Set autostart.enabled: true and re-run to install.");
    return;
  }

  const projectRoot = process.cwd();
  const label = autostart.label;
  const launchAgentsDir = path.join(os.homedir(), "Library/LaunchAgents");
  const plistPath = path.join(launchAgentsDir, `${label}.plist`);

  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const plistContent = buildPlist(label, projectRoot);
  fs.writeFileSync(plistPath, plistContent, { encoding: "utf8" });
  console.log("[autostart:install] Wrote launch agent plist to:", plistPath);

  // Reload the launch agent
  console.log("[autostart:install] Reloading launch agent via launchctl...");
  spawnSync("launchctl", ["unload", "-w", plistPath], { stdio: "ignore" });
  const result = spawnSync("launchctl", ["load", "-w", plistPath], { stdio: "inherit" });
  if (result.error) {
    console.error("[autostart:install] Failed to load launch agent:", result.error.message);
  } else {
    console.log("[autostart:install] Launch agent loaded. AutoTranscribe2 will start at login via start:all.");
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[autostart:install] Unexpected error:", message);
  process.exit(1);
});

