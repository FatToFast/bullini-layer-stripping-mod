"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BenchmarkDraftCard } from "@/components/decision/benchmark-draft-card";
import { HistoryDiffModal } from "@/components/decision/history-diff-modal";
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
import { useLazyPanelActivation } from "@/hooks/use-lazy-panel-activation";
import {
  cloneBenchmarkCase,
  detectIndustriesFromReasoning,
  isValidationValid,
  parseBenchmarkNotes,
  type BenchmarkRunStage,
  validateBenchmarkCase,
} from "@/lib/decision/benchmark-panel-utils";
import { useLatestRequest } from "@/hooks/use-latest-request";

const CURRENT_ARTICLE_BENCHMARK_ID = "__current_article__";

type Props = {
  decisionModelSettings: DecisionModelSettings;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
  onApplySuggestedSettings: (settings: DecisionModelSettings) => void;
  currentArticleBenchmark?: DecisionBenchmarkCase | null;
  externalBenchmarks?: DecisionBenchmarkCase[];
  disabled?: boolean;
  deferInitialLoad?: boolean;
};

export function DecisionBenchmarkPanel({
  decisionModelSettings,
  stagePolicies,
  onApplySuggestedSettings,
  currentArticleBenchmark,
  externalBenchmarks = [],
  disabled = false,
  deferInitialLoad = false,
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
  const [runAction, setRunAction] = useState<"idle" | "run" | "run-and-apply">("idle");
  const [isSavingArticleCase, setIsSavingArticleCase] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingSavedRuns, setIsLoadingSavedRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [runStage, setRunStage] = useState<BenchmarkRunStage>("idle");
  const [diffViewMode, setDiffViewMode] = useState<"side-by-side" | "unified">("side-by-side");
  const [diffExpanded, setDiffExpanded] = useState(true);
  const runStageResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isActivated, activate, panelRef } = useLazyPanelActivation({ defer: deferInitialLoad });
  const benchmarkListRequest = useLatestRequest();
  const savedRunsRequest = useLatestRequest();
  const compareRequest = useLatestRequest();
  const benchmarkRunRequest = useLatestRequest();
  const { saveBenchmarkRun, loadBenchmarkRun } = useDecisionBenchmarkHistory({
    benchmarkHistory,
    setBenchmarkHistory,
  });
  const isBusy = runAction !== "idle";
  const isRunning = runAction === "run";
  const isRunningAndApplying = runAction === "run-and-apply";

  useEffect(() => {
    if (!isActivated) return;
    const request = benchmarkListRequest.begin();
    void (async () => {
      setIsLoadingList(true);
      const result = await listDecisionBenchmarks(request.signal);
      if (!benchmarkListRequest.isCurrent(request.requestId)) return;
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
      if (!benchmarkListRequest.isCurrent(request.requestId)) return;
      benchmarkListRequest.cancel();
    };
  }, [currentArticleBenchmark, isActivated]);

  useEffect(() => {
    if (!isActivated) return;
    const request = savedRunsRequest.begin();
    void (async () => {
      setIsLoadingSavedRuns(true);
      const result = await listSavedDecisionBenchmarkRuns(request.signal);
      if (!savedRunsRequest.isCurrent(request.requestId)) return;
      if ("error" in result) {
        setIsLoadingSavedRuns(false);
        return;
      }
      setSavedRuns(result);
      setIsLoadingSavedRuns(false);
    })();
    return () => {
      if (!savedRunsRequest.isCurrent(request.requestId)) return;
      savedRunsRequest.cancel();
    };
  }, [isActivated]);

  useEffect(() => {
    return () => {
      if (runStageResetTimeoutRef.current) {
        clearTimeout(runStageResetTimeoutRef.current);
      }
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
  const detectedIndustries = useMemo(
    () => detectIndustriesFromReasoning(benchmarkResult?.evaluation.reasoning),
    [benchmarkResult?.evaluation.reasoning],
  );

  const confidenceScore = useMemo(() => {
    if (!benchmarkResult) return 0;
    return Math.round(benchmarkResult.evaluation.score);
  }, [benchmarkResult]);

  async function refreshBenchmarks() {
    if (!isActivated) return;
    const request = benchmarkListRequest.begin();
    const result = await listDecisionBenchmarks(request.signal);
    if (!benchmarkListRequest.isCurrent(request.requestId)) return;
    if ("error" in result) return;
    setBenchmarks(result);
    benchmarkListRequest.finish(request.requestId);
  }

  async function refreshSavedRuns() {
    if (!isActivated) return;
    const request = savedRunsRequest.begin();
    const result = await listSavedDecisionBenchmarkRuns(request.signal);
    if (!savedRunsRequest.isCurrent(request.requestId)) return;
    if ("error" in result) return;
    setSavedRuns(result);
    savedRunsRequest.finish(request.requestId);
  }

  function updateDraft(updater: (current: DecisionBenchmarkCase) => DecisionBenchmarkCase) {
    setBenchmarkDraft((current) => (current ? updater(current) : current));
  }

  function handleFieldBlur(fieldName: string) {
    setTouchedFields((prev) => {
      if (prev.has(fieldName)) return prev;
      const next = new Set(prev);
      next.add(fieldName);
      return next;
    });
  }

  async function runBenchmarkFlow(mode: "run" | "run-and-apply") {
    if (!benchmarkDraft) return;
    const request = benchmarkRunRequest.begin();
    if (runStageResetTimeoutRef.current) {
      clearTimeout(runStageResetTimeoutRef.current);
      runStageResetTimeoutRef.current = null;
    }
    setRunAction(mode);
    setRunStage("validating");
    setError(null);
    setApplyFeedback(null);

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!benchmarkRunRequest.isCurrent(request.requestId)) return;

    setRunStage("running");
    const result = await runDecisionBenchmarkApi(
      benchmarkDraft,
      {
        pipelineModelSettings: decisionModelSettings,
        stagePolicies,
      },
      request.signal,
    );
    if (!benchmarkRunRequest.isCurrent(request.requestId)) return;

    if ("error" in result) {
      setError(result.error);
      setBenchmarkResult(null);
      setRunAction("idle");
      setRunStage("idle");
      return;
    }

    setBenchmarkResult(result);
    setComparison(previousRun ? compareDecisionBenchmarkRuns(previousRun, result) : null);
    saveBenchmarkRun(result);

    setRunStage("applying");
    const saveResult = await saveDecisionBenchmarkRun(result);
    if (!benchmarkRunRequest.isCurrent(request.requestId)) return;
    if ("error" in saveResult) {
      setError(saveResult.error);
    } else {
      await refreshSavedRuns();
      if (!benchmarkRunRequest.isCurrent(request.requestId)) return;
      if (mode === "run") {
        setApplyFeedback(`Oracle feedback 저장 완료: ${saveResult.filename}`);
      }
    }

    if (mode === "run-and-apply") {
      if (result.suggestedModelSettings) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!benchmarkRunRequest.isCurrent(request.requestId)) return;
        onApplySuggestedSettings(result.suggestedModelSettings);
        setApplyFeedback("Applied successfully - 제안된 설정을 decision pipeline에 자동 적용했습니다.");
      } else {
        setApplyFeedback("Benchmark 실행 완료 - 제안된 설정이 없습니다.");
      }
    }

    setRunStage("complete");
    setRunAction("idle");
    runStageResetTimeoutRef.current = setTimeout(() => {
      setRunStage("idle");
      runStageResetTimeoutRef.current = null;
    }, 2000);
    benchmarkRunRequest.finish(request.requestId);
  }

  async function handleRunBenchmark() {
    await runBenchmarkFlow("run");
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
    await runBenchmarkFlow("run-and-apply");
  }

  function handleCancelEdit() {
    setBenchmarkDraft(selectedBenchmark ? cloneBenchmarkCase(selectedBenchmark) : null);
    setTouchedFields(new Set());
    setIsEditingDraft(false);
  }

  function handleLoadHistory(record: StoredDecisionBenchmarkRun) {
    const loaded = loadBenchmarkRun(record);
    setBenchmarkDraft(cloneBenchmarkCase(loaded.benchmark));
    setSelectedBenchmarkId(loaded.benchmark.id);
    setBenchmarkResult(loaded);
    setTouchedFields(new Set());
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
    compareRequest.cancel();

    if (nextKeys.length !== 2) {
      setSelectedFileCompareRuns(null);
      setSelectedFileComparison(null);
      return;
    }

    const request = compareRequest.begin();
    const loaded = await Promise.all(nextKeys.map((filename) => loadSavedDecisionBenchmarkRun(filename, request.signal)));
    if (!compareRequest.isCurrent(request.requestId)) return;
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
    compareRequest.finish(request.requestId);
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

  const disableScenarioSelect = isBusy || isLoadingList || (mergedBenchmarks.length === 0 && !currentArticleBenchmark);

  return (
    <section
      ref={panelRef}
      className="decisionBenchmark panel"
      onPointerEnter={activate}
      onFocusCapture={activate}
    >
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
          <button type="button" className="secondaryButton" onClick={handleGenerateFromCurrentArticle} disabled={!currentArticleBenchmark || isBusy}>
            현재 기사에서 생성
          </button>
          <button type="button" className="secondaryButton" onClick={() => void handleSaveCurrentArticleBenchmark()} disabled={!currentArticleBenchmark || isSavingArticleCase || isBusy}>
            {isSavingArticleCase ? "저장 중..." : "현재 기사를 benchmark로 저장"}
          </button>
          <button type="button" className="secondaryButton" onClick={() => setIsEditingDraft((prev) => !prev)} disabled={disabled || !benchmarkDraft || isBusy}>
            {isEditingDraft ? "편집 닫기" : "편집 시작"}
          </button>
          <button type="button" className="primaryButton" onClick={handleRunBenchmark} disabled={disabled || !benchmarkDraft || isBusy || isLoadingList}>
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
        <BenchmarkDraftCard
          benchmarkDraft={benchmarkDraft}
          isEditingDraft={isEditingDraft}
          validation={validation}
          selectedBenchmarkNotes={selectedBenchmarkNotes}
          isSavingDraft={isSavingDraft}
          isFormValid={isFormValid}
          isRunning={isRunning}
          isRunningAndApplying={isRunningAndApplying}
          runStage={runStage}
          onUpdateDraft={updateDraft}
          onFieldBlur={handleFieldBlur}
          onCancelEdit={handleCancelEdit}
          onSaveEditedBenchmark={() => void handleSaveEditedBenchmark()}
          onRunAndApply={() => void handleRunAndApply()}
        />
      ) : null}

      {error ? <p className="errorText">{error}</p> : null}
      {applyFeedback ? <p className="successText">{applyFeedback}</p> : null}
      {!isActivated ? <p className="panelLead">패널이 화면에 들어오면 benchmark 목록과 저장된 run을 불러옵니다.</p> : null}

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

      {showHistoryDiffModal && selectedHistoryKeys.length === 2 ? (
        <HistoryDiffModal
          runs={getSelectedHistoryRuns()}
          onClose={() => setShowHistoryDiffModal(false)}
          diffViewMode={diffViewMode}
          onToggleDiffMode={() => setDiffViewMode((prev) => (prev === "side-by-side" ? "unified" : "side-by-side"))}
          diffExpanded={diffExpanded}
          onToggleExpanded={() => setDiffExpanded((prev) => !prev)}
        />
      ) : null}
    </section>
  );
}
