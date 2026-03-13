import test from "node:test";
import assert from "node:assert/strict";
import { slugifyTitle, formatTranscriptWithTitle } from "../application/TranscriptTitleFormatter.js";
test("slugifyTitle builds a basic slug", () => {
    const slug = slugifyTitle("Kennismaking met Sabine");
    assert.equal(slug, "kennismaking-met-sabine");
});
test("slugifyTitle removes punctuation and collapses dashes", () => {
    const slug = slugifyTitle("Kennismaking met Sabine & Major Finding!");
    assert.equal(slug, "kennismaking-met-sabine-major-finding");
});
test("slugifyTitle falls back to 'untitled' when input is empty", () => {
    assert.equal(slugifyTitle(""), "untitled");
    assert.equal(slugifyTitle("   "), "untitled");
});
test("formatTranscriptWithTitle prefixes content with H1 and builds filename", () => {
    const raw = "Dit is de ruwe transcriptie.";
    const { title, finalContent, finalFileName } = formatTranscriptWithTitle(raw, "Kennismaking met Sabine", "2025-12-03_14-03-14");
    assert.equal(title, "Kennismaking met Sabine");
    assert.ok(finalContent.startsWith("# Kennismaking met Sabine\n\nDit is de ruwe transcriptie."), "finalContent should start with H1 title followed by raw content");
    assert.equal(finalFileName, "2025-12-03_14-03-14_kennismaking-met-sabine.md");
});
test("formatTranscriptWithTitle handles empty suggested title", () => {
    const { title, finalContent, finalFileName } = formatTranscriptWithTitle("Ruwe tekst.", "   ", "2025-12-03_14-03-14");
    assert.equal(title, "Untitled");
    assert.ok(finalContent.startsWith("# Untitled\n\nRuwe tekst."));
    assert.equal(finalFileName, "2025-12-03_14-03-14_Untitled.md");
});
