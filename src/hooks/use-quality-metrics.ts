import { useMemo } from "react";

import type { FinalOutput, StageRecord } from "@/lib/insight/types";

export type QualityMetrics = {
  charCount: number;
  sectionCount: number;
  cjkRatio: number;
  advisoryCheck: "Pass" | "Fail";
  hypothesisCount: number;
  indicatorCount: number;
  numericDensity: number;
  causalChainDepth: number;
  sourceCount: number;
  temporalSpecificity: number;
  counterargumentQuality: boolean;
};

export function useQualityMetrics(finalOutput: FinalOutput | null, stageRecords: StageRecord[]) {
  return useMemo<QualityMetrics | null>(() => {
    const output = finalOutput;
    if (!output) return null;

    const markdownOutput = output.markdownOutput || "";
    const charCount = markdownOutput.length;
    const normalizedCharCount = Math.max(charCount, 1);

    const sectionCount =
      output.portfolioImpactTable.length +
      output.watchTriggers.length +
      output.competingHypotheses.length +
      output.whySections.length +
      output.historicalPrecedents.length +
      (output.structuralRead ? 1 : 0) +
      (output.premortem?.coreThesis ? 1 : 0);

    const cjkMatches = markdownOutput.match(/[一-鿿]/g);
    const cjkRatio = cjkMatches ? (cjkMatches.length / charCount) * 100 : 0;

    const advisoryWords = ["매수", "매도", "비중 축소", "비중 확대", "적극 매수", "손절"];
    const advisoryCheck = advisoryWords.some((word) => markdownOutput.includes(word)) ? "Fail" : "Pass";

    const hypothesisCount = output.competingHypotheses.length;

    const indicatorCount = output.portfolioImpactTable.reduce((sum, row) => {
      const indicators = row.monitoringIndicators || (row as unknown as { monitoring_indicators?: unknown[] }).monitoring_indicators;
      return sum + (indicators?.length || 0);
    }, 0);

    const numericMatches = markdownOutput.match(/\d+[\d,.]*(%|원|달러|조|억|만|건|개|명)?/g) ?? [];
    const numericDensity = (numericMatches.length / normalizedCharCount) * 1000;

    const causalMatches = markdownOutput.match(/→|때문에|결과적으로|따라서|이로 인해|이에 따라|영향으로/g) ?? [];
    const causalChainDepth = causalMatches.length;

    const evidenceRecord = stageRecords.find((record) => record.stage === "evidence_consolidation");
    const evidenceOutput = evidenceRecord?.output;
    const evidenceRaw = evidenceOutput && typeof evidenceOutput === "object"
      ? (evidenceOutput as Record<string, unknown>)
      : null;
    const factsCandidate = [evidenceRaw?.facts, evidenceRaw?.verifiedFacts, evidenceRaw?.factEntries].find(Array.isArray) as
      | Array<Record<string, unknown>>
      | undefined;
    const verifiedSources = new Set(
      (factsCandidate ?? [])
        .filter((item) => item?.status === "verified")
        .map((item) => String(item.source ?? "").trim())
        .filter(Boolean)
    );
    const urlSources = markdownOutput.match(/https?:\/\/[^\s)]+/g) ?? [];
    const namedSources = Array.from(
      markdownOutput.matchAll(/(?:출처|source)\s*[:：]\s*([^\n,;]+)/gi),
      (match) => match[1].trim()
    ).filter(Boolean);
    const sourceCount = new Set([...verifiedSources, ...urlSources, ...namedSources]).size;

    const temporalMatches = markdownOutput.match(/\d{1,2}\/\d{1,2}|\d{4}년|\d{1,2}월|\dQ\d|분기|반기/g) ?? [];
    const temporalSpecificity = temporalMatches.length;

    const counterargumentText = [
      ...(output.inconsistencies ?? []).map((item) => JSON.stringify(item)),
      ...(output.narrativeParallels ?? []).map((item) => JSON.stringify(item)),
    ].join(" ");
    const counterargumentQuality = /\d/.test(counterargumentText);

    return {
      charCount,
      sectionCount,
      cjkRatio,
      advisoryCheck,
      hypothesisCount,
      indicatorCount,
      numericDensity,
      causalChainDepth,
      sourceCount,
      temporalSpecificity,
      counterargumentQuality,
    };
  }, [finalOutput, stageRecords]);
}
