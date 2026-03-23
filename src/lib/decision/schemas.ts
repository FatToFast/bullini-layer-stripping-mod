import { z } from "zod";
import type {
  DecisionBenchmarkCase,
  DecisionEvaluationResult,
  DecisionFinalOutput,
  DecisionInput,
  OptionSynthesisOutput,
  OrchestrationDesignOutput,
  PersonaRehearsalOutput,
  StakeholderMappingOutput,
  TaskReframingOutput,
} from "./types";

export const decisionInputSchema = z.object({
  task: z.string().min(1),
  background: z.string().optional(),
  context: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  stakeholders: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  availableArtifacts: z.array(z.string()).optional(),
  plannerHistory: z.array(z.string()).optional(),
});

const hiddenAssumptionSchema = z.object({
  assumption: z.string(),
  whyItMatters: z.string(),
  riskIfWrong: z.string(),
});

const decisionQuestionCandidateSchema = z.object({
  question: z.string(),
  whyThisQuestion: z.string(),
  signalToWatch: z.string(),
});

export const taskReframingSchema = z.object({
  statedTask: z.string(),
  actualDecision: z.string(),
  whyNow: z.string(),
  hiddenAssumptions: z.array(hiddenAssumptionSchema),
  nonGoals: z.array(z.string()),
  reframedQuestions: z.array(decisionQuestionCandidateSchema).min(1),
  recommendedQuestion: z.string(),
});

const stakeholderMapItemSchema = z.object({
  stakeholder: z.string(),
  viewpoint: z.string(),
  coreConcern: z.string(),
  decisionCriterion: z.string(),
  whatWouldChangeTheirMind: z.string(),
});

export const stakeholderMappingSchema = z.object({
  stakeholderMap: z.array(stakeholderMapItemSchema).min(1),
  alignmentZones: z.array(z.string()),
  tensions: z.array(z.string()),
  missingVoices: z.array(z.string()),
});

const decisionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  whenItWins: z.string(),
  failureMode: z.string(),
  evidenceNeeded: z.array(z.string()),
});

export const optionSynthesisSchema = z.object({
  options: z.array(decisionOptionSchema).min(2),
  comparisonAxes: z.array(z.string()).min(1),
  recommendedOptionId: z.string(),
  whyThisOption: z.string(),
});

const orchestrationStepSchema = z.object({
  step: z.string(),
  owner: z.enum(["ai", "human", "collab"]),
  objective: z.string(),
  deliverable: z.string(),
  dependsOn: z.array(z.string()),
  decisionGate: z.string(),
});

export const orchestrationDesignSchema = z.object({
  orchestrationPlan: z.array(orchestrationStepSchema).min(1),
  bottlenecks: z.array(z.string()),
  checkpoints: z.array(z.string()),
  stopConditions: z.array(z.string()),
});

const rehearsalFindingSchema = z.object({
  persona: z.string(),
  strongestObjection: z.string(),
  whyItStings: z.string(),
  whatWouldAddressIt: z.string(),
  revisionRequired: z.boolean(),
});

export const personaRehearsalSchema = z.object({
  findings: z.array(rehearsalFindingSchema).min(1),
  unansweredQuestions: z.array(z.string()),
  preMortem: z.array(z.string()),
});

const keyAssumptionSchema = z.object({
  assumption: z.string(),
  status: z.enum(["load_bearing", "uncertain", "validated"]),
  test: z.string(),
});

const metaTuningSchema = z.object({
  observedBiases: z.array(z.string()),
  skippedChecks: z.array(z.string()),
  nextTimeAdjustments: z.array(z.string()),
});

const insightHandoffSchema = z.object({
  analysisPrompt: z.string(),
  additionalContext: z.array(z.string()),
});

export const decisionFinalOutputSchema = z.object({
  recommendedQuestion: z.string(),
  decisionStatement: z.string(),
  recommendedOptionId: z.string(),
  options: z.array(decisionOptionSchema).min(2),
  orchestrationPlan: z.array(orchestrationStepSchema).min(1),
  stakeholderBriefs: z.array(stakeholderMapItemSchema).min(1),
  rehearsalFindings: z.array(rehearsalFindingSchema).min(1),
  keyAssumptions: z.array(keyAssumptionSchema).min(1),
  revisitTriggers: z.array(z.string()),
  metaTuning: metaTuningSchema,
  insightHandoff: insightHandoffSchema,
});

export const decisionEvaluationSchema = z.object({
  score: z.number(),
  reasoning: z.string(),
  verdict: z.enum(["keep", "iterate", "discard"]),
  breakdown: z.array(
    z.object({
      criterion: z.string(),
      score: z.number(),
      comment: z.string(),
    })
  ),
  improvementHypotheses: z.array(z.string()),
});

export const decisionBenchmarkCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  input: decisionInputSchema,
  expectedCriteria: z.array(z.string()).min(1),
  notes: z.string().optional(),
});

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `[${issue.path.join(".")}] ${issue.message}`).join("; ");
}

export function parseDecisionInput(input: unknown): DecisionInput {
  const result = decisionInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`DecisionInput validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseTaskReframingOutput(input: unknown): TaskReframingOutput {
  const result = taskReframingSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Task reframing validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseStakeholderMappingOutput(input: unknown): StakeholderMappingOutput {
  const result = stakeholderMappingSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Stakeholder mapping validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseOptionSynthesisOutput(input: unknown): OptionSynthesisOutput {
  const result = optionSynthesisSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Option synthesis validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseOrchestrationDesignOutput(input: unknown): OrchestrationDesignOutput {
  const result = orchestrationDesignSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Orchestration design validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parsePersonaRehearsalOutput(input: unknown): PersonaRehearsalOutput {
  const result = personaRehearsalSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Persona rehearsal validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseDecisionFinalOutput(input: unknown): DecisionFinalOutput {
  const result = decisionFinalOutputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Decision final output validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseDecisionEvaluationResult(input: unknown): DecisionEvaluationResult {
  const result = decisionEvaluationSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Decision evaluation validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}

export function parseDecisionBenchmarkCase(input: unknown): DecisionBenchmarkCase {
  const result = decisionBenchmarkCaseSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Decision benchmark case validation failed: ${formatIssues(result.error.issues)}`);
  }
  return result.data;
}
