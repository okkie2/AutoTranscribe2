export interface TitleSuggester {
  suggestTitle(input: {
    transcriptText: string;
    fallbackTitle: string; // e.g. timestamp; used only to decide fallback behavior
    languageHint?: string | null;
    maxWords?: number;
  }): Promise<string>;
}

