import fs from "node:fs";
import path from "node:path";
import { HeuristicTitleSuggester } from "../application/HeuristicTitleSuggester.js";
import { loadConfig } from "../infrastructure/config/YamlConfigLoader.js";
import { OllamaTitleSuggester } from "../infrastructure/title/OllamaTitleSuggester.js";
function usage() {
    console.error("Usage: node dist/cli/titlePreview.js <transcriptions-dir> [count]");
    process.exit(1);
}
function listTxtFilesSortedByNameDescending(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".txt"))
        .map((e) => path.join(dir, e.name));
    // "First 7" interpreted as latest by timestamp in filename.
    files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
    return files;
}
function extractTimestampBaseName(filePath) {
    const base = path.basename(filePath);
    const m = base.match(/^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
    return m?.[1] ?? base.replace(/\.txt$/i, "");
}
async function main() {
    const [, , dirArg, countArg] = process.argv;
    if (!dirArg)
        usage();
    const dir = path.resolve(dirArg);
    const count = countArg ? Number(countArg) : 7;
    if (!Number.isFinite(count) || count <= 0)
        usage();
    const files = listTxtFilesSortedByNameDescending(dir).slice(0, count);
    const config = loadConfig("config.yaml");
    let suggester;
    if (config.title.enabled && config.title.provider === "ollama") {
        suggester = new OllamaTitleSuggester(config.title);
    }
    else {
        // Preview should still work even if titles are disabled in config.
        suggester = new HeuristicTitleSuggester();
    }
    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        const ts = extractTimestampBaseName(file);
        const title = await suggester.suggestTitle({
            transcriptText: text,
            fallbackTitle: ts,
            languageHint: config.title.languageHint ?? "nl",
            maxWords: config.title.maxWords ?? 5
        });
        const finalTitle = title && title.trim() ? title.trim() : "Untitled";
        console.log(`${path.basename(file)}  ->  ${finalTitle}`);
    }
}
main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`titlePreview failed: ${msg}`);
    process.exit(1);
});
