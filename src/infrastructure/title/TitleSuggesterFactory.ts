import type { TitleConfig } from "../config/AppConfig.js";
import type { TitleSuggester } from "../../application/TitleSuggester.js";
import { HeuristicTitleSuggester } from "../../application/HeuristicTitleSuggester.js";
import { OllamaTitleSuggester } from "./OllamaTitleSuggester.js";

class NoneTitleSuggester implements TitleSuggester {
  async suggestTitle(): Promise<string> {
    return "";
  }
}

export function createTitleSuggester(config: TitleConfig): TitleSuggester {
  if (!config.enabled || config.provider === "none") {
    return new NoneTitleSuggester();
  }
  if (config.provider === "ollama") {
    return new OllamaTitleSuggester(config);
  }
  return new HeuristicTitleSuggester();
}

