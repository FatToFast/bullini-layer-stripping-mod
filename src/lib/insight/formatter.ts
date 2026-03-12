import type { FinalOutput } from "./types";

export function formatAsMarkdown(output: FinalOutput): string {
  if (output.markdownOutput) {
    return output.markdownOutput;
  }

  const parts: string[] = [];

  parts.push(`## One-Line Take\n\n${output.oneLineTake}\n`);
  parts.push(`## Structural Read\n\n${output.structuralRead}\n`);

  if (output.portfolioImpactTable.length > 0) {
    parts.push("## Portfolio Impact");
    for (const row of output.portfolioImpactTable) {
      parts.push(
        `- ${row.company} [${row.held}] ${row.exposureType}: ${row.whatChangesToday} / ${row.action} (${row.confidence})`
      );
    }
    parts.push("");
  }

  return parts.join("\n");
}

export function formatAsPlainText(output: FinalOutput): string {
  const parts: string[] = [];

  parts.push(`[One-Line Take]`);
  parts.push(output.oneLineTake);
  parts.push("");
  parts.push(`[Structural Read]`);
  parts.push(output.structuralRead);
  parts.push("");

  if (output.portfolioImpactTable.length > 0) {
    parts.push(`[Portfolio Impact]`);
    for (const row of output.portfolioImpactTable) {
      parts.push(
        `- ${row.company} [${row.held}] ${row.exposureType}: ${row.whatChangesToday} / ${row.action} (${row.confidence})`
      );
    }
  }

  return parts.join("\n");
}

export function formatAsJson(output: FinalOutput): string {
  return JSON.stringify(output, null, 2);
}
