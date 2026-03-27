import { spawn } from "node:child_process";
/**
 * ParakeetBackend delegates transcription to a Python subprocess running the
 * parakeet_backend.py script, which uses the parakeet_mlx library on Apple Silicon.
 */
export class ParakeetBackend {
    constructor(config) {
        this.config = config;
    }
    async transcribe(audioFile, options) {
        const language = options.languageHint ?? this.config.languageHint ?? "";
        const args = [
            this.config.scriptPath,
            audioFile.path
        ];
        if (language) {
            args.push("--language", language);
        }
        const modelId = this.config.options.modelId;
        if (modelId) {
            args.push("--model-id", modelId);
        }
        const python = this.config.pythonExecutable;
        const content = await new Promise((resolve, reject) => {
            const child = spawn(python, args, { stdio: ["ignore", "pipe", "pipe"] });
            let stdout = "";
            let stderr = "";
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
                stdout += chunk;
            });
            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk) => {
                stderr += chunk;
            });
            child.on("error", (err) => {
                reject(new Error(`Failed to start Python backend: ${err.message}`));
            });
            child.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                }
                else {
                    reject(new Error(`Python backend exited with code ${code}. Stderr: ${stderr.trim()}`));
                }
            });
        });
        return {
            path: "",
            content
        };
    }
}
