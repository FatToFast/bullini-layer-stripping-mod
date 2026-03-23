import { DEFAULT_DECISION_STAGE_PROMPTS } from "./prompts";
import type {
  DecisionEvaluationResult,
  DecisionModelSettings,
  DecisionStageName,
  ModelConfigOverride,
} from "./types";

const STAGE_KEYWORDS: Record<DecisionStageName, string[]> = {
  task_reframing: ["question", "reframe", "reframing", "과제", "질문", "재정의", "framing"],
  stakeholder_mapping: ["stakeholder", "viewpoint", "관점", "이해관계", "voice", "정렬", "충돌"],
  option_synthesis: ["option", "options", "선택지", "옵션", "compare", "경로"],
  orchestration_design: ["orchestration", "gate", "checkpoint", "owner", "AI", "human", "실행", "병목"],
  persona_rehearsal: ["persona", "rehearsal", "objection", "premortem", "반론", "리허설", "risk"],
  decision_synthesis: ["decision", "brief", "handoff", "meta", "최종", "브리프", "handoff"],
};

function inferStageFromHypothesis(hypothesis: string): DecisionStageName {
  const lower = hypothesis.toLowerCase();
  for (const [stage, keywords] of Object.entries(STAGE_KEYWORDS) as Array<[DecisionStageName, string[]]>) {
    if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      return stage;
    }
  }
  return "decision_synthesis";
}

function appendPromptGuidance(basePrompt: string, notes: string[]) {
  const guidance = notes.map((note) => `- ${note}`).join("\n");
  return `${basePrompt.trim()}\n\n추가 개선 지침:\n${guidance}`;
}

export function buildPromptOverridesFromEvaluation(
  evaluation: DecisionEvaluationResult,
  currentSettings?: DecisionModelSettings,
): { suggestedModelSettings: DecisionModelSettings; notes: string[] } {
  const grouped = new Map<DecisionStageName, string[]>();
  const notes = evaluation.improvementHypotheses.length > 0
    ? evaluation.improvementHypotheses
    : evaluation.breakdown
        .filter((item) => item.score < 80)
        .map((item) => `${item.criterion}: ${item.comment}`);

  for (const note of notes) {
    const stage = inferStageFromHypothesis(note);
    grouped.set(stage, [...(grouped.get(stage) ?? []), note]);
  }

  const stageOverrides: Partial<Record<DecisionStageName, ModelConfigOverride>> = {
    ...(currentSettings?.stages ?? {}),
  };

  for (const [stage, stageNotes] of grouped.entries()) {
    const currentOverride = currentSettings?.stages?.[stage] ?? {};
    const basePrompt = currentOverride.prompt?.trim() || DEFAULT_DECISION_STAGE_PROMPTS[stage];
    stageOverrides[stage] = {
      ...currentOverride,
      prompt: appendPromptGuidance(basePrompt, stageNotes),
    };
  }

  return {
    suggestedModelSettings: {
      defaults: currentSettings?.defaults,
      stages: stageOverrides,
    },
    notes,
  };
}
