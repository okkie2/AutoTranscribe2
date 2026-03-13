/**
 * Create a filesystem-safe, reasonably short slug from a human title.
 */
export function slugifyTitle(title, maxLength = 80) {
    const trimmed = title.trim().toLowerCase();
    if (!trimmed) {
        return "untitled";
    }
    // Replace non letter/number sequences with a single dash.
    const cleaned = trimmed.replace(/[^a-z0-9]+/g, "-");
    const collapsed = cleaned.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    const truncated = collapsed.slice(0, maxLength).replace(/-+$/g, "");
    return truncated || "untitled";
}
/**
 * Given raw transcript content, a suggested title, and the original base name
 * (timestamp), produce the final Markdown content and filename.
 *
 * - Ensures the title is present as a Markdown H1 at the top of the file.
 * - Builds a filename of the form "{timestamp}_{slugified-title}.md".
 */
export function formatTranscriptWithTitle(rawContent, suggestedTitle, originalBaseName) {
    const normalizedBase = originalBaseName.trim() || "unknown";
    const effectiveTitle = suggestedTitle && suggestedTitle.trim() ? suggestedTitle.trim() : "Untitled";
    const finalFileName = effectiveTitle === "Untitled"
        ? `${normalizedBase}_Untitled.md`
        : `${normalizedBase}_${slugifyTitle(effectiveTitle)}.md`;
    const contentBody = rawContent.replace(/^\s+/, "");
    const finalContent = `# ${effectiveTitle}\n\n${contentBody}`;
    return {
        title: effectiveTitle,
        finalContent,
        finalFileName
    };
}
