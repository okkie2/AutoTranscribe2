import test from "node:test";
import assert from "node:assert/strict";
import { extractFirstAllowedKey } from "../cli/menuInput.js";
test("extractFirstAllowedKey returns the first allowed key from a chunk", () => {
    assert.equal(extractFirstAllowedKey("4", ["1", "4", "7"]), "4");
    assert.equal(extractFirstAllowedKey("44", ["1", "4", "7"]), "4");
    assert.equal(extractFirstAllowedKey("\r4", ["1", "4", "7"]), "4");
});
test("extractFirstAllowedKey ignores unrelated keys", () => {
    assert.equal(extractFirstAllowedKey("x", ["1", "4", "7"]), null);
    assert.equal(extractFirstAllowedKey("xy4", ["1", "4", "7"]), "4");
});
