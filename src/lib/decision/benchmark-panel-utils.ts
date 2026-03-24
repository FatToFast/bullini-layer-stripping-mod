import type { DecisionBenchmarkCase } from "@/lib/decision/types";

export type FieldValidation = {
  isValid: boolean;
  message?: string;
  touched: boolean;
};

export type ValidationResult = {
  id: FieldValidation;
  task: FieldValidation;
  stakeholders: FieldValidation;
  successCriteria: FieldValidation;
  expectedCriteria: FieldValidation;
};

export type BenchmarkRunStage = "idle" | "validating" | "running" | "applying" | "complete";

const BENCHMARK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateBenchmarkCase(
  benchmark: DecisionBenchmarkCase | null,
  touchedFields: Set<string> = new Set(),
): ValidationResult {
  if (!benchmark) {
    return {
      id: { isValid: false, message: "Benchmark를 선택하세요", touched: false },
      task: { isValid: false, message: "", touched: false },
      stakeholders: { isValid: false, message: "", touched: false },
      successCriteria: { isValid: false, message: "", touched: false },
      expectedCriteria: { isValid: false, message: "", touched: false },
    };
  }

  return {
    id: {
      isValid: BENCHMARK_ID_PATTERN.test(benchmark.id),
      message: BENCHMARK_ID_PATTERN.test(benchmark.id) ? undefined : "ID는 영문, 숫자, 밑줄(_), 하이픈(-)만 허용",
      touched: touchedFields.has("id"),
    },
    task: {
      isValid: benchmark.input.task.trim().length >= 10,
      message: benchmark.input.task.trim().length >= 10 ? undefined : "Task는 최소 10자 이상이어야 합니다",
      touched: touchedFields.has("task"),
    },
    stakeholders: {
      isValid: (benchmark.input.stakeholders?.length ?? 0) >= 1,
      message: (benchmark.input.stakeholders?.length ?? 0) >= 1 ? undefined : "최소 1명 이상의 stakeholder가 필요합니다",
      touched: touchedFields.has("stakeholders"),
    },
    successCriteria: {
      isValid: (benchmark.input.successCriteria?.length ?? 0) >= 1,
      message: (benchmark.input.successCriteria?.length ?? 0) >= 1 ? undefined : "최소 1개 이상의 성공 기준이 필요합니다",
      touched: touchedFields.has("successCriteria"),
    },
    expectedCriteria: {
      isValid: benchmark.expectedCriteria.length >= 1,
      message: benchmark.expectedCriteria.length >= 1 ? undefined : "최소 1개 이상의 예상 기준이 필요합니다",
      touched: touchedFields.has("expectedCriteria"),
    },
  };
}

export function isValidationValid(validation: ValidationResult): boolean {
  return Object.values(validation).every((field) => field.isValid);
}

export function parseBenchmarkNotes(notes?: string) {
  return (notes ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function cloneBenchmarkCase(benchmark: DecisionBenchmarkCase): DecisionBenchmarkCase {
  return {
    ...benchmark,
    input: {
      ...benchmark.input,
      context: [...(benchmark.input.context ?? [])],
      stakeholders: [...(benchmark.input.stakeholders ?? [])],
      successCriteria: [...(benchmark.input.successCriteria ?? [])],
    },
    expectedCriteria: [...benchmark.expectedCriteria],
  };
}

export function detectIndustriesFromReasoning(reasoning?: string) {
  if (!reasoning) return [];

  const normalizedReasoning = reasoning.toLowerCase();
  const industries: string[] = [];
  const industryKeywords: Record<string, string[]> = {
    "금융": ["finance", "banking", "investment", "financial"],
    "의료": ["healthcare", "medical", "pharmaceutical", "health"],
    "제조": ["manufacturing", "production", "factory", "industrial"],
    "IT/기술": ["technology", "software", "platform", "digital"],
    "소매": ["retail", "commerce", "consumer", "shopping"],
    "에너지": ["energy", "power", "renewable", "oil"],
  };

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some((keyword) => normalizedReasoning.includes(keyword))) {
      industries.push(industry);
    }
  }

  return industries;
}

export function getRunStageProgress(stage: BenchmarkRunStage) {
  switch (stage) {
    case "validating":
      return "25%";
    case "running":
      return "60%";
    case "applying":
      return "85%";
    case "complete":
      return "100%";
    default:
      return "0%";
  }
}
