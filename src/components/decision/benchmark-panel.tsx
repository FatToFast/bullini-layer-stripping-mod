"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listDecisionBenchmarks,
  listSavedDecisionBenchmarkRuns,
  loadSavedDecisionBenchmarkRun,
  runDecisionBenchmarkApi,
  saveDecisionBenchmarkCase,
  saveDecisionBenchmarkRun,
} from "@/lib/decision/api";
import type {
  DecisionBenchmarkCase,
  DecisionBenchmarkFileSummary,
  DecisionBenchmarkRun,
  DecisionModelSettings,
  DecisionPipelineOptions,
} from "@/lib/decision/types";
import {
  compareDecisionBenchmarkRuns,
  formatDecisionBenchmarkDate,
  useDecisionBenchmarkHistory,
  type DecisionBenchmarkComparison,
  type StoredDecisionBenchmarkRun,
} from "@/hooks/use-decision-benchmark-history";
import { deepDiff, filterBenchmarkChanges, formatPath, type DiffChange } from "@/lib/utils/diff";

const CURRENT_ARTICLE_BENCHMARK_ID = "__current_article__";

type FieldValidation = {
  isValid: boolean;
  message?: string;
  touched: boolean;
};

type ValidationResult = {
  id: FieldValidation;
  task: FieldValidation;
  stakeholders: FieldValidation;
  successCriteria: FieldValidation;
  expectedCriteria: FieldValidation;
};

function validateBenchmarkCase(benchmark: DecisionBenchmarkCase | null, touchedFields: Set<string> = new Set()): ValidationResult {
  if (!benchmark) {
    return {
      id: { isValid: false, message: "Benchmark를 선택하세요", touched: false },
      task: { isValid: false, message: "", touched: false },
      stakeholders: { isValid: false, message: "", touched: false },
      successCriteria: { isValid: false, message: "", touched: false },
      expectedCriteria: { isValid: false, message: "", touched: false },
    };
  }

  const idValidation = /^[a-zA-Z0-9_-]+$/;
  return {
    id: {
      isValid: idValidation.test(benchmark.id),
      message: idValidation.test(benchmark.id) ? undefined : "ID는 영문, 숫자, 밑줄(_), 하이픈(-)만 허용",
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

function isValidationValid(validation: ValidationResult): boolean {
  return Object.values(validation).every((field) => field.isValid);
}

type Props = {
  decisionModelSettings: DecisionModelSettings;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
  onApplySuggestedSettings: (settings: DecisionModelSettings) => void;
  currentArticleBenchmark?: DecisionBenchmarkCase | null;
  externalBenchmarks?: DecisionBenchmarkCase[];
  disabled?: boolean;
};

function parseBenchmarkNotes(notes?: string) {
  return (notes ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cloneBenchmarkCase(benchmark: DecisionBenchmarkCase): DecisionBenchmarkCase {
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

export function DecisionBenchmarkPanel({
  decisionModelSettings,
  stagePolicies,
  onApplySuggestedSettings,
  currentArticleBenchmark,
  externalBenchmarks = [],
  disabled = false,
}: Props) {
  const [benchmarks, setBenchmarks] = useState<DecisionBenchmarkCase[]>([]);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState(currentArticleBenchmark ? CURRENT_ARTICLE_BENCHMARK_ID : "");
  const [benchmarkDraft, setBenchmarkDraft] = useState<DecisionBenchmarkCase | null>(currentArticleBenchmark ? cloneBenchmarkCase(currentArticleBenchmark) : null);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<DecisionBenchmarkRun | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<StoredDecisionBenchmarkRun[]>([]);
  const [savedRuns, setSavedRuns] = useState<DecisionBenchmarkFileSummary[]>([]);
  const [selectedCompareKeys, setSelectedCompareKeys] = useState<string[]>([]);
  const [selectedFileCompareRuns, setSelectedFileCompareRuns] = useState<DecisionBenchmarkRun[] | null>(null);
  const [comparison, setComparison] = useState<DecisionBenchmarkComparison | null>(null);
  const [selectedFileComparison, setSelectedFileComparison] = useState<DecisionBenchmarkComparison | null>(null);
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<string[]>([]);
  const [showHistoryDiffModal, setShowHistoryDiffModal] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingArticleCase, setIsSavingArticleCase] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingSavedRuns, setIsLoadingSavedRuns] = useState(true);
  const [isRunningAndApplying, setIsRunningAndApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [runStage, setRunStage] = useState<"idle" | "validating" | "running" | "applying" | "complete">("idle");
  const [diffViewMode, setDiffViewMode] = useState<"side-by-side" | "unified">("side-by-side");
  const [diffExpanded, setDiffExpanded] = useState(true);
  const { saveBenchmarkRun, loadBenchmarkRun } = useDecisionBenchmarkHistory({
    benchmarkHistory,
    setBenchmarkHistory,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingList(true);
      const result = await listDecisionBenchmarks();
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setIsLoadingList(false);
        return;
      }
      setBenchmarks(result);
      setSelectedBenchmarkId((current) => current || (currentArticleBenchmark ? CURRENT_ARTICLE_BENCHMARK_ID : result[0]?.id || ""));
      setIsLoadingList(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentArticleBenchmark]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingSavedRuns(true);
      const result = await listSavedDecisionBenchmarkRuns();
      if (cancelled) return;
      if ("error" in result) {
        setIsLoadingSavedRuns(false);
        return;
      }
      setSavedRuns(result);
      setIsLoadingSavedRuns(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tunedDecisionStages = useMemo(
    () => Object.entries(decisionModelSettings.stages ?? {}).filter(([, config]) => Boolean(config?.prompt?.trim())).length,
    [decisionModelSettings],
  );

  const mergedBenchmarks = useMemo(() => {
    const map = new Map<string, DecisionBenchmarkCase>();
    for (const benchmark of [...benchmarks, ...externalBenchmarks]) {
      map.set(benchmark.id, benchmark);
    }
    return [...map.values()];
  }, [benchmarks, externalBenchmarks]);

  const selectedBenchmark = useMemo(() => {
    if (selectedBenchmarkId === CURRENT_ARTICLE_BENCHMARK_ID) return currentArticleBenchmark ?? null;
    return mergedBenchmarks.find((benchmark) => benchmark.id === selectedBenchmarkId) ?? null;
  }, [currentArticleBenchmark, mergedBenchmarks, selectedBenchmarkId]);

  useEffect(() => {
    // Skip if current draft already matches the selected benchmark (e.g., from history load)
    if (benchmarkDraft?.id === selectedBenchmark?.id) return;
    setBenchmarkDraft(selectedBenchmark ? cloneBenchmarkCase(selectedBenchmark) : null);
    setIsEditingDraft(false);
  }, [selectedBenchmark, benchmarkDraft?.id]);

  const currentBenchmarkHistory = useMemo(
    () => benchmarkHistory.filter((item) => item.result.benchmark.id === benchmarkDraft?.id),
    [benchmarkDraft?.id, benchmarkHistory],
  );

  const currentSavedRuns = useMemo(
    () => savedRuns.filter((item) => item.benchmarkId === benchmarkDraft?.id),
    [savedRuns, benchmarkDraft?.id],
  );

  const previousRun = currentBenchmarkHistory[0]?.result ?? null;
  const selectedBenchmarkNotes = useMemo(() => parseBenchmarkNotes(benchmarkDraft?.notes), [benchmarkDraft?.notes]);
  const validation = useMemo(() => validateBenchmarkCase(benchmarkDraft, touchedFields), [benchmarkDraft, touchedFields]);
  const isFormValid = useMemo(() => isValidationValid(validation), [validation]);

  // Extract industry detection info from benchmark result if available
  const detectedIndustries = useMemo(() => {
    if (!benchmarkResult?.evaluation.reasoning) return [];
    const reasoning = benchmarkResult.evaluation.reasoning.toLowerCase();
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
      if (keywords.some(keyword => reasoning.includes(keyword))) {
        industries.push(industry);
      }
    }

    return industries;
  }, [benchmarkResult]);

  const confidenceScore = useMemo(() => {
    if (!benchmarkResult) return 0;
    return Math.round(benchmarkResult.evaluation.score);
  }, [benchmarkResult]);

  async function refreshBenchmarks() {
    const result = await listDecisionBenchmarks();
    if ("error" in result) return;
    setBenchmarks(result);
  }

  async function refreshSavedRuns() {
    const result = await listSavedDecisionBenchmarkRuns();
    if ("error" in result) return;
    setSavedRuns(result);
  }

  function updateDraft(updater: (current: DecisionBenchmarkCase) => DecisionBenchmarkCase) {
    setBenchmarkDraft((current) => (current ? updater(current) : current));
  }

  function handleFieldBlur(fieldName: string) {
    setTouchedFields((prev) => new Set(prev).add(fieldName));
  }

  async function handleRunBenchmark() {
    if (!benchmarkDraft) return;
    setIsRunning(true);
    setRunStage("validating");
    setError(null);
    setApplyFeedback(null);

    // Simulate validation stage
    await new Promise(resolve => setTimeout(resolve, 500));

    setRunStage("running");
    const result = await runDecisionBenchmarkApi(benchmarkDraft, {
      pipelineModelSettings: decisionModelSettings,
      stagePolicies,
    });

    if ("error" in result) {
      setError(result.error);
      setBenchmarkResult(null);
      setIsRunning(false);
      setRunStage("idle");
      return;
    }

    setBenchmarkResult(result);
    setComparison(previousRun ? compareDecisionBenchmarkRuns(previousRun, result) : null);
    saveBenchmarkRun(result);

    setRunStage("applying");
    const saveResult = await saveDecisionBenchmarkRun(result);
    if ("error" in saveResult) {
      setError(saveResult.error);
    } else {
      setApplyFeedback(`Oracle feedback 저장 완료: ${saveResult.filename}`);
      await refreshSavedRuns();
    }

    setRunStage("complete");
    setIsRunning(false);

    // Reset stage after animation
    setTimeout(() => setRunStage("idle"), 2000);
  }

  function handleGenerateFromCurrentArticle() {
    if (!currentArticleBenchmark) return;
    setSelectedBenchmarkId(CURRENT_ARTICLE_BENCHMARK_ID);
    setBenchmarkDraft(cloneBenchmarkCase(currentArticleBenchmark));
    setBenchmarkResult(null);
    setComparison(null);
    setSelectedCompareKeys([]);
    setSelectedFileCompareRuns(null);
    setSelectedFileComparison(null);
    setApplyFeedback("현재 기사/rawJson으로 benchmark scenario를 생성했습니다.");
    setError(null);
    setIsEditingDraft(false);
  }

  async function handleSaveCurrentArticleBenchmark() {
    if (!currentArticleBenchmark) return;
    setIsSavingArticleCase(true);
    setError(null);
    const result = await saveDecisionBenchmarkCase(benchmarkDraft ?? currentArticleBenchmark);
    if ("error" in result) {
      setError(result.error);
      setIsSavingArticleCase(false);
      return;
    }
    await refreshBenchmarks();
    setSelectedBenchmarkId((benchmarkDraft ?? currentArticleBenchmark).id);
    setApplyFeedback(`현재 기사 benchmark 저장 완료: ${result.filename}`);
    setIsSavingArticleCase(false);
  }

  async function handleSaveEditedBenchmark() {
    if (!benchmarkDraft) return;
    setIsSavingDraft(true);
    setError(null);
    const result = await saveDecisionBenchmarkCase(benchmarkDraft);
    if ("error" in result) {
      setError(result.error);
      setIsSavingDraft(false);
      return;
    }
    await refreshBenchmarks();
    setSelectedBenchmarkId(benchmarkDraft.id);
    setApplyFeedback(`편집한 benchmark 저장 완료: ${result.filename}`);
    setIsEditingDraft(false);
    setIsSavingDraft(false);
  }

  function handleApplySuggestedSettings() {
    if (!benchmarkResult?.suggestedModelSettings) return;
    onApplySuggestedSettings(benchmarkResult.suggestedModelSettings);
    setApplyFeedback("Oracle feedback를 다음 benchmark 설정에 적용했습니다.");
  }

  async function handleRunAndApply() {
    if (!benchmarkDraft) return;
    setIsRunningAndApplying(true);
    setRunStage("validating");
    setError(null);
    setApplyFeedback(null);

    // Simulate validation stage
    await new Promise(resolve => setTimeout(resolve, 500));

    setRunStage("running");
    const result = await runDecisionBenchmarkApi(benchmarkDraft, {
      pipelineModelSettings: decisionModelSettings,
      stagePolicies,
    });

    if ("error" in result) {
      setError(result.error);
      setBenchmarkResult(null);
      setIsRunningAndApplying(false);
      setRunStage("idle");
      return;
    }

    setBenchmarkResult(result);
    setComparison(previousRun ? compareDecisionBenchmarkRuns(previousRun, result) : null);
    saveBenchmarkRun(result);

    setRunStage("applying");
    const saveResult = await saveDecisionBenchmarkRun(result);
    if ("error" in saveResult) {
      setError(saveResult.error);
    } else {
      await refreshSavedRuns();
    }

    // Auto-apply suggested settings if available
    if (result.suggestedModelSettings) {
      await new Promise(resolve => setTimeout(resolve, 300));
      onApplySuggestedSettings(result.suggestedModelSettings);
      setApplyFeedback("Applied successfully - 제안된 설정을 decision pipeline에 자동 적용했습니다.");
    } else {
      setApplyFeedback("Benchmark 실행 완료 - 제안된 설정이 없습니다.");
    }

    setRunStage("complete");
    setIsRunningAndApplying(false);

    // Reset stage after animation
    setTimeout(() => setRunStage("idle"), 2000);
  }

  function handleLoadHistory(record: StoredDecisionBenchmarkRun) {
    const loaded = loadBenchmarkRun(record);
    // Restore the original benchmark from history, not from current catalog
    setBenchmarkDraft(cloneBenchmarkCase(loaded.benchmark));
    setSelectedBenchmarkId(loaded.benchmark.id);
    setBenchmarkResult(loaded);
    setTouchedFields(new Set()); // Reset touched fields on load
    const previous = benchmarkHistory.find(
      (item) => item.result.benchmark.id === loaded.benchmark.id && item.storageKey !== record.storageKey,
    );
    setComparison(previous ? compareDecisionBenchmarkRuns(previous.result, loaded) : null);
    setApplyFeedback(`과거 런의 시나리오를 복원했습니다 (${formatDecisionBenchmarkDate(record.timestamp)})`);
    setError(null);
  }

  async function toggleFileCompare(summary: DecisionBenchmarkFileSummary) {
    const nextKeys = selectedCompareKeys.includes(summary.filename)
      ? selectedCompareKeys.filter((key) => key !== summary.filename)
      : [...selectedCompareKeys, summary.filename].slice(-2);
    setSelectedCompareKeys(nextKeys);

    if (nextKeys.length !== 2) {
      setSelectedFileCompareRuns(null);
      setSelectedFileComparison(null);
      return;
    }

    const loaded = await Promise.all(nextKeys.map((filename) => loadSavedDecisionBenchmarkRun(filename)));
    if (loaded.some((item) => "error" in item)) {
      setError("선택한 파일 런을 불러오지 못했습니다.");
      setSelectedFileCompareRuns(null);
      setSelectedFileComparison(null);
      return;
    }

    const runs = loaded as DecisionBenchmarkRun[];
    setSelectedFileCompareRuns(runs);
    setSelectedFileComparison(compareDecisionBenchmarkRuns(runs[1], runs[0]));
    setError(null);
  }

  function toggleHistoryCompare(storageKey: string) {
    const nextKeys = selectedHistoryKeys.includes(storageKey)
      ? selectedHistoryKeys.filter((key) => key !== storageKey)
      : [...selectedHistoryKeys, storageKey].slice(-2);
    setSelectedHistoryKeys(nextKeys);
  }

  function handleShowHistoryDiff() {
    if (selectedHistoryKeys.length !== 2) return;
    setShowHistoryDiffModal(true);
  }

  function getSelectedHistoryRuns(): [StoredDecisionBenchmarkRun, StoredDecisionBenchmarkRun] {
    const filtered = currentBenchmarkHistory.filter((item) => selectedHistoryKeys.includes(item.storageKey));
    return filtered as [StoredDecisionBenchmarkRun, StoredDecisionBenchmarkRun];
  }

  const disableScenarioSelect = isRunning || isLoadingList || (mergedBenchmarks.length === 0 && !currentArticleBenchmark);

  return (
    <section className="decisionBenchmark panel">
      <div className="sectionHeader">
        <div>
          <h2 className="panelTitle">Decision Benchmark Loop</h2>
          <p className="panelLead">
            고정 회귀 시나리오뿐 아니라 현재 기사/rawJson이나 방금 실행한 decision run에서도 benchmark scenario를 바로 만들고 수정할 수 있습니다.
          </p>
        </div>
        <div className="producerFlowPills">
          <span className="summaryPill">tuned decision stages: {tunedDecisionStages}</span>
          {benchmarkResult ? <span className="summaryPill summaryPillAccent">verdict: {benchmarkResult.evaluation.verdict}</span> : null}
        </div>
      </div>

      <div className="decisionBenchmarkControls">
        <label className="fieldShell benchmarkField">
          <span className="fieldLabel">Benchmark Scenario</span>
          <select
            className="selectInput"
            value={selectedBenchmarkId}
            onChange={(event) => setSelectedBenchmarkId(event.target.value)}
            disabled={disableScenarioSelect}
          >
            {currentArticleBenchmark ? (
              <option value={CURRENT_ARTICLE_BENCHMARK_ID}>{currentArticleBenchmark.title}</option>
            ) : null}
            {mergedBenchmarks.map((benchmark) => (
              <option key={benchmark.id} value={benchmark.id}>
                {benchmark.title}
              </option>
            ))}
          </select>
        </label>

        <div className="inlineActions benchmarkActions benchmarkActionsWrap">
          <button type="button" className="secondaryButton" onClick={handleGenerateFromCurrentArticle} disabled={!currentArticleBenchmark || isRunning}>
            현재 기사에서 생성
          </button>
          <button type="button" className="secondaryButton" onClick={() => void handleSaveCurrentArticleBenchmark()} disabled={!currentArticleBenchmark || isSavingArticleCase}>
            {isSavingArticleCase ? "저장 중..." : "현재 기사를 benchmark로 저장"}
          </button>
          <button type="button" className="secondaryButton" onClick={() => setIsEditingDraft((prev) => !prev)} disabled={disabled || !benchmarkDraft}>
            {isEditingDraft ? "편집 닫기" : "편집 시작"}
          </button>
          <button type="button" className="primaryButton" onClick={handleRunBenchmark} disabled={disabled || !benchmarkDraft || isRunning || isLoadingList}>
            {isRunning ? "Benchmark 실행 중..." : "Benchmark 실행"}
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={handleApplySuggestedSettings}
            disabled={!benchmarkResult?.suggestedModelSettings}
          >
            Suggested settings 적용
          </button>
        </div>
      </div>

      {benchmarkDraft ? (
        <div className="decisionBenchmarkCard benchmarkPreviewCard">
          <div className="metaRow">
            <span className="metaLabel">Selected scenario preview</span>
            <span className="summaryPill">stakeholders {benchmarkDraft.input.stakeholders?.length ?? 0}</span>
            <span className="summaryPill">criteria {benchmarkDraft.expectedCriteria.length}</span>
            {isEditingDraft ? <span className="summaryPill summaryPillAccent">editing</span> : null}
          </div>
          <div className="benchmarkPreviewGrid">
            <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
              <strong>Title</strong>
              {isEditingDraft ? (
                <input
                  className="textInput"
                  value={benchmarkDraft.title}
                  onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))}
                />
              ) : (
                <p className="benchmarkComment">{benchmarkDraft.title}</p>
              )}
            </label>
            <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
              <strong>Task</strong>
              {isEditingDraft ? (
                <>
                  <textarea
                    className={`promptInput ${!validation.task.isValid && validation.task.touched ? "field-error" : ""}`}
                    rows={4}
                    value={benchmarkDraft.input.task}
                    onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, task: event.target.value } }))}
                    onBlur={() => handleFieldBlur("task")}
                  />
                  {!validation.task.isValid && validation.task.touched && validation.task.message && (
                    <p className="field-warning validation-animated">{validation.task.message}</p>
                  )}
                </>
              ) : (
                <p className="benchmarkComment">{benchmarkDraft.input.task}</p>
              )}
            </label>
            <label className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
              <strong>Background</strong>
              {isEditingDraft ? (
                <textarea
                  className="promptInput"
                  rows={4}
                  value={benchmarkDraft.input.background ?? ""}
                  onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, background: event.target.value || undefined } }))}
                />
              ) : (
                <p className="benchmarkComment">{benchmarkDraft.input.background ?? "-"}</p>
              )}
            </label>
            <div className="benchmarkPreviewBlock benchmarkPreviewBlockWide">
              <strong>Metadata</strong>
              {isEditingDraft ? (
                <textarea
                  className="promptInput"
                  rows={3}
                  value={selectedBenchmarkNotes.join("\n")}
                  onChange={(event) => updateDraft((current) => ({ ...current, notes: splitLines(event.target.value).join(" | ") || undefined }))}
                />
              ) : (
                <div className="benchmarkTagList">
                  {selectedBenchmarkNotes.map((note) => (
                    <span key={note} className="summaryPill">{note}</span>
                  ))}
                </div>
              )}
            </div>
            <label className="benchmarkPreviewBlock">
              <strong>Stakeholders</strong>
              {isEditingDraft ? (
                <>
                  <textarea
                    className={`promptInput ${!validation.stakeholders.isValid && validation.stakeholders.touched ? "field-error" : ""}`}
                    rows={8}
                    value={(benchmarkDraft.input.stakeholders ?? []).join("\n")}
                    onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, stakeholders: splitLines(event.target.value) } }))}
                    onBlur={() => handleFieldBlur("stakeholders")}
                  />
                  {!validation.stakeholders.isValid && validation.stakeholders.touched && validation.stakeholders.message && (
                    <p className="field-warning validation-animated">{validation.stakeholders.message}</p>
                  )}
                </>
              ) : (
                <ul className="benchmarkList benchmarkCompactList">
                  {(benchmarkDraft.input.stakeholders ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </label>
            <label className="benchmarkPreviewBlock">
              <strong>Context</strong>
              {isEditingDraft ? (
                <textarea
                  className="promptInput"
                  rows={8}
                  value={(benchmarkDraft.input.context ?? []).join("\n")}
                  onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, context: splitLines(event.target.value) } }))}
                />
              ) : (
                <ul className="benchmarkList benchmarkCompactList">
                  {(benchmarkDraft.input.context ?? []).slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </label>
            <label className="benchmarkPreviewBlock">
              <strong>Success criteria</strong>
              {isEditingDraft ? (
                <>
                  <textarea
                    className={`promptInput ${!validation.successCriteria.isValid && validation.successCriteria.touched ? "field-error" : ""}`}
                    rows={8}
                    value={(benchmarkDraft.input.successCriteria ?? []).join("\n")}
                    onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, successCriteria: splitLines(event.target.value) } }))}
                    onBlur={() => handleFieldBlur("successCriteria")}
                  />
                  {!validation.successCriteria.isValid && validation.successCriteria.touched && validation.successCriteria.message && (
                    <p className="field-warning validation-animated">{validation.successCriteria.message}</p>
                  )}
                </>
              ) : (
                <ul className="benchmarkList benchmarkCompactList">
                  {(benchmarkDraft.input.successCriteria ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </label>
            <label className="benchmarkPreviewBlock">
              <strong>Expected criteria</strong>
              {isEditingDraft ? (
                <>
                  <textarea
                    className={`promptInput ${!validation.expectedCriteria.isValid && validation.expectedCriteria.touched ? "field-error" : ""}`}
                    rows={8}
                    value={benchmarkDraft.expectedCriteria.join("\n")}
                    onChange={(event) => updateDraft((current) => ({ ...current, expectedCriteria: splitLines(event.target.value) }))}
                    onBlur={() => handleFieldBlur("expectedCriteria")}
                  />
                  {!validation.expectedCriteria.isValid && validation.expectedCriteria.touched && validation.expectedCriteria.message && (
                    <p className="field-warning validation-animated">{validation.expectedCriteria.message}</p>
                  )}
                </>
              ) : (
                <ul className="benchmarkList benchmarkCompactList">
                  {benchmarkDraft.expectedCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </label>
          </div>
          {isEditingDraft ? (
            <div className="inlineActions benchmarkActions benchmarkActionsWrap">
              <button type="button" className="secondaryButton" onClick={() => setBenchmarkDraft(selectedBenchmark ? cloneBenchmarkCase(selectedBenchmark) : null)}>
                편집 취소
              </button>
              <button type="button" className="secondaryButton" onClick={() => void handleSaveEditedBenchmark()} disabled={isSavingDraft || !isFormValid}>
                {isSavingDraft ? "benchmark 저장 중..." : "편집본 저장"}
              </button>
              <button
                type="button"
                className="run-apply-btn"
                onClick={() => void handleRunAndApply()}
                disabled={isRunningAndApplying || isRunning || !isFormValid}
              >
                {isRunningAndApplying || isRunning ? (
                  <span className="run-apply-content">
                    <span className="run-spinner"></span>
                    <span className="run-text">
                      {runStage === "validating" && "Validating..."}
                      {runStage === "running" && "Running benchmark..."}
                      {runStage === "applying" && "Applying settings..."}
                      {runStage === "complete" && "✓ Complete!"}
                    </span>
                  </span>
                ) : (
                  "▶ Run & Apply"
                )}
                {(isRunningAndApplying || isRunning) && (
                  <div className="run-progress-bar">
                    <div
                      className="run-progress-fill"
                      style={{
                        width: runStage === "validating" ? "25%" : runStage === "running" ? "60%" : runStage === "applying" ? "85%" : "100%",
                      }}
                    ></div>
                  </div>
                )}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="errorText">{error}</p> : null}
      {applyFeedback ? <p className="successText">{applyFeedback}</p> : null}

      {benchmarkResult ? (
        <div className="decisionBenchmarkGrid">
          <div className="decisionBenchmarkCard">
            <span className="metaLabel">Score</span>
            <div className="benchmarkScoreRow">
              <strong className="benchmarkScore">{Math.round(benchmarkResult.evaluation.score)}</strong>
              <span className="summaryPill">{benchmarkResult.evaluation.verdict}</span>
            </div>
            <p className="panelLead">{benchmarkResult.evaluation.reasoning}</p>

            {/* Multi-industry detection display */}
            {detectedIndustries.length > 0 && (
              <div className="industry-detection-section">
                <span className="metaLabel">Detected Industries</span>
                <div className="industry-badge-list">
                  {detectedIndustries.map((industry) => (
                    <span key={industry} className="industry-badge">
                      {industry}
                    </span>
                  ))}
                </div>
                <div className="confidence-section">
                  <span className="confidence-label">Confidence</span>
                  <div className="confidence-bar-container">
                    <div
                      className="confidence-bar-fill"
                      style={{ width: `${confidenceScore}%` }}
                    ></div>
                  </div>
                  <span className="confidence-value">{confidenceScore}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="decisionBenchmarkCard">
            <span className="metaLabel">Protocol notes</span>
            <ul className="benchmarkList">
              {(benchmarkResult.promptTuningNotes && benchmarkResult.promptTuningNotes.length > 0
                ? benchmarkResult.promptTuningNotes
                : benchmarkResult.evaluation.improvementHypotheses
              ).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>

          {comparison ? (
            <div className="decisionBenchmarkCard">
              <span className="metaLabel">Previous run diff</span>
              <div className="benchmarkDiffStats">
                <span className="summaryPill summaryPillAccent">score {comparison.scoreDelta >= 0 ? "+" : ""}{comparison.scoreDelta.toFixed(1)}</span>
                <span className="summaryPill">verdict {comparison.verdictChanged ? "changed" : "same"}</span>
                <span className="summaryPill">suggested stages {comparison.suggestedStageCountDelta >= 0 ? "+" : ""}{comparison.suggestedStageCountDelta}</span>
              </div>
              <ul className="benchmarkList benchmarkCompactList">
                {comparison.changedCriteria.slice(0, 4).map((item) => (
                  <li key={item.criterion}>{item.criterion}: {Math.round(item.previousScore)} → {Math.round(item.currentScore)}</li>
                ))}
                {comparison.addedNotes.slice(0, 2).map((note) => (
                  <li key={`add-${note}`}>새 note: {note}</li>
                ))}
                {comparison.removedNotes.slice(0, 2).map((note) => (
                  <li key={`remove-${note}`}>사라진 note: {note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="decisionBenchmarkCard decisionBenchmarkCardWide">
            <span className="metaLabel">Breakdown</span>
            <div className="benchmarkBreakdownList">
              {benchmarkResult.evaluation.breakdown.map((item) => (
                <article key={item.criterion} className="benchmarkBreakdownItem">
                  <div className="metaRow">
                    <strong>{item.criterion}</strong>
                    <span className="summaryPill">{Math.round(item.score)}</span>
                  </div>
                  <p className="benchmarkComment">{item.comment}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {selectedFileComparison && selectedFileCompareRuns ? (
        <div className="decisionBenchmarkCard decisionBenchmarkCardWide">
          <span className="metaLabel">Selected run diff</span>
          <div className="benchmarkDiffStats">
            <span className="summaryPill summaryPillAccent">score {selectedFileComparison.scoreDelta >= 0 ? "+" : ""}{selectedFileComparison.scoreDelta.toFixed(1)}</span>
            <span className="summaryPill">verdict {selectedFileComparison.verdictChanged ? "changed" : "same"}</span>
            <span className="summaryPill">runs 2 selected</span>
          </div>
          <ul className="benchmarkList benchmarkCompactList">
            {selectedFileComparison.changedCriteria.slice(0, 6).map((item) => (
              <li key={item.criterion}>{item.criterion}: {Math.round(item.previousScore)} → {Math.round(item.currentScore)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="decisionBenchmarkCard decisionBenchmarkHistoryCard">
        <div className="metaRow">
          <span className="metaLabel">History</span>
          <div className="producerFlowPills">
            <span className="summaryPill">{currentBenchmarkHistory.length} local runs</span>
            {selectedHistoryKeys.length === 2 && (
              <button type="button" className="secondaryButton" onClick={handleShowHistoryDiff}>
                Compare ({selectedHistoryKeys.length} selected)
              </button>
            )}
          </div>
        </div>
        <p className="panelLead">두 개를 선택하면 버전 간 diff를 비교할 수 있습니다.</p>
        <div className="benchmarkHistoryList">
          {currentBenchmarkHistory.length > 0 ? (
            currentBenchmarkHistory.slice(0, 8).map((record) => {
              const isSelected = selectedHistoryKeys.includes(record.storageKey);
              return (
                <button
                  key={record.storageKey}
                  type="button"
                  className={`benchmarkHistoryItem${isSelected ? " benchmarkHistoryItemSelected" : ""}`}
                  onClick={() => toggleHistoryCompare(record.storageKey)}
                >
                  <div>
                    <strong>{formatDecisionBenchmarkDate(record.timestamp)}</strong>
                    <p className="benchmarkHistoryTitle">{record.result.benchmark.title}</p>
                  </div>
                  <div className="benchmarkHistoryMeta">
                    <span className="summaryPill">{Math.round(record.result.evaluation.score)}</span>
                    <span className="summaryPill">{record.result.evaluation.verdict}</span>
                    <span className="summaryPill">{isSelected ? "selected" : "select"}</span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="panelLead">아직 저장된 benchmark 런이 없습니다.</p>
          )}
        </div>
      </div>

      <div className="decisionBenchmarkCard decisionBenchmarkHistoryCard">
        <div className="metaRow">
          <span className="metaLabel">Saved files</span>
          <span className="summaryPill">{isLoadingSavedRuns ? "loading..." : `${currentSavedRuns.length} files`}</span>
        </div>
        <p className="panelLead">두 개를 선택하면 파일 기준 diff를 바로 비교합니다.</p>
        <div className="benchmarkHistoryList">
          {currentSavedRuns.length > 0 ? (
            currentSavedRuns.slice(0, 10).map((record) => {
              const selected = selectedCompareKeys.includes(record.filename);
              return (
                <button
                  key={record.filename}
                  type="button"
                  className={`benchmarkHistoryItem${selected ? " benchmarkHistoryItemSelected" : ""}`}
                  onClick={() => void toggleFileCompare(record)}
                >
                  <div>
                    <strong>{record.filename}</strong>
                    <p className="benchmarkHistoryTitle">{record.benchmarkTitle}</p>
                  </div>
                  <div className="benchmarkHistoryMeta">
                    <span className="summaryPill">{Math.round(record.score)}</span>
                    <span className="summaryPill">{record.verdict}</span>
                    <span className="summaryPill">{selected ? "selected" : "compare"}</span>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="panelLead">아직 파일로 저장된 benchmark 런이 없습니다.</p>
          )}
        </div>
      </div>

      {/* History Diff Modal */}
      {showHistoryDiffModal && selectedHistoryKeys.length === 2 ? (
        <HistoryDiffModal
          runs={getSelectedHistoryRuns()}
          onClose={() => setShowHistoryDiffModal(false)}
          diffViewMode={diffViewMode}
          onToggleDiffMode={() => setDiffViewMode(prev => prev === "side-by-side" ? "unified" : "side-by-side")}
          diffExpanded={diffExpanded}
          onToggleExpanded={() => setDiffExpanded(prev => !prev)}
        />
      ) : null}
    </section>
  );
}

function HistoryDiffModal({
  runs,
  onClose,
  diffViewMode,
  onToggleDiffMode,
  diffExpanded,
  onToggleExpanded,
}: {
  runs: [StoredDecisionBenchmarkRun, StoredDecisionBenchmarkRun];
  onClose: () => void;
  diffViewMode: "side-by-side" | "unified";
  onToggleDiffMode: () => void;
  diffExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [previous, current] = runs;

  const changes = useMemo(() => {
    const diffs = deepDiff(previous.result, current.result);
    return filterBenchmarkChanges(diffs);
  }, [previous, current]);

  const renderFieldValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) return <span className="diff-null">-</span>;
    if (typeof value === "string") {
      // Try to parse as JSON for syntax highlighting
      try {
        const parsed = JSON.parse(value);
        return <pre className="diff-json">{JSON.stringify(parsed, null, 2)}</pre>;
      } catch {
        return <span className="diff-string">{value}</span>;
      }
    }
    if (typeof value === "number") return <span className="diff-number">{value}</span>;
    if (typeof value === "boolean") return <span className="diff-boolean">{String(value)}</span>;
    if (Array.isArray(value)) {
      return (
        <ul className="diff-array">
          {value.map((item, idx) => (
            <li key={idx}>{renderFieldValue(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      return (
        <div className="diff-object">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="diff-object-entry">
              <span className="diff-object-key">{k}:</span> {renderFieldValue(v)}
            </div>
          ))}
        </div>
      );
    }
    return <span className="diff-string">{String(value)}</span>;
  };

  const renderField = (
    label: string,
    oldValue: unknown,
    newValue: unknown,
    changeType: "added" | "removed" | "changed" | "unchanged",
  ) => {
    const className =
      changeType === "added"
        ? "diff-added"
        : changeType === "removed"
          ? "diff-removed"
          : changeType === "changed"
            ? "diff-changed"
            : "diff-unchanged";

    return (
      <div key={label} className={`diff-field ${className}`}>
        <div className="diff-field-label">{label}</div>
        {changeType !== "added" && <div className="diff-field-value">{renderFieldValue(oldValue)}</div>}
        {changeType !== "removed" && (
          <div className="diff-field-value">
            {changeType === "changed" && "→ "}
            {renderFieldValue(newValue)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <h3 className="diff-modal-title">Benchmark Draft Comparison</h3>
          <div className="diff-modal-actions">
            <button
              className="diff-view-toggle"
              onClick={onToggleDiffMode}
              type="button"
            >
              {diffViewMode === "side-by-side" ? "→ Unified View" : "→ Side-by-Side"}
            </button>
            <button className="diff-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        {diffViewMode === "unified" ? (
          <div className="diff-modal-body-unified">
            <div className="diff-panel-unified">
              <div className="diff-panel-header">
                <button
                  className="diff-expand-toggle"
                  onClick={onToggleExpanded}
                  type="button"
                >
                  {diffExpanded ? "▼ Collapse" : "▶ Expand"}
                </button>
                <span>Unified Diff</span>
              </div>
              {diffExpanded && (
                <div className="diff-fields-unified">
                  {changes.length === 0 ? (
                    <p className="panelLead">No changes found</p>
                  ) : (
                    changes.map((change, idx) => {
                      const changeLabel =
                        change.type === "added"
                          ? "ADDED"
                          : change.type === "removed"
                            ? "REMOVED"
                            : change.type === "array-item-added"
                              ? "ADDED"
                              : change.type === "array-item-removed"
                                ? "REMOVED"
                                : "CHANGED";
                      const changeClass =
                        change.type === "added" || change.type === "array-item-added"
                          ? "diff-added"
                          : change.type === "removed" || change.type === "array-item-removed"
                            ? "diff-removed"
                            : "diff-changed";

                      return (
                        <div key={idx} className={`diff-field-unified ${changeClass}`}>
                          <div className="diff-field-label">
                            <span className="diff-change-type">{changeLabel}</span>
                            <span className="diff-field-path">{formatPath(change.path)}</span>
                          </div>
                          <div className="diff-field-value">
                            {change.type === "changed" ? (
                              <>
                                <div className="diff-old-value">
                                  <span className="diff-value-label">Old: </span>
                                  {renderFieldValue(change.oldValue)}
                                </div>
                                <div className="diff-new-value">
                                  <span className="diff-value-label">New: </span>
                                  {renderFieldValue(change.newValue)}
                                </div>
                              </>
                            ) : (
                              renderFieldValue(change.value)
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="diff-modal-body">
            <div className="diff-panel">
              <div className="diff-panel-header">
                {formatDecisionBenchmarkDate(previous.timestamp)} (Previous)
              </div>
              <div className="diff-fields">
                {changes.length === 0 ? (
                  <p className="panelLead">No changes found</p>
                ) : (
                  changes.map((change) => {
                    if (change.type === "added") {
                      return null;
                    }
                    if (change.type === "removed") {
                      return renderField(formatPath(change.path), change.value, null, "removed");
                    }
                    if (change.type === "array-item-removed") {
                      return renderField(formatPath(change.path), change.value, null, "removed");
                    }
                    if (change.type === "changed") {
                      return renderField(formatPath(change.path), change.oldValue, change.newValue, "changed");
                    }
                    return null;
                  })
                )}
              </div>
            </div>
            <div className="diff-panel">
              <div className="diff-panel-header">
                {formatDecisionBenchmarkDate(current.timestamp)} (Current)
              </div>
              <div className="diff-fields">
                {changes.length === 0 ? (
                  <p className="panelLead">No changes found</p>
                ) : (
                  changes.map((change) => {
                    if (change.type === "added") {
                      return renderField(formatPath(change.path), null, change.value, "added");
                    }
                    if (change.type === "array-item-added") {
                      return renderField(formatPath(change.path), null, change.value, "added");
                    }
                    if (change.type === "removed" || change.type === "array-item-removed") {
                      return null;
                    }
                    if (change.type === "changed") {
                      return renderField(formatPath(change.path), change.oldValue, change.newValue, "changed");
                    }
                    return null;
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
