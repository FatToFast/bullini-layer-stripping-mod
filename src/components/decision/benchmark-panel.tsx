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

const CURRENT_ARTICLE_BENCHMARK_ID = "__current_article__";

type Props = {
  decisionModelSettings: DecisionModelSettings;
  stagePolicies?: DecisionPipelineOptions["stagePolicies"];
  onApplySuggestedSettings: (settings: DecisionModelSettings) => void;
  currentArticleBenchmark?: DecisionBenchmarkCase | null;
  externalBenchmarks?: DecisionBenchmarkCase[];
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
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingArticleCase, setIsSavingArticleCase] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingSavedRuns, setIsLoadingSavedRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);
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
    setBenchmarkDraft(selectedBenchmark ? cloneBenchmarkCase(selectedBenchmark) : null);
    setIsEditingDraft(false);
  }, [selectedBenchmark]);

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

  async function handleRunBenchmark() {
    if (!benchmarkDraft) return;
    setIsRunning(true);
    setError(null);
    setApplyFeedback(null);

    const result = await runDecisionBenchmarkApi(benchmarkDraft, {
      pipelineModelSettings: decisionModelSettings,
      stagePolicies,
    });

    if ("error" in result) {
      setError(result.error);
      setBenchmarkResult(null);
      setIsRunning(false);
      return;
    }

    setBenchmarkResult(result);
    setComparison(previousRun ? compareDecisionBenchmarkRuns(previousRun, result) : null);
    saveBenchmarkRun(result);
    const saveResult = await saveDecisionBenchmarkRun(result);
    if ("error" in saveResult) {
      setError(saveResult.error);
    } else {
      setApplyFeedback(`Oracle feedback 저장 완료: ${saveResult.filename}`);
      await refreshSavedRuns();
    }
    setIsRunning(false);
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

  function handleLoadHistory(record: StoredDecisionBenchmarkRun) {
    const loaded = loadBenchmarkRun(record);
    setSelectedBenchmarkId(loaded.benchmark.id);
    setBenchmarkResult(loaded);
    const previous = benchmarkHistory.find(
      (item) => item.result.benchmark.id === loaded.benchmark.id && item.storageKey !== record.storageKey,
    );
    setComparison(previous ? compareDecisionBenchmarkRuns(previous.result, loaded) : null);
    setApplyFeedback(null);
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
          <button type="button" className="secondaryButton" onClick={() => setIsEditingDraft((prev) => !prev)} disabled={!benchmarkDraft}>
            {isEditingDraft ? "편집 닫기" : "편집 시작"}
          </button>
          <button type="button" className="primaryButton" onClick={handleRunBenchmark} disabled={!benchmarkDraft || isRunning || isLoadingList}>
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
                <textarea
                  className="promptInput"
                  rows={4}
                  value={benchmarkDraft.input.task}
                  onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, task: event.target.value } }))}
                />
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
                <textarea
                  className="promptInput"
                  rows={8}
                  value={(benchmarkDraft.input.stakeholders ?? []).join("\n")}
                  onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, stakeholders: splitLines(event.target.value) } }))}
                />
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
                <textarea
                  className="promptInput"
                  rows={8}
                  value={(benchmarkDraft.input.successCriteria ?? []).join("\n")}
                  onChange={(event) => updateDraft((current) => ({ ...current, input: { ...current.input, successCriteria: splitLines(event.target.value) } }))}
                />
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
                <textarea
                  className="promptInput"
                  rows={8}
                  value={benchmarkDraft.expectedCriteria.join("\n")}
                  onChange={(event) => updateDraft((current) => ({ ...current, expectedCriteria: splitLines(event.target.value) }))}
                />
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
              <button type="button" className="primaryButton" onClick={() => void handleSaveEditedBenchmark()} disabled={isSavingDraft || !benchmarkDraft.input.task.trim()}>
                {isSavingDraft ? "benchmark 저장 중..." : "편집본 저장"}
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
          <span className="summaryPill">{currentBenchmarkHistory.length} local runs</span>
        </div>
        <div className="benchmarkHistoryList">
          {currentBenchmarkHistory.length > 0 ? (
            currentBenchmarkHistory.slice(0, 8).map((record) => (
              <button key={record.storageKey} type="button" className="benchmarkHistoryItem" onClick={() => handleLoadHistory(record)}>
                <div>
                  <strong>{formatDecisionBenchmarkDate(record.timestamp)}</strong>
                  <p className="benchmarkHistoryTitle">{record.result.benchmark.title}</p>
                </div>
                <div className="benchmarkHistoryMeta">
                  <span className="summaryPill">{Math.round(record.result.evaluation.score)}</span>
                  <span className="summaryPill">{record.result.evaluation.verdict}</span>
                </div>
              </button>
            ))
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
    </section>
  );
}
