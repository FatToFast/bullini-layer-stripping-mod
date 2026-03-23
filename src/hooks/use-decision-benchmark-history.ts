import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import type {
  DecisionBenchmarkRun,
  DecisionEvaluationItem,
  DecisionModelSettings,
} from "@/lib/decision/types";

export const DECISION_BENCHMARK_STORAGE_PREFIX = "bullini-decision-benchmark-";

export type StoredDecisionBenchmarkRun = {
  storageKey: string;
  timestamp: number;
  result: DecisionBenchmarkRun;
};

export type DecisionBenchmarkComparison = {
  scoreDelta: number;
  verdictChanged: boolean;
  changedCriteria: Array<{
    criterion: string;
    previousScore: number;
    currentScore: number;
  }>;
  addedNotes: string[];
  removedNotes: string[];
  suggestedStageCountDelta: number;
  hasChanges: boolean;
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function countSuggestedStages(settings?: DecisionModelSettings) {
  return Object.values(settings?.stages ?? {}).filter((config) => Boolean(config?.prompt?.trim())).length;
}

export function formatDecisionBenchmarkDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "unknown";
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readStoredDecisionBenchmarkRuns() {
  if (typeof window === "undefined") return [] as StoredDecisionBenchmarkRun[];

  const history: StoredDecisionBenchmarkRun[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(DECISION_BENCHMARK_STORAGE_PREFIX)) continue;

    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<StoredDecisionBenchmarkRun>;
      if (typeof parsed.timestamp !== "number" || !parsed.result) continue;
      history.push({
        storageKey: key,
        timestamp: parsed.timestamp,
        result: parsed.result as DecisionBenchmarkRun,
      });
    } catch {
      // ignore malformed history entries
    }
  }

  return history.sort((a, b) => b.timestamp - a.timestamp);
}

export function compareDecisionBenchmarkRuns(
  previous: DecisionBenchmarkRun,
  current: DecisionBenchmarkRun,
): DecisionBenchmarkComparison {
  const previousScores = new Map(previous.evaluation.breakdown.map((item) => [item.criterion, item.score] as const));
  const changedCriteria = current.evaluation.breakdown.flatMap((item) => {
    const previousScore = previousScores.get(item.criterion);
    if (previousScore === undefined || previousScore === item.score) return [];
    return [{ criterion: item.criterion, previousScore, currentScore: item.score }];
  });

  const previousNotes = new Set(previous.promptTuningNotes ?? previous.evaluation.improvementHypotheses);
  const currentNotes = new Set(current.promptTuningNotes ?? current.evaluation.improvementHypotheses);
  const addedNotes = [...currentNotes].filter((note) => !previousNotes.has(note));
  const removedNotes = [...previousNotes].filter((note) => !currentNotes.has(note));
  const scoreDelta = current.evaluation.score - previous.evaluation.score;
  const suggestedStageCountDelta =
    countSuggestedStages(current.suggestedModelSettings) - countSuggestedStages(previous.suggestedModelSettings);

  return {
    scoreDelta,
    verdictChanged: previous.evaluation.verdict !== current.evaluation.verdict,
    changedCriteria,
    addedNotes,
    removedNotes,
    suggestedStageCountDelta,
    hasChanges:
      scoreDelta !== 0 ||
      previous.evaluation.verdict !== current.evaluation.verdict ||
      changedCriteria.length > 0 ||
      addedNotes.length > 0 ||
      removedNotes.length > 0 ||
      suggestedStageCountDelta !== 0,
  };
}

type UseDecisionBenchmarkHistoryParams = {
  benchmarkHistory: StoredDecisionBenchmarkRun[];
  setBenchmarkHistory: Dispatch<SetStateAction<StoredDecisionBenchmarkRun[]>>;
};

export function useDecisionBenchmarkHistory({ benchmarkHistory, setBenchmarkHistory }: UseDecisionBenchmarkHistoryParams) {
  useEffect(() => {
    setBenchmarkHistory(readStoredDecisionBenchmarkRuns());
  }, [setBenchmarkHistory]);

  function saveBenchmarkRun(result: DecisionBenchmarkRun) {
    if (typeof window === "undefined") return null;

    const record: StoredDecisionBenchmarkRun = {
      storageKey: `${DECISION_BENCHMARK_STORAGE_PREFIX}${result.benchmark.id}-${Date.now()}`,
      timestamp: Date.now(),
      result,
    };

    try {
      window.localStorage.setItem(record.storageKey, safeStringify(record));
      setBenchmarkHistory((prev) => [record, ...prev]);
      return record;
    } catch {
      return null;
    }
  }

  function loadBenchmarkRun(record: StoredDecisionBenchmarkRun) {
    return record.result;
  }

  const latestRunsByBenchmark = useMemo(() => {
    const map = new Map<string, StoredDecisionBenchmarkRun>();
    for (const item of benchmarkHistory) {
      if (!map.has(item.result.benchmark.id)) {
        map.set(item.result.benchmark.id, item);
      }
    }
    return map;
  }, [benchmarkHistory]);

  return {
    saveBenchmarkRun,
    loadBenchmarkRun,
    latestRunsByBenchmark,
  };
}
