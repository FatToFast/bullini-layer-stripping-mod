import { callLLM } from "@/lib/providers/llm";
import {
  parseDecisionFinalOutput,
  parseDecisionInput,
  parseOptionSynthesisOutput,
  parseOrchestrationDesignOutput,
  parsePersonaRehearsalOutput,
  parseStakeholderMappingOutput,
  parseTaskReframingOutput,
} from "./schemas";
import { DECISION_SYSTEM_PROMPT, DEFAULT_DECISION_STAGE_PROMPTS } from "./prompts";
import { runDecisionStage } from "./stage-runner";
import type {
  DecisionFinalOutput,
  DecisionInput,
  DecisionOption,
  DecisionPipelineOptions,
  DecisionRunResult,
  DecisionStageName,
  DecisionStagePolicy,
  DecisionStageRecord,
  KeyAssumption,
  MetaTuningOutput,
  ModelConfigOverride,
  OptionSynthesisOutput,
  OrchestrationDesignOutput,
  PersonaRehearsalFinding,
  PersonaRehearsalOutput,
  StakeholderMapItem,
  StakeholderMappingOutput,
  TaskReframingOutput,
} from "./types";

const DEFAULT_STAGE_POLICIES: Record<DecisionStageName, DecisionStagePolicy> = {
  task_reframing: { enabled: true, required: true },
  stakeholder_mapping: { enabled: true, required: false },
  option_synthesis: { enabled: true, required: false },
  orchestration_design: { enabled: true, required: false },
  persona_rehearsal: { enabled: true, required: false },
  decision_synthesis: { enabled: true, required: true },
};

function makeLlmCall(baseSystemPrompt: string) {
  return function llmCall(stepPrompt: string, userContent: string, config?: ModelConfigOverride) {
    return callLLM(`${baseSystemPrompt}\n\n${stepPrompt}`, userContent, {
      ...(config?.model ? { model: config.model } : {}),
      ...(config?.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config?.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    });
  };
}

function getStageConfig(stage: DecisionStageName, options?: DecisionPipelineOptions): ModelConfigOverride | undefined {
  const defaults = options?.modelSettings?.defaults ?? {};
  const stageOverrides = options?.modelSettings?.stages?.[stage] ?? {};
  return {
    ...defaults,
    ...stageOverrides,
  };
}

function getStagePrompt(stage: DecisionStageName, options?: DecisionPipelineOptions): string {
  const overridePrompt = options?.modelSettings?.stages?.[stage]?.prompt?.trim();
  return overridePrompt && overridePrompt.length > 0 ? overridePrompt : DEFAULT_DECISION_STAGE_PROMPTS[stage];
}

function getStagePolicy(stage: DecisionStageName, options?: DecisionPipelineOptions): DecisionStagePolicy {
  return {
    ...DEFAULT_STAGE_POLICIES[stage],
    ...(options?.stagePolicies?.[stage] ?? {}),
  };
}

function uniqueStrings(values: Array<string | undefined>, limit = 6) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))).slice(0, limit);
}

function summarizeStageStatuses(stages: DecisionStageRecord[]) {
  return stages.map((stage) => ({
    stage: stage.stage,
    status: stage.status,
    resolution: stage.resolution ?? (stage.status === "success" ? "llm" : stage.status === "skipped" ? "skipped" : "fallback"),
    warnings: stage.warnings ?? [],
    error: stage.error,
  }));
}

function buildTaskReframingFallback(input: DecisionInput): TaskReframingOutput {
  const recommendedQuestion = input.background?.trim()
    ? `${input.task.trim()} 이전에, 실제 문제 정의와 성공 조건부터 먼저 확인해야 하는가?`
    : `${input.task.trim()}를 바로 수행하기 전에, 진짜로 풀어야 할 질문이 무엇인지 먼저 재정의해야 하는가?`;

  return {
    statedTask: input.task,
    actualDecision: input.background?.trim()
      ? "주어진 과제를 수행할지보다, 지금 어떤 의사결정을 내려야 하는지 먼저 확정한다"
      : "주어진 요청을 실행하기 전에 질문 자체를 재정의한다",
    whyNow: input.background?.trim() || "요청을 바로 실행하면 잘못된 질문을 정교하게 답할 위험이 있다.",
    hiddenAssumptions: [
      {
        assumption: "지금 받은 요청이 곧 해결해야 할 진짜 문제다",
        whyItMatters: "질문이 틀리면 이후 조사와 글 구조 전체가 어긋난다",
        riskIfWrong: "잘못된 전제 위에서 시간과 리소스를 소모한다",
      },
      {
        assumption: "필요한 이해관계자 관점이 이미 충분히 반영되어 있다",
        whyItMatters: "누락된 관점이 있으면 글의 논지와 실행안이 편향된다",
        riskIfWrong: "보고 직전 반론이 발생해 구조를 다시 짜야 한다",
      },
    ],
    nonGoals: uniqueStrings(["바로 초안을 완성하는 것", "근거 없는 확신으로 결론을 고정하는 것"]),
    reframedQuestions: [
      {
        question: recommendedQuestion,
        whyThisQuestion: "실행보다 먼저 문제 정의와 성공 조건을 맞추기 위해서",
        signalToWatch: "이해관계자들이 서로 다른 성공 기준을 말하는지 여부",
      },
      {
        question: "누가 이 글/의사결정의 수용 여부를 사실상 결정하는가?",
        whyThisQuestion: "초반부터 영향력이 큰 관점을 구조에 반영하기 위해서",
        signalToWatch: "반드시 설득해야 하는 의사결정권자 또는 리뷰어의 존재",
      },
    ],
    recommendedQuestion,
  };
}

function buildStakeholderFallback(input: DecisionInput, reframe: TaskReframingOutput): StakeholderMappingOutput {
  const names = input.stakeholders && input.stakeholders.length > 0
    ? input.stakeholders
    : ["작성자", "리뷰어", "의사결정권자"];

  const stakeholderMap: StakeholderMapItem[] = names.slice(0, 5).map((stakeholder, index) => ({
    stakeholder,
    viewpoint:
      input.context?.[index] || `${stakeholder}는 ${reframe.recommendedQuestion}에 대한 다른 우선순위를 가질 가능성이 있다`,
    coreConcern:
      input.constraints?.[index] || input.successCriteria?.[0] || "리스크 없이 실행 가능한 판단 구조를 확보하는 것",
    decisionCriterion: input.successCriteria?.[index] || "질문이 명확하고 실행 순서가 보이는가",
    whatWouldChangeTheirMind: "명시적 근거, 실패 조건, 대안 경로가 함께 제시될 때",
  }));

  return {
    stakeholderMap,
    alignmentZones: uniqueStrings([
      "잘못된 질문으로 바로 쓰기 시작하면 손실이 커진다",
      input.successCriteria?.[0],
    ]),
    tensions: uniqueStrings([
      input.context?.[0],
      input.constraints?.[0],
      "속도와 정확성 사이의 긴장",
    ]),
    missingVoices: input.stakeholders && input.stakeholders.length > stakeholderMap.length ? input.stakeholders.slice(stakeholderMap.length) : [],
  };
}

function buildOptionFallback(reframe: TaskReframingOutput, stakeholderMap: StakeholderMappingOutput): OptionSynthesisOutput {
  const options: DecisionOption[] = [
    {
      id: "reframe-first",
      label: "재정의 우선",
      summary: "먼저 질문과 성공 기준을 고정한 뒤 집필/분석에 들어간다",
      whenItWins: "이해관계자 관점이 엇갈리거나 질문 자체가 흔들릴 때",
      failureMode: "속도가 지나치게 늦어질 수 있다",
      evidenceNeeded: uniqueStrings([
        stakeholderMap.tensions[0],
        reframe.hiddenAssumptions[0]?.assumption,
      ]),
    },
    {
      id: "parallel-probe",
      label: "병렬 탐색",
      summary: "초안 구조를 열어두고 필요한 근거와 반론을 병렬 수집한다",
      whenItWins: "시간 압박은 크지만 질문 재정의도 완전히 건너뛸 수 없을 때",
      failureMode: "근거와 구조가 함께 흔들릴 수 있다",
      evidenceNeeded: uniqueStrings([
        stakeholderMap.alignmentZones[0],
        stakeholderMap.tensions[0],
      ]),
    },
    {
      id: "execute-now",
      label: "즉시 작성",
      summary: "기존 요청을 유지한 채 빠르게 작성/분석을 진행한다",
      whenItWins: "문제가 이미 충분히 정의되어 있고 리스크가 낮을 때",
      failureMode: "틀린 질문을 빠르게 정교화할 수 있다",
      evidenceNeeded: ["현재 요청이 이미 합의된 질문이라는 확실한 증거"],
    },
  ];

  return {
    options,
    comparisonAxes: uniqueStrings([
      "질문 정확도",
      "속도",
      "반론 방어력",
      stakeholderMap.stakeholderMap[0]?.decisionCriterion,
    ]),
    recommendedOptionId: options[0].id,
    whyThisOption: `${reframe.recommendedQuestion}가 아직 흔들릴 수 있으므로, 재정의를 먼저 잠그는 경로가 가장 안전하다.`,
  };
}

function buildOrchestrationFallback(
  input: DecisionInput,
  reframe: TaskReframingOutput,
  optionsOutput: OptionSynthesisOutput,
): OrchestrationDesignOutput {
  return {
    orchestrationPlan: [
      {
        step: "질문 잠금",
        owner: "human",
        objective: "추천 질문과 비추천 범위를 확정한다",
        deliverable: "1문장 decision question + non-goals",
        dependsOn: [],
        decisionGate: reframe.recommendedQuestion,
      },
      {
        step: "근거 수집 프레임 작성",
        owner: "ai",
        objective: "옵션 비교와 반론 대응에 필요한 근거 목록을 뽑는다",
        deliverable: "evidence checklist",
        dependsOn: ["질문 잠금"],
        decisionGate: optionsOutput.recommendedOptionId,
      },
      {
        step: "브리프 검토",
        owner: "collab",
        objective: "구조, 반론, 누락 관점을 함께 점검한다",
        deliverable: "revised writing brief",
        dependsOn: ["근거 수집 프레임 작성"],
        decisionGate: input.successCriteria?.[0] || "이 브리프로 실제 작성에 들어가도 되는가",
      },
    ],
    bottlenecks: uniqueStrings([
      input.constraints?.[0],
      "질문 확정 전에 초안 작성이 시작되는 것",
    ]),
    checkpoints: uniqueStrings([
      "추천 질문 합의",
      "반론 리스트 확인",
      "집필 브리프 승인",
    ]),
    stopConditions: uniqueStrings([
      "핵심 질문이 여전히 흔들린다",
      "반론에 대한 최소 대응 논리가 없다",
    ]),
  };
}

function buildRehearsalFallback(
  stakeholderMap: StakeholderMappingOutput,
  optionsOutput: OptionSynthesisOutput,
  orchestration: OrchestrationDesignOutput,
): PersonaRehearsalOutput {
  const personas = stakeholderMap.stakeholderMap.length > 0
    ? stakeholderMap.stakeholderMap.slice(0, 3)
    : [
        { stakeholder: "리뷰어", coreConcern: "논리의 비약", decisionCriterion: "구조의 명확성" },
        { stakeholder: "의사결정권자", coreConcern: "실행 가능성", decisionCriterion: "판단 게이트의 존재" },
      ];

  const findings: PersonaRehearsalFinding[] = personas.map((persona, index) => ({
    persona: persona.stakeholder,
    strongestObjection: `${persona.coreConcern} 관점에서 보면, 현재 구조는 ${optionsOutput.options[index]?.label || optionsOutput.options[0]?.label || "추천 옵션"}의 전제를 충분히 검증하지 않았다`,
    whyItStings: `${persona.decisionCriterion || "핵심 기준"}이 만족되지 않으면 집필 브리프가 승인되지 않을 수 있다`,
    whatWouldAddressIt: orchestration.checkpoints[0] || "질문과 판단 게이트를 먼저 더 명확히 고정한다",
    revisionRequired: true,
  }));

  return {
    findings,
    unansweredQuestions: uniqueStrings([
      stakeholderMap.tensions[0],
      optionsOutput.options[0]?.evidenceNeeded[0],
      orchestration.stopConditions[0],
    ]),
    preMortem: uniqueStrings([
      "질문 재정의를 건너뛰고 초안을 먼저 쓰기 시작한다",
      "반론을 예상하지 못해 구조를 전면 수정하게 된다",
      orchestration.bottlenecks[0],
    ]),
  };
}

function buildKeyAssumptions(reframe: TaskReframingOutput): KeyAssumption[] {
  return reframe.hiddenAssumptions.slice(0, 4).map((assumption, index) => ({
    assumption: assumption.assumption,
    status: index === 0 ? "load_bearing" : "uncertain",
    test: assumption.riskIfWrong || assumption.whyItMatters,
  }));
}

function buildMetaTuning(
  input: DecisionInput,
  stages: DecisionStageRecord[],
  rehearsal: PersonaRehearsalOutput,
): MetaTuningOutput {
  const skippedChecks = stages
    .filter((stage) => stage.status === "skipped" || stage.resolution === "fallback")
    .map((stage) => `${stage.stage}: ${(stage.warnings ?? []).join(" | ") || stage.error || "fallback used"}`);

  return {
    observedBiases: uniqueStrings([
      input.plannerHistory?.[0],
      rehearsal.findings[0]?.whyItStings,
      "속도 때문에 질문 재정의를 건너뛸 유혹",
    ], 4),
    skippedChecks,
    nextTimeAdjustments: uniqueStrings([
      ...rehearsal.unansweredQuestions.map((question) => `다음 런에서 먼저 확인: ${question}`),
      "질문 잠금 전에 초안을 쓰지 않도록 gate를 강제한다",
    ], 5),
  };
}

function buildDecisionFinalFallback(
  input: DecisionInput,
  reframe: TaskReframingOutput,
  stakeholderMap: StakeholderMappingOutput,
  optionsOutput: OptionSynthesisOutput,
  orchestration: OrchestrationDesignOutput,
  rehearsal: PersonaRehearsalOutput,
  stages: DecisionStageRecord[],
): DecisionFinalOutput {
  const keyAssumptions = buildKeyAssumptions(reframe);
  const metaTuning = buildMetaTuning(input, stages, rehearsal);
  const recommendedOption = optionsOutput.options.find((option) => option.id === optionsOutput.recommendedOptionId) ?? optionsOutput.options[0];

  return {
    recommendedQuestion: reframe.recommendedQuestion,
    decisionStatement: `${recommendedOption?.label || "추천 경로"}를 기준으로 집필 브리프를 먼저 확정하고, 이후 필요할 때만 심화 분석으로 내려간다.`,
    recommendedOptionId: optionsOutput.recommendedOptionId,
    options: optionsOutput.options,
    orchestrationPlan: orchestration.orchestrationPlan,
    stakeholderBriefs: stakeholderMap.stakeholderMap,
    rehearsalFindings: rehearsal.findings,
    keyAssumptions,
    revisitTriggers: uniqueStrings([
      ...rehearsal.unansweredQuestions,
      ...rehearsal.preMortem,
      ...orchestration.stopConditions,
    ], 6),
    metaTuning,
    insightHandoff: {
      analysisPrompt: [
        reframe.recommendedQuestion,
        `권고 옵션: ${recommendedOption?.label || optionsOutput.recommendedOptionId}`,
        `핵심 반론: ${rehearsal.findings[0]?.strongestObjection || "반론을 먼저 점검할 것"}`,
      ].join("\n"),
      additionalContext: uniqueStrings([
        reframe.actualDecision,
        optionsOutput.whyThisOption,
        stakeholderMap.tensions[0],
        orchestration.checkpoints[0],
        ...keyAssumptions.map((item) => `${item.assumption} / test: ${item.test}`),
      ], 8),
    },
  };
}

function buildReframeStageInput(input: DecisionInput) {
  return {
    task: input.task,
    background: input.background ?? "unknown",
    contextSignals: input.context?.slice(0, 6) ?? [],
    constraints: input.constraints?.slice(0, 6) ?? [],
    stakeholders: input.stakeholders?.slice(0, 6) ?? [],
    successCriteria: input.successCriteria?.slice(0, 5) ?? [],
    availableArtifacts: input.availableArtifacts?.slice(0, 5) ?? [],
    plannerHistory: input.plannerHistory?.slice(-4) ?? [],
  };
}

function buildStakeholderStageInput(input: DecisionInput, reframe: TaskReframingOutput) {
  return {
    decision: {
      statedTask: reframe.statedTask,
      actualDecision: reframe.actualDecision,
      recommendedQuestion: reframe.recommendedQuestion,
      hiddenAssumptions: reframe.hiddenAssumptions.slice(0, 4),
      nonGoals: reframe.nonGoals.slice(0, 4),
    },
    explicitStakeholders: input.stakeholders?.slice(0, 6) ?? [],
    contextSignals: input.context?.slice(0, 6) ?? [],
    constraints: input.constraints?.slice(0, 5) ?? [],
    successCriteria: input.successCriteria?.slice(0, 5) ?? [],
  };
}

function buildOptionStageInput(
  input: DecisionInput,
  reframe: TaskReframingOutput,
  stakeholderMap: StakeholderMappingOutput,
) {
  return {
    recommendedQuestion: reframe.recommendedQuestion,
    actualDecision: reframe.actualDecision,
    stakeholderHighlights: stakeholderMap.stakeholderMap.slice(0, 5).map((item) => ({
      stakeholder: item.stakeholder,
      coreConcern: item.coreConcern,
      decisionCriterion: item.decisionCriterion,
    })),
    alignmentZones: stakeholderMap.alignmentZones.slice(0, 4),
    tensions: stakeholderMap.tensions.slice(0, 4),
    successCriteria: input.successCriteria?.slice(0, 4) ?? [],
  };
}

function buildOrchestrationStageInput(
  input: DecisionInput,
  reframe: TaskReframingOutput,
  optionsOutput: OptionSynthesisOutput,
) {
  return {
    recommendedQuestion: reframe.recommendedQuestion,
    recommendedOptionId: optionsOutput.recommendedOptionId,
    options: optionsOutput.options.slice(0, 3).map((option) => ({
      id: option.id,
      label: option.label,
      whenItWins: option.whenItWins,
      failureMode: option.failureMode,
    })),
    comparisonAxes: optionsOutput.comparisonAxes.slice(0, 4),
    successCriteria: input.successCriteria?.slice(0, 4) ?? [],
    availableArtifacts: input.availableArtifacts?.slice(0, 5) ?? [],
    constraints: input.constraints?.slice(0, 4) ?? [],
  };
}

function buildRehearsalStageInput(
  reframe: TaskReframingOutput,
  stakeholderMap: StakeholderMappingOutput,
  optionsOutput: OptionSynthesisOutput,
  orchestration: OrchestrationDesignOutput,
) {
  return {
    recommendedQuestion: reframe.recommendedQuestion,
    stakeholderBriefs: stakeholderMap.stakeholderMap.slice(0, 4).map((item) => ({
      stakeholder: item.stakeholder,
      coreConcern: item.coreConcern,
      decisionCriterion: item.decisionCriterion,
    })),
    recommendedOptionId: optionsOutput.recommendedOptionId,
    optionSummaries: optionsOutput.options.slice(0, 3).map((option) => ({
      id: option.id,
      label: option.label,
      summary: option.summary,
      failureMode: option.failureMode,
    })),
    decisionGates: orchestration.orchestrationPlan.slice(0, 4).map((step) => step.decisionGate),
    bottlenecks: orchestration.bottlenecks.slice(0, 4),
    tensions: stakeholderMap.tensions.slice(0, 4),
  };
}

function buildDecisionSynthesisStageInput(
  input: DecisionInput,
  reframe: TaskReframingOutput,
  stakeholderMap: StakeholderMappingOutput,
  optionsOutput: OptionSynthesisOutput,
  orchestration: OrchestrationDesignOutput,
  rehearsal: PersonaRehearsalOutput,
  stages: DecisionStageRecord[],
) {
  return {
    decision: {
      recommendedQuestion: reframe.recommendedQuestion,
      actualDecision: reframe.actualDecision,
      recommendedOptionId: optionsOutput.recommendedOptionId,
      whyThisOption: optionsOutput.whyThisOption,
    },
    options: optionsOutput.options.slice(0, 3).map((option) => ({
      id: option.id,
      label: option.label,
      summary: option.summary,
      evidenceNeeded: option.evidenceNeeded.slice(0, 3),
    })),
    stakeholderBriefs: stakeholderMap.stakeholderMap.slice(0, 4),
    orchestrationPlan: orchestration.orchestrationPlan.slice(0, 4),
    rehearsalFindings: rehearsal.findings.slice(0, 4),
    unansweredQuestions: rehearsal.unansweredQuestions.slice(0, 4),
    hiddenAssumptions: reframe.hiddenAssumptions.slice(0, 4),
    plannerHistory: input.plannerHistory?.slice(-4) ?? [],
    stageStatusSummary: summarizeStageStatuses(stages),
  };
}

export async function runDecisionPipeline(
  input: DecisionInput,
  options?: DecisionPipelineOptions,
): Promise<DecisionRunResult> {
  const runId = `decision-${Date.now()}`;
  const stages: DecisionStageRecord[] = [];
  const normalizedInput = parseDecisionInput(input);
  const llmCall = makeLlmCall(options?.systemPrompt?.trim() || DECISION_SYSTEM_PROMPT);

  function buildSkippedRecord<T>(
    stageName: DecisionStageName,
    stageInput: unknown,
    prompt: string,
    output: T,
    warning: string,
  ): T {
    stages.push({
      stage: stageName,
      status: "skipped",
      resolution: "skipped",
      input: stageInput,
      prompt,
      output,
      warnings: [warning],
      elapsedMs: 0,
    });
    return output;
  }

  function buildFallbackRecord<T>(
    stageName: DecisionStageName,
    stageInput: unknown,
    prompt: string,
    output: T,
    error: string,
  ): T {
    stages.push({
      stage: stageName,
      status: "success",
      resolution: "fallback",
      input: stageInput,
      prompt,
      output,
      error,
      warnings: ["LLM stage failed; local fallback output used."],
      elapsedMs: 0,
    });
    return output;
  }

  async function executeStage<T>(params: {
    stageName: DecisionStageName;
    stageInput: unknown;
    parseOutput: (value: unknown) => T;
    fallback: () => T;
    shouldRun?: () => boolean;
  }): Promise<T> {
    const prompt = getStagePrompt(params.stageName, options);
    const policy = getStagePolicy(params.stageName, options);

    if (policy.enabled === false || params.shouldRun?.() === false) {
      return buildSkippedRecord(
        params.stageName,
        params.stageInput,
        prompt,
        params.fallback(),
        policy.enabled === false ? "Stage disabled by policy." : "Stage skipped because prerequisites were not met.",
      );
    }

    const userContent = JSON.stringify(params.stageInput, null, 2);
    const config = getStageConfig(params.stageName, options);
    const record = await runDecisionStage(
      {
        stageName: params.stageName,
        input: params.stageInput,
        userContent,
        prompt,
      },
      async () => {
        const result = await llmCall(prompt, userContent, config);
        return {
          ...result,
          content: params.parseOutput(result.content),
        };
      },
    );

    if (record.status === "success") {
      stages.push({ ...record, resolution: "llm" });
      return record.output as T;
    }

    if (policy.required === false || policy.required === true) {
      return buildFallbackRecord(
        params.stageName,
        params.stageInput,
        prompt,
        params.fallback(),
        record.error || "Unknown stage failure",
      );
    }

    stages.push({ ...record, resolution: "fallback" });
    return params.fallback();
  }

  const reframe = await executeStage<TaskReframingOutput>({
    stageName: "task_reframing",
    stageInput: buildReframeStageInput(normalizedInput),
    parseOutput: parseTaskReframingOutput,
    fallback: () => buildTaskReframingFallback(normalizedInput),
  });

  const stakeholderMap = await executeStage<StakeholderMappingOutput>({
    stageName: "stakeholder_mapping",
    stageInput: buildStakeholderStageInput(normalizedInput, reframe),
    parseOutput: parseStakeholderMappingOutput,
    fallback: () => buildStakeholderFallback(normalizedInput, reframe),
  });

  const optionsOutput = await executeStage<OptionSynthesisOutput>({
    stageName: "option_synthesis",
    stageInput: buildOptionStageInput(normalizedInput, reframe, stakeholderMap),
    parseOutput: parseOptionSynthesisOutput,
    fallback: () => buildOptionFallback(reframe, stakeholderMap),
  });

  const orchestration = await executeStage<OrchestrationDesignOutput>({
    stageName: "orchestration_design",
    stageInput: buildOrchestrationStageInput(normalizedInput, reframe, optionsOutput),
    parseOutput: parseOrchestrationDesignOutput,
    fallback: () => buildOrchestrationFallback(normalizedInput, reframe, optionsOutput),
  });

  const rehearsal = await executeStage<PersonaRehearsalOutput>({
    stageName: "persona_rehearsal",
    stageInput: buildRehearsalStageInput(reframe, stakeholderMap, optionsOutput, orchestration),
    parseOutput: parsePersonaRehearsalOutput,
    fallback: () => buildRehearsalFallback(stakeholderMap, optionsOutput, orchestration),
  });

  const finalOutput = await executeStage<DecisionFinalOutput>({
    stageName: "decision_synthesis",
    stageInput: buildDecisionSynthesisStageInput(
      normalizedInput,
      reframe,
      stakeholderMap,
      optionsOutput,
      orchestration,
      rehearsal,
      stages,
    ),
    parseOutput: parseDecisionFinalOutput,
    fallback: () =>
      buildDecisionFinalFallback(
        normalizedInput,
        reframe,
        stakeholderMap,
        optionsOutput,
        orchestration,
        rehearsal,
        stages,
      ),
  });

  const normalizedFinalOutput = finalOutput
    ? {
        ...finalOutput,
        metaTuning: {
          ...finalOutput.metaTuning,
          skippedChecks: uniqueStrings([
            ...finalOutput.metaTuning.skippedChecks,
            ...stages
              .filter((stage) => stage.status === "skipped" || stage.resolution === "fallback")
              .map((stage) => `${stage.stage}: ${(stage.warnings ?? []).join(" | ") || stage.error || "fallback used"}`),
          ], 8),
        },
      }
    : null;

  return {
    runId,
    stages,
    finalOutput: normalizedFinalOutput,
  };
}
