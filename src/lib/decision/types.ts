export type DecisionStageName =
  | "task_reframing"
  | "stakeholder_mapping"
  | "option_synthesis"
  | "orchestration_design"
  | "persona_rehearsal"
  | "decision_synthesis";

export const DECISION_STAGE_ORDER: DecisionStageName[] = [
  "task_reframing",
  "stakeholder_mapping",
  "option_synthesis",
  "orchestration_design",
  "persona_rehearsal",
  "decision_synthesis",
];

export type DecisionStageStatus = "idle" | "running" | "success" | "error" | "skipped";
export type DecisionStageResolution = "llm" | "fallback" | "skipped";

export type DecisionStageRecord = {
  stage: DecisionStageName;
  status: DecisionStageStatus;
  resolution?: DecisionStageResolution;
  input: unknown;
  userContent?: string;
  prompt?: string;
  output?: unknown;
  elapsedMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  model?: string;
  error?: string;
  warnings?: string[];
};

export type DecisionInput = {
  task: string;
  background?: string;
  context?: string[];
  constraints?: string[];
  stakeholders?: string[];
  successCriteria?: string[];
  availableArtifacts?: string[];
  plannerHistory?: string[];
};

export type ModelConfigOverride = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  prompt?: string;
};

export type DecisionModelSettings = {
  defaults?: Omit<ModelConfigOverride, "prompt">;
  stages?: Partial<Record<DecisionStageName, ModelConfigOverride>>;
};

export type DecisionStagePolicy = {
  enabled?: boolean;
  required?: boolean;
};

export type DecisionPipelineOptions = {
  modelSettings?: DecisionModelSettings;
  systemPrompt?: string;
  stagePolicies?: Partial<Record<DecisionStageName, DecisionStagePolicy>>;
};

export type HiddenAssumption = {
  assumption: string;
  whyItMatters: string;
  riskIfWrong: string;
};

export type DecisionQuestionCandidate = {
  question: string;
  whyThisQuestion: string;
  signalToWatch: string;
};

export type TaskReframingOutput = {
  statedTask: string;
  actualDecision: string;
  whyNow: string;
  hiddenAssumptions: HiddenAssumption[];
  nonGoals: string[];
  reframedQuestions: DecisionQuestionCandidate[];
  recommendedQuestion: string;
};

export type StakeholderMapItem = {
  stakeholder: string;
  viewpoint: string;
  coreConcern: string;
  decisionCriterion: string;
  whatWouldChangeTheirMind: string;
};

export type StakeholderMappingOutput = {
  stakeholderMap: StakeholderMapItem[];
  alignmentZones: string[];
  tensions: string[];
  missingVoices: string[];
};

export type DecisionOption = {
  id: string;
  label: string;
  summary: string;
  whenItWins: string;
  failureMode: string;
  evidenceNeeded: string[];
};

export type OptionSynthesisOutput = {
  options: DecisionOption[];
  comparisonAxes: string[];
  recommendedOptionId: string;
  whyThisOption: string;
};

export type OrchestrationStep = {
  step: string;
  owner: "ai" | "human" | "collab";
  objective: string;
  deliverable: string;
  dependsOn: string[];
  decisionGate: string;
};

export type OrchestrationDesignOutput = {
  orchestrationPlan: OrchestrationStep[];
  bottlenecks: string[];
  checkpoints: string[];
  stopConditions: string[];
};

export type PersonaRehearsalFinding = {
  persona: string;
  strongestObjection: string;
  whyItStings: string;
  whatWouldAddressIt: string;
  revisionRequired: boolean;
};

export type PersonaRehearsalOutput = {
  findings: PersonaRehearsalFinding[];
  unansweredQuestions: string[];
  preMortem: string[];
};

export type KeyAssumption = {
  assumption: string;
  status: "load_bearing" | "uncertain" | "validated";
  test: string;
};

export type MetaTuningOutput = {
  observedBiases: string[];
  skippedChecks: string[];
  nextTimeAdjustments: string[];
};

export type InsightHandoff = {
  analysisPrompt: string;
  additionalContext: string[];
};

export type DecisionFinalOutput = {
  recommendedQuestion: string;
  decisionStatement: string;
  recommendedOptionId: string;
  options: DecisionOption[];
  orchestrationPlan: OrchestrationStep[];
  stakeholderBriefs: StakeholderMapItem[];
  rehearsalFindings: PersonaRehearsalFinding[];
  keyAssumptions: KeyAssumption[];
  revisitTriggers: string[];
  metaTuning: MetaTuningOutput;
  insightHandoff: InsightHandoff;
};

export type DecisionRunResult = {
  runId: string;
  stages: DecisionStageRecord[];
  finalOutput: DecisionFinalOutput | null;
};

export type DecisionExecutionRun = {
  input: DecisionInput;
  run: DecisionRunResult;
  savedAt: string;
  label?: string;
};

export type DecisionRunFileSummary = {
  id: string;
  timestamp: string;
  runId: string;
  taskPreview: string;
  recommendedQuestion: string;
  filename: string;
};

export type DecisionEvaluationItem = {
  criterion: string;
  score: number;
  comment: string;
};

export type DecisionEvaluationResult = {
  score: number;
  reasoning: string;
  verdict: "keep" | "iterate" | "discard";
  breakdown: DecisionEvaluationItem[];
  improvementHypotheses: string[];
};

export type DecisionBenchmarkCase = {
  id: string;
  title: string;
  input: DecisionInput;
  expectedCriteria: string[];
  notes?: string;
};

export type DecisionBenchmarkRun = {
  benchmark: DecisionBenchmarkCase;
  run: DecisionRunResult;
  evaluation: DecisionEvaluationResult;
  suggestedModelSettings?: DecisionModelSettings;
  promptTuningNotes?: string[];
};

export type DecisionBenchmarkFileSummary = {
  id: string;
  timestamp: string;
  benchmarkId: string;
  benchmarkTitle: string;
  score: number;
  verdict: DecisionEvaluationResult["verdict"];
  filename: string;
};
