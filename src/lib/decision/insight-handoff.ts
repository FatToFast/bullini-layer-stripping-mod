import { parseInsightDataset } from "@/lib/insight/schemas";
import type { DecisionFinalOutput } from "./types";

export function mergeDecisionContextIntoInsightDataset(rawJson: string, decision: DecisionFinalOutput): string {
  const dataset = parseInsightDataset(JSON.parse(rawJson) as unknown);
  const additionalContext = [
    ...(dataset.additional_context ?? []),
    ...decision.insightHandoff.additionalContext,
    `Decision recommended question: ${decision.recommendedQuestion}`,
    `Decision statement: ${decision.decisionStatement}`,
    ...decision.keyAssumptions.map((item) => `Assumption (${item.status}): ${item.assumption} | test: ${item.test}`),
    ...decision.revisitTriggers.map((trigger) => `Revisit trigger: ${trigger}`),
  ];

  return JSON.stringify(
    {
      ...dataset,
      additional_context: Array.from(new Set(additionalContext)),
    },
    null,
    2,
  );
}

export function buildInsightAnalysisPromptFromDecision(decision: DecisionFinalOutput): string {
  return [
    decision.insightHandoff.analysisPrompt,
    `권고 질문: ${decision.recommendedQuestion}`,
    `권고 옵션: ${decision.recommendedOptionId}`,
    ...decision.rehearsalFindings.map(
      (finding) => `리허설 경고 - ${finding.persona}: ${finding.strongestObjection}`,
    ),
  ].join("\n");
}
