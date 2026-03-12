import type { FinalOutput } from "./types";

export function formatAsMarkdown(output: FinalOutput): string {
  if (output.markdownOutput) {
    return output.markdownOutput;
  }

  const parts: string[] = [];

  parts.push(`## One-Line Take\n\n${output.oneLineTake}\n`);
  parts.push(`## Analyst Note\n\n${output.analystNote}\n`);

  if (output.factBox.length > 0) {
    parts.push(`## Fact Box\n`);
    for (const fact of output.factBox) {
      const statusTag = fact.status === "verified" ? "\u2713" : "\u26A0";
      parts.push(`- ${statusTag} ${fact.statement} (${fact.source}, ${fact.asOf})`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

export function formatAsPlainText(output: FinalOutput): string {
  if (output.plainTextOutput) {
    return output.plainTextOutput;
  }

  const parts: string[] = [];

  parts.push(`[One-Line Take]`);
  parts.push(output.oneLineTake);
  parts.push("");
  parts.push(`[Analyst Note]`);
  parts.push(output.analystNote);
  parts.push("");

  if (output.factBox.length > 0) {
    parts.push(`[Fact Box]`);
    for (const fact of output.factBox) {
      const statusTag = fact.status === "verified" ? "[V]" : "[?]";
      parts.push(`${statusTag} ${fact.statement} (${fact.source}, ${fact.asOf})`);
    }
  }

  return parts.join("\n");
}

export function formatAsJson(output: FinalOutput): string {
  return JSON.stringify(output, null, 2);
}
