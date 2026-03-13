import { HeuristicTitleSuggester } from "../../application/HeuristicTitleSuggester.js";
import { OllamaTitleSuggester } from "./OllamaTitleSuggester.js";
class NoneTitleSuggester {
    async suggestTitle() {
        return "";
    }
}
export function createTitleSuggester(config) {
    if (!config.enabled || config.provider === "none") {
        return new NoneTitleSuggester();
    }
    if (config.provider === "ollama") {
        return new OllamaTitleSuggester(config);
    }
    return new HeuristicTitleSuggester();
}
