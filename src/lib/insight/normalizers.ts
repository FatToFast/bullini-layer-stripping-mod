import { parseInsightDataset } from "./schemas";
import type { InsightDataset } from "./types";

export function normalizeRawInput(rawJson: string): InsightDataset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid JSON: unable to parse input string");
  }
  return parseInsightDataset(parsed);
}
