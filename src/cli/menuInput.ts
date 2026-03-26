export function extractFirstAllowedKey(text: string, allowedKeys: readonly string[]): string | null {
  for (const char of text) {
    if (allowedKeys.includes(char)) {
      return char;
    }
  }

  return null;
}
