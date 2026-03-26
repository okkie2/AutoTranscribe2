export function extractFirstAllowedKey(text, allowedKeys) {
    for (const char of text) {
        if (allowedKeys.includes(char)) {
            return char;
        }
    }
    return null;
}
