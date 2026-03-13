import type { TitleSuggester } from "./TitleSuggester.js";

const DUTCH_STOPWORDS = new Set([
  "de","het","een","en","of","maar","dan","dus","dat",
  "ik","jij","je","hij","zij","we","wij","jullie","ze",
  "is","was","heb","heeft","hebben","kan","kunnen",
  "van","in","op","aan","bij","met","voor","naar"
]);

// Additional high-noise tokens we don't want as title words.
const FILLER_TOKENS = new Set([
  "ja","nee","niet","wel","geen","ook","nog","al","maar","dan","dus",
  "die","dit","deze","dat","daar","hier","waar","wat","wie","hoe",
  "zijn","ben","bent","was","waren","wordt","worden","doen","gaat","gaan",
  "oké","oke","uh","uhm","eh","euh",
  "transcript","transcription","cleaned","cleaned_transcript"
]);

function tokenize(text: string): string[] {
  // Keep letters (incl. accented) and digits as tokens.
  const matches = text.match(/[A-Za-zÀ-ÿ0-9]+/g);
  return matches ?? [];
}

function isStopword(token: string): boolean {
  return DUTCH_STOPWORDS.has(token.toLowerCase());
}

function isFiller(token: string): boolean {
  return FILLER_TOKENS.has(token.toLowerCase());
}

function normalizeTokens(tokens: string[]): string[] {
  // Collapse obvious repetition and drop very short non-numeric tokens.
  const out: string[] = [];
  let prevLower = "";
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (lower === prevLower) {
      continue;
    }
    prevLower = lower;
    if (/^\d+$/.test(t)) {
      out.push(t);
      continue;
    }
    if (t.length < 3) {
      continue;
    }
    out.push(t);
  }
  return out;
}

function scoreCandidate(tokens: string[], freq: Map<string, number>): number {
  let score = 0;
  let contentCount = 0;
  let strongContentCount = 0;
  let rareContentCount = 0;
  let hasProperNoun = false;

  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (!isStopword(t) && !isFiller(t)) {
      contentCount += 1;
      const f = freq.get(lower) ?? 0;
      score += f;
      if (t.length >= 5) strongContentCount += 1;
      if (t.length >= 5 && f > 0 && f <= 3) rareContentCount += 1;
    }
    if (/^[A-ZÀ-Ý]/.test(t) && /[a-zà-ÿ]/.test(t)) {
      hasProperNoun = true;
    }
  }

  if (contentCount === 0) return 0;
  if (contentCount >= 2) score += 3;
  if (strongContentCount >= 1) score += 2;
  if (rareContentCount >= 1) score += 4;
  if (hasProperNoun) score += 2;

  return score;
}

function trimStopwordsAtEdges(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;

  while (end - start > 1 && (isStopword(tokens[start]) || isFiller(tokens[start]))) start += 1;
  while (end - start > 1 && (isStopword(tokens[end - 1]) || isFiller(tokens[end - 1]))) end -= 1;

  return tokens.slice(start, end);
}

export class HeuristicTitleSuggester implements TitleSuggester {
  async suggestTitle(input: {
    transcriptText: string;
    fallbackTitle: string;
    languageHint?: string | null;
    maxWords?: number;
  }): Promise<string> {
    const maxWords = input.maxWords ?? 5;

    // Limit work: look at the beginning only.
    const head = input.transcriptText.slice(0, 12000);
    const tokens = normalizeTokens(tokenize(head));

    if (tokens.length < 2) {
      return "";
    }

    // Word frequency of non-stopwords/fillers within the analyzed head window.
    const freq = new Map<string, number>();
    for (const t of tokens) {
      if (isStopword(t) || isFiller(t)) continue;
      const lower = t.toLowerCase();
      freq.set(lower, (freq.get(lower) ?? 0) + 1);
    }

    let best: string[] = [];
    let bestScore = 0;

    const maxN = Math.min(maxWords, 5);
    // Generate ngrams of length 2..maxN from the first ~600 tokens.
    const limit = Math.min(tokens.length, 600);
    // Skip the very beginning (often greetings / check-in noise).
    const startAt = Math.min(80, limit);
    for (let i = startAt; i < limit; i++) {
      for (let n = 2; n <= maxN; n++) {
        if (i + n > limit) break;
        const cand = trimStopwordsAtEdges(tokens.slice(i, i + n));
        if (cand.length < 2) continue;

        const s = scoreCandidate(cand, freq);
        if (s > bestScore) {
          bestScore = s;
          best = cand;
        }
      }
    }

    // Reject weak titles where meaningful content is missing.
    const meaningful = best.filter((t) => !isStopword(t) && !isFiller(t) && t.length >= 5);
    if (meaningful.length < 2) {
      return "";
    }

    // Minimal quality bar.
    if (bestScore < 12) {
      return "";
    }

    return best.join(" ");
  }
}

