import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import type {
  DecisionExecutionRun,
  DecisionStageStatus,
} from "@/lib/decision/types";

export const DECISION_RUN_STORAGE_PREFIX = "bullini-decision-run-";

export type StoredDecisionExecutionRun = {
  storageKey: string;
  timestamp: number;
  record: DecisionExecutionRun;
};

export type DecisionExecutionComparison = {
  taskChanged: boolean;
  recommendedQuestionChanged: boolean;
  decisionStatementChanged: boolean;
  stageStatusChanges: Array<{
    stage: string;
    previousStatus: DecisionStageStatus;
    currentStatus: DecisionStageStatus;
  }>;
  warningCountDelta: number;
  addedContext: string[];
  removedContext: string[];
  hasChanges: boolean;
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatDecisionRunDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "unknown";
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function readStoredDecisionRuns() {
  if (typeof window === "undefined") return [] as StoredDecisionExecutionRun[];

  const history: StoredDecisionExecutionRun[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(DECISION_RUN_STORAGE_PREFIX)) continue;

    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<StoredDecisionExecutionRun>;
      if (typeof parsed.timestamp !== "number" || !parsed.record) continue;
      history.push({
        storageKey: key,
        timestamp: parsed.timestamp,
        record: parsed.record as DecisionExecutionRun,
      });
    } catch {
      // ignore malformed entries
    }
  }

  return history.sort((a, b) => b.timestamp - a.timestamp);
}

export function compareDecisionExecutionRuns(
  previous: DecisionExecutionRun,
  current: DecisionExecutionRun,
): DecisionExecutionComparison {
  const previousStageMap = new Map(previous.run.stages.map((stage) => [stage.stage, stage.status] as const));
  const stageStatusChanges = current.run.stages.flatMap((stage) => {
    const previousStatus = previousStageMap.get(stage.stage);
    if (!previousStatus || previousStatus === stage.status) return [];
    return [{ stage: stage.stage, previousStatus, currentStatus: stage.status }];
  });

  const previousWarnings = previous.run.stages.reduce((sum, stage) => sum + (stage.warnings?.length ?? 0), 0);
  const currentWarnings = current.run.stages.reduce((sum, stage) => sum + (stage.warnings?.length ?? 0), 0);
  const previousContext = new Set(previous.run.finalOutput?.insightHandoff.additionalContext ?? []);
  const currentContext = new Set(current.run.finalOutput?.insightHandoff.additionalContext ?? []);
  const addedContext = [...currentContext].filter((item) => !previousContext.has(item));
  const removedContext = [...previousContext].filter((item) => !currentContext.has(item));
  const previousQuestion = previous.run.finalOutput?.recommendedQuestion ?? "";
  const currentQuestion = current.run.finalOutput?.recommendedQuestion ?? "";
  const previousDecision = previous.run.finalOutput?.decisionStatement ?? "";
  const currentDecision = current.run.finalOutput?.decisionStatement ?? "";

  return {
    taskChanged: previous.input.task !== current.input.task,
    recommendedQuestionChanged: previousQuestion !== currentQuestion,
    decisionStatementChanged: previousDecision !== currentDecision,
    stageStatusChanges,
    warningCountDelta: currentWarnings - previousWarnings,
    addedContext,
    removedContext,
    hasChanges:
      previous.input.task !== current.input.task ||
      previousQuestion !== currentQuestion ||
      previousDecision !== currentDecision ||
      stageStatusChanges.length > 0 ||
      currentWarnings !== previousWarnings ||
      addedContext.length > 0 ||
      removedContext.length > 0,
  };
}

type UseDecisionRunHistoryParams = {
  decisionHistory: StoredDecisionExecutionRun[];
  setDecisionHistory: Dispatch<SetStateAction<StoredDecisionExecutionRun[]>>;
};

export function useDecisionRunHistory({ decisionHistory, setDecisionHistory }: UseDecisionRunHistoryParams) {
  useEffect(() => {
    setDecisionHistory(readStoredDecisionRuns());
  }, [setDecisionHistory]);

  function saveDecisionRun(record: DecisionExecutionRun) {
    if (typeof window === "undefined") return null;

    const stored: StoredDecisionExecutionRun = {
      storageKey: `${DECISION_RUN_STORAGE_PREFIX}${record.run.runId}-${Date.now()}`,
      timestamp: Date.now(),
      record,
    };

    try {
      window.localStorage.setItem(stored.storageKey, safeStringify(stored));
      setDecisionHistory((prev) => [stored, ...prev]);
      return stored;
    } catch {
      return null;
    }
  }

  function loadDecisionRun(record: StoredDecisionExecutionRun) {
    return record.record;
  }

  const latestRun = useMemo(() => decisionHistory[0] ?? null, [decisionHistory]);

  return {
    saveDecisionRun,
    loadDecisionRun,
    latestRun,
  };
}
