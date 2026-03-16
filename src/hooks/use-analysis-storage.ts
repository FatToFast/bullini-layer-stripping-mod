import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import type { FinalOutput, InsightRunResult } from "@/lib/insight/types";

export const ANALYSIS_STORAGE_PREFIX = "bullini-analysis-";

export type StoredAnalysis = {
  timestamp: number;
  eventId: string;
  output: FinalOutput;
};

export type FinalOutputComparison = {
  structuralReadChanged: boolean;
  oneLineTakeChanged: boolean;
  weightChanges: Array<{
    label: string;
    previousWeight: unknown;
    currentWeight: unknown;
  }>;
  addedTriggers: FinalOutput["watchTriggers"];
  removedTriggers: FinalOutput["watchTriggers"];
  hasChanges: boolean;
};

function stringifyValue(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getWatchTriggerKey(trigger: FinalOutput["watchTriggers"][number]) {
  return stringifyValue(trigger);
}

export function formatStoredDate(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "unknown";
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getEventIdFromRawJson(input: string) {
  try {
    const parsed = JSON.parse(input) as { canonical_event?: { event_id?: unknown } };
    const eventId = parsed.canonical_event?.event_id;
    return typeof eventId === "string" && eventId.trim() ? eventId.trim() : null;
  } catch {
    return null;
  }
}

export function readStoredAnalysis(eventId: string) {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(`${ANALYSIS_STORAGE_PREFIX}${eventId}`);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<StoredAnalysis>;
    if (typeof parsed.timestamp !== "number" || !parsed.output) {
      return null;
    }

    return {
      timestamp: parsed.timestamp,
      output: parsed.output as FinalOutput,
    };
  } catch {
    return null;
  }
}

type UseAnalysisStorageParams = {
  rawJson: string;
  finalResult: InsightRunResult | null;
  previousResult: { timestamp: number; output: FinalOutput } | null;
  setAnalysisHistory: Dispatch<SetStateAction<StoredAnalysis[]>>;
  setFinalResult: Dispatch<SetStateAction<InsightRunResult | null>>;
  setAbResult: Dispatch<SetStateAction<InsightRunResult | null>>;
  setRawJson: Dispatch<SetStateAction<string>>;
  setEditableMarkdown: Dispatch<SetStateAction<string>>;
  setUserNotes: Dispatch<SetStateAction<string>>;
};

export function useAnalysisStorage({
  rawJson,
  finalResult,
  previousResult,
  setAnalysisHistory,
  setFinalResult,
  setAbResult,
  setRawJson,
  setEditableMarkdown,
  setUserNotes,
}: UseAnalysisStorageParams) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const history: StoredAnalysis[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(ANALYSIS_STORAGE_PREFIX)) continue;

      const eventId = key.replace(ANALYSIS_STORAGE_PREFIX, "");
      const stored = readStoredAnalysis(eventId);
      if (stored) {
        history.push({ ...stored, eventId });
      }
    }

    setAnalysisHistory(history.sort((a, b) => b.timestamp - a.timestamp));
  }, [setAnalysisHistory]);

  function saveAnalysis(output: FinalOutput) {
    const eventId = getEventIdFromRawJson(rawJson);
    if (!eventId || typeof window === "undefined") return;

    const record: StoredAnalysis = {
      timestamp: Date.now(),
      eventId,
      output,
    };

    try {
      window.localStorage.setItem(`${ANALYSIS_STORAGE_PREFIX}${eventId}`, JSON.stringify(record));
      setAnalysisHistory((prev) => [record, ...prev.filter((item) => item.eventId !== eventId)]);
    } catch {
    }
  }

  function loadAnalysis(analysis: StoredAnalysis) {
    setFinalResult({ runId: `history-${analysis.eventId}`, stages: [], finalOutput: analysis.output });
    setAbResult(null);
    setRawJson("");
    setEditableMarkdown(analysis.output.markdownOutput);
    setUserNotes("");
  }

  const finalOutputComparison = useMemo<FinalOutputComparison | null>(() => {
    if (!previousResult || !finalResult?.finalOutput) return null;

    const currentOutput = finalResult.finalOutput;
    const previousOutput = previousResult.output;
    const structuralReadChanged = stringifyValue(previousOutput.structuralRead) !== stringifyValue(currentOutput.structuralRead);
    const oneLineTakeChanged = stringifyValue(previousOutput.oneLineTake) !== stringifyValue(currentOutput.oneLineTake);
    const previousHypothesisWeights = new Map(
      previousOutput.competingHypotheses.map((hypothesis) => [hypothesis.label, hypothesis.currentWeight])
    );
    const weightChanges = currentOutput.competingHypotheses.flatMap((hypothesis) => {
      const previousWeight = previousHypothesisWeights.get(hypothesis.label);
      if (!previousWeight || stringifyValue(previousWeight) === stringifyValue(hypothesis.currentWeight)) {
        return [];
      }

      return [
        {
          label: hypothesis.label,
          previousWeight,
          currentWeight: hypothesis.currentWeight,
        },
      ];
    });
    const previousTriggerMap = new Map(
      previousOutput.watchTriggers.map((trigger) => [getWatchTriggerKey(trigger), trigger])
    );
    const currentTriggerMap = new Map(
      currentOutput.watchTriggers.map((trigger) => [getWatchTriggerKey(trigger), trigger])
    );
    const addedTriggers = currentOutput.watchTriggers.filter(
      (trigger) => !previousTriggerMap.has(getWatchTriggerKey(trigger))
    );
    const removedTriggers = previousOutput.watchTriggers.filter(
      (trigger) => !currentTriggerMap.has(getWatchTriggerKey(trigger))
    );

    return {
      structuralReadChanged,
      oneLineTakeChanged,
      weightChanges,
      addedTriggers,
      removedTriggers,
      hasChanges:
        structuralReadChanged ||
        oneLineTakeChanged ||
        weightChanges.length > 0 ||
        addedTriggers.length > 0 ||
        removedTriggers.length > 0,
    };
  }, [finalResult, previousResult]);

  return {
    saveAnalysis,
    loadAnalysis,
    finalOutputComparison,
  };
}
