#!/usr/bin/env node
/**
 * Sync docs/issues/*.md to GitHub issues.
 * - Issues are matched by <!-- sync-id: NN-name --> in the body, or by title on first run.
 * - Run from repo root; requires gh CLI and GH_TOKEN (or gh auth).
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.argv[2] || process.cwd();
const ISSUES_DIR = join(REPO_ROOT, "docs", "issues");

function gh(args, input) {
  const opts = { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 };
  const cmd = `gh ${args}`;
  return input
    ? execSync(cmd, { ...opts, input })
    : execSync(cmd, opts);
}

function getOpenIssues() {
  const out = gh('issue list --state open --json number,title,body --limit 500');
  return JSON.parse(out);
}

function extractSyncId(body) {
  if (!body || typeof body !== "string") return null;
  const firstLine = body.split("\n")[0];
  const m = firstLine && firstLine.match(/<!-- sync-id: (\S+) -->/);
  return m ? m[1] : null;
}

const issues = getOpenIssues();
const syncIdToNum = {};
const titleToNum = {};
for (const i of issues) {
  const id = extractSyncId(i.body);
  if (id) syncIdToNum[id] = String(i.number);
  titleToNum[i.title] = String(i.number);
}

let dir;
try {
  dir = readdirSync(ISSUES_DIR);
} catch {
  console.log("No docs/issues directory, skipping sync.");
  process.exit(0);
}

const mdFiles = dir.filter((f) => f.endsWith(".md")).sort();
for (const file of mdFiles) {
  const syncId = file.replace(/\.md$/, "");
  const path = join(ISSUES_DIR, file);
  const content = readFileSync(path, "utf8");
  const firstLine = content.split("\n")[0];
  const title = firstLine.replace(/^#\s*/, "").trim();
  const body = `<!-- sync-id: ${syncId} -->\n${content}`;
  const bodyFile = join(REPO_ROOT, "docs", "issues", file + ".body");
  writeFileSync(bodyFile, body);

  let num = syncIdToNum[syncId] || titleToNum[title];
  try {
    if (num) {
      console.log("Updating issue #%s: %s", num, title);
      gh(`issue edit ${num} --title ${JSON.stringify(title)} --body-file ${JSON.stringify(bodyFile)}`);
    } else {
      console.log("Creating issue: %s", title);
      gh(`issue create --title ${JSON.stringify(title)} --body-file ${JSON.stringify(bodyFile)}`);
    }
  } finally {
    try { unlinkSync(bodyFile); } catch (_) {}
  }
}

console.log("Sync done.");
